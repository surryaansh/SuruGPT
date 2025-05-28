
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

    const validRoles = ['system', 'user', 'assistant', 'tool'];
    for (const msg of messagesFromClient) {
        // Assuming content is always string for simplicity based on current app structure.
        // OpenAI.Chat.ChatCompletionMessageParam allows content to be string | null | ChatCompletionContentPart[]
        if (!msg || typeof msg.role !== 'string' || !validRoles.includes(msg.role) || typeof msg.content !== 'string') {
            console.error(`/api/chat: Invalid message structure in 'messages' array. Role: ${msg?.role}, Content Type: ${typeof msg?.content}. Each message must have a valid 'role' (${validRoles.join('/')}) and 'content' as a string.`, messagesFromClient);
            return res.status(400).json({ error: `Invalid message structure. Role must be one of [${validRoles.join(', ')}] and content must be a string.` });
        }
    }
    
    // Deep copy messages to avoid mutating client's original array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = JSON.parse(JSON.stringify(messagesFromClient));


    // --- Memory Fetch and Injection ---
    let userMemory: string | null = null;
    try {
        userMemory = await getUserMemory(DEFAULT_USER_ID);
    } catch (e) {
        console.error("/api/chat: Error fetching user memory, proceeding without it:", e);
    }

    // Ensure there's one system message at the beginning and get a reference to it.
    let systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam;
    const firstMessage = messages[0];

    if (firstMessage && firstMessage.role === 'system') {
        systemMessage = firstMessage as OpenAI.Chat.ChatCompletionSystemMessageParam;
    } else {
        // If no system message or not at the start, create/move one to the start.
        const existingSystemMessageIndex = messages.findIndex(m => m.role === 'system');
        if (existingSystemMessageIndex !== -1) {
            // Remove existing system message from its current position
            const foundMessage = messages.splice(existingSystemMessageIndex, 1)[0];
             // This check is mostly for type safety, findIndex should ensure role is 'system'
            if (foundMessage.role === 'system') {
                systemMessage = foundMessage as OpenAI.Chat.ChatCompletionSystemMessageParam;
            } else {
                 // Fallback if something unexpected happened (e.g. malformed messages array despite validation)
                console.warn("/api/chat: Found message with non-system role during system message consolidation. Re-creating.");
                systemMessage = { role: 'system', content: DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND };
            }
        } else {
            systemMessage = { role: 'system', content: DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND };
        }
        messages.unshift(systemMessage); // Add/move system message to the beginning
    }
    
    let systemContentString: string;
    if (typeof systemMessage.content === 'string') {
        systemContentString = systemMessage.content;
    } else if (Array.isArray(systemMessage.content)) {
        // Handles ChatCompletionContentPartText[] or general ChatCompletionContentPart[]
        systemContentString = systemMessage.content
            .filter((part): part is OpenAI.Chat.ChatCompletionContentPartText => part.type === 'text') // Type guard for text parts
            .map(textPart => textPart.text) // textPart is now ChatCompletionContentPartText
            .join('');
        if (systemMessage.content.some(part => part.type !== 'text')) {
            console.warn("/api/chat: System message content included non-text parts. These were ignored.");
        }
    } else {
        // Handles null, undefined, or other unexpected types for systemMessage.content.
        // Given OpenAI types, content is typically string or array of parts for system messages.
        systemContentString = ''; 
    }
    
    let currentSystemContent = systemContentString || DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND;
    // Now currentSystemContent is guaranteed to be a string.

    const memoryMarker = "\n\nKey information to remember about the user (ignore if not relevant to the current query):";
    const memoryRegex = new RegExp(escapeRegExp(memoryMarker) + ".*", "s");
    
    currentSystemContent = currentSystemContent.replace(memoryRegex, "").trim(); // Error on this line (97) is now fixed

    if (userMemory && userMemory.trim() !== "") {
        currentSystemContent += `${memoryMarker} "${userMemory}"`;
    }
    
    // systemMessage.content expects a string. currentSystemContent is now a string.
    systemMessage.content = currentSystemContent.trim(); // Error on this line (102) related to currentSystemContent.trim() is now fixed
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
        if (currentAssistantResponse.trim() && openai) { 
            const lastUserMessageContent = messages.filter(m => m.role === 'user').pop()?.content;
            const lastUserMessage = typeof lastUserMessageContent === 'string' ? lastUserMessageContent : "";

            if (lastUserMessage) { 
                const memoryUpdatePrompt = `You are a memory management system. Your task is to update a user's memory profile based on the latest conversation turn.
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

Updated Memory Profile:`;

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
                            console.log(`/api/chat: User memory updated for ${DEFAULT_USER_ID}. New memory: "${newMemoryString}"`);
                        } else {
                            console.log(`/api/chat: User memory for ${DEFAULT_USER_ID} remains unchanged after LLM evaluation.`);
                        }
                    } else {
                        console.warn(`/api/chat: Memory update LLM call returned empty for ${DEFAULT_USER_ID}. Memory not updated.`);
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
                console.error(`/api/chat: OpenAI API Error Details: Status=${error.status}, Type=${error.type}, Code=${error.code}, Param=${error.param}, Message=${error.message}`);
                res.status(error.status || 500).json({ 
                    error: `OpenAI API Error: ${error.name || 'Unknown Error'}`,
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
