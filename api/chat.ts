import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { getUserMemory, updateUserMemory } from '../services/firebaseService.js';

const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
} else {
    console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set or is empty. OpenAI functionality will be disabled.");
}

const DEFAULT_USER_ID = "default_user"; // Using a default user ID as no auth is implemented
const DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND = "You are SuruGPT, a helpful and friendly AI assistant. Keep your responses concise and delightful, like a sprinkle of magic! ✨";

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!openai) {
        console.error("/api/chat: OpenAI client not initialized. OPENAI_API_KEY missing.");
        return res.status(500).json({ error: 'OpenAI API key not configured on the server. Please check Vercel environment variables.' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object') {
        console.error("/api/chat: Invalid request body: not an object or empty.", body);
        return res.status(400).json({ error: 'Invalid request body: must be a JSON object.' });
    }
    
    const messagesFromClient = body.messages as OpenAI.Chat.ChatCompletionMessageParam[];

    if (!messagesFromClient || !Array.isArray(messagesFromClient) || messagesFromClient.length === 0) {
        console.error("/api/chat: Invalid request body: 'messages' array is missing, not an array, or empty.", body);
        return res.status(400).json({ error: 'Invalid request body: "messages" array is required and cannot be empty.' });
    }

    for (const msg of messagesFromClient) {
        if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') {
            console.error("/api/chat: Invalid message structure in 'messages' array. Each message must have 'role' and 'content' strings.", messagesFromClient);
            return res.status(400).json({ error: "Invalid message structure in 'messages' array. Each message must have 'role' and 'content' as strings." });
        }
    }
    
    // Deep copy messages to avoid mutating client's original array if it's passed by reference somehow
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = JSON.parse(JSON.stringify(messagesFromClient));


    // --- Memory Fetch and Injection ---
    let userMemory: string | null = null;
    try {
        userMemory = await getUserMemory(DEFAULT_USER_ID);
    } catch (e) {
        console.error("/api/chat: Error fetching user memory, proceeding without it:", e);
    }

    let systemMessage = messages.find(m => m.role === 'system');
    if (!systemMessage) {
        messages.unshift({ role: 'system', content: DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND });
        systemMessage = messages[0] as OpenAI.Chat.ChatCompletionMessageParam;
    }
    
    let currentSystemContent = systemMessage.content as string;
    const memoryMarker = "\n\nKey information to remember about the user (ignore if not relevant to the current query):";
    const memoryRegex = new RegExp(escapeRegExp(memoryMarker) + ".*", "s");
    currentSystemContent = currentSystemContent.replace(memoryRegex, "").trim(); // Remove old memory string if present

    if (userMemory && userMemory.trim() !== "") {
        currentSystemContent += `${memoryMarker} "${userMemory}"`;
    }
    systemMessage.content = currentSystemContent.trim();
    // --- End Memory Fetch and Injection ---

    try {
        const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages,
            stream: true,
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        
        let currentAssistantResponse = "";
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
                if (!res.writableEnded) {
                    res.write(content);
                    currentAssistantResponse += content;
                } else {
                    console.warn("/api/chat: Attempted to write to an ended stream (client might have disconnected). Chunk dropped:", content);
                    break; 
                }
            }
        }
        
        if (!res.writableEnded) {
            res.end();
        }

        // --- Memory Update ---
        if (currentAssistantResponse.trim() && openai) { // Check openai again in case of long-running stream
            const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || "";
            if (lastUserMessage) { // Only update memory if there was a user message
                const memoryUpdatePrompt = \`You are a memory management system. Your task is to update a user's memory profile based on the latest conversation turn.
Current Memory Profile:
\`\`\`
${userMemory || "No existing memory."}
\`\`\`

Latest Conversation Turn:
User: "${lastUserMessage}"
AI: "${currentAssistantResponse}"

Review the latest conversation turn. Identify any new information, preferences, facts about the user, or corrections to existing facts in the memory.
Based on this, provide an updated, concise memory profile string (max 150 words).
If no significant new information or changes are needed, output the original memory profile exactly as it was provided in "Current Memory Profile".
Focus on extracting persistent facts and preferences, not just summarizing this single turn.

Updated Memory Profile:\`;

                try {
                    const memoryCompletion = await openai.chat.completions.create({
                        model: 'gpt-4o-mini', 
                        messages: [
                            { role: 'system', content: "You are an AI assistant that refines and updates a user's memory profile based on conversation. Output only the memory profile string."},
                            { role: 'user', content: memoryUpdatePrompt }
                        ],
                        max_tokens: 250, 
                        temperature: 0.3,
                    });
                    const newMemoryString = memoryCompletion.choices[0]?.message?.content?.trim();

                    if (newMemoryString) {
                        if (newMemoryString !== userMemory) {
                            await updateUserMemory(DEFAULT_USER_ID, newMemoryString);
                            console.log(\`/api/chat: User memory updated for \${DEFAULT_USER_ID}. New memory: "\${newMemoryString}"\`);
                        } else {
                            console.log(\`/api/chat: User memory for \${DEFAULT_USER_ID} remains unchanged after LLM evaluation.\`);
                        }
                    } else {
                        console.warn(\`/api/chat: Memory update LLM call returned empty for \${DEFAULT_USER_ID}. Memory not updated.\`);
                    }
                } catch (memError) {
                    console.error("/api/chat: Error during memory update LLM call:", memError);
                }
            }
        }
        // --- End Memory Update ---

    } catch (error: any) {
        console.error('/api/chat: Error during OpenAI API call or stream processing:', error);
        
        if (!res.writableEnded) {
             if (error instanceof OpenAI.APIError) {
                console.error(\`/api/chat: OpenAI API Error Details: Status=\${error.status}, Type=\${error.type}, Code=\${error.code}, Param=\${error.param}, Message=\${error.message}\`);
                res.status(error.status || 500).json({ 
                    error: \`OpenAI API Error: \${error.name || 'Unknown Error'}\`,
                    details: error.message 
                });
            } else {
                res.status(500).json({ 
                    error: 'Failed to stream response from AI.',
                    details: error.message || 'An unexpected server error occurred.'
                });
            }
        } else {
            console.error("/api/chat: Error occurred after stream response had already ended. Client connection may be broken.");
        }
    }
}
