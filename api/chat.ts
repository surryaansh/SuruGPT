
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

const DEFAULT_USER_ID = "default_user"; 
const DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND = "You are SuruGPT, a helpful and friendly AI assistant. Keep your responses concise and delightful, like a sprinkle of magic! ✨";

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRelevantMemoryEntries(memoryEntries: string[] | null, userQuery: string): string[] {
  if (!userQuery || userQuery.trim() === "" || !memoryEntries || memoryEntries.length === 0) {
    return [];
  }

  const queryWords = userQuery.toLowerCase().split(/\s+/).filter(word => word.length > 2); 
  if (queryWords.length === 0) return [];

  const relevantEntries = memoryEntries.filter(entry => {
    const entryLower = entry.toLowerCase();
    return queryWords.some(queryWord => entryLower.includes(queryWord));
  });

  return relevantEntries;
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
        if (!msg || typeof msg.role !== 'string' || !validRoles.includes(msg.role) || typeof msg.content !== 'string') {
            console.error(`/api/chat: Invalid message structure in 'messages' array. Role: ${msg?.role}, Content Type: ${typeof msg?.content}. Each message must have a valid 'role' (${validRoles.join('/')}) and 'content' as a string.`, messagesFromClient);
            return res.status(400).json({ error: `Invalid message structure. Role must be one of [${validRoles.join(', ')}] and content must be a string.` });
        }
    }
    
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = JSON.parse(JSON.stringify(messagesFromClient));

    // --- Memory Fetch and Relevance Filtering ---
    let initialUserMemoryArray: string[] | null = null;
    try {
        initialUserMemoryArray = await getUserMemory(DEFAULT_USER_ID); // Returns string[] | null
    } catch (e) {
        console.error("/api/chat: Error fetching user memory, proceeding without it:", e);
    }

    let systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam;
    const firstMessage = messages[0];

    if (firstMessage && firstMessage.role === 'system') {
        systemMessage = firstMessage as OpenAI.Chat.ChatCompletionSystemMessageParam;
    } else {
        const existingSystemMessageIndex = messages.findIndex(m => m.role === 'system');
        if (existingSystemMessageIndex !== -1) {
            const foundMessage = messages.splice(existingSystemMessageIndex, 1)[0];
            if (foundMessage.role === 'system') {
                systemMessage = foundMessage as OpenAI.Chat.ChatCompletionSystemMessageParam;
            } else {
                systemMessage = { role: 'system', content: DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND };
            }
        } else {
            systemMessage = { role: 'system', content: DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND };
        }
        messages.unshift(systemMessage);
    }
    
    let systemContentString: string;
    if (typeof systemMessage.content === 'string') {
        systemContentString = systemMessage.content;
    } else if (Array.isArray(systemMessage.content)) {
        systemContentString = systemMessage.content
            .filter((part): part is OpenAI.Chat.ChatCompletionContentPartText => part.type === 'text')
            .map(textPart => textPart.text)
            .join('');
        if (systemMessage.content.some(part => part.type !== 'text')) {
            console.warn("/api/chat: System message content included non-text parts. These were ignored.");
        }
    } else {
        systemContentString = ''; 
    }
    
    let currentSystemContent = systemContentString || DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND;

    const memoryMarkerBase = "\n\nKey information to remember about the user";
    const memoryRegex = new RegExp(escapeRegExp(memoryMarkerBase) + ".*", "s");
    currentSystemContent = currentSystemContent.replace(memoryRegex, "").trim();

    const latestUserQuery = messages.filter(m => m.role === 'user').pop()?.content as string || "";
    const relevantMemoryEntries = getRelevantMemoryEntries(initialUserMemoryArray, latestUserQuery);

    if (relevantMemoryEntries.length > 0) {
        const relevantMemoryString = relevantMemoryEntries.join('; '); // Join relevant facts
        currentSystemContent += `${memoryMarkerBase} (relevant to your current query): "${relevantMemoryString}"`;
    }
    
    systemMessage.content = currentSystemContent.trim();
    // --- End Memory Fetch and Relevance Filtering ---

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
                    console.warn("/api/chat: Attempted to write to an ended stream. Chunk dropped:", content);
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
                const userMemoryArrayStringified = initialUserMemoryArray ? JSON.stringify(initialUserMemoryArray) : "[]";
                const memoryUpdateSystemPrompt = `You are a memory management system. Your task is to update a user's memory profile based on the latest conversation turn.
The memory profile is a list of distinct facts or preferences.
Output *only* the updated JSON array of strings. For example:
["User's name is Alex.", "Prefers short answers.", "Interested in AI advancements."]`;
                
                const memoryUpdateUserPrompt = `Current Memory Profile (JSON array of strings):
\`\`\`json
${userMemoryArrayStringified}
\`\`\`

Latest Conversation Turn:
User: "${lastUserMessage}"
AI: "${currentAssistantResponse}"

Review the latest conversation turn. Identify any new information, preferences, facts about the user, or corrections to existing facts in the memory.
Update the JSON array of memory strings.
- Add new distinct facts.
- Modify existing facts if they are updated.
- Remove facts that are no longer true or relevant.
- Ensure each string in the array is a concise, standalone piece of information.
- Keep the total number of entries manageable and focused on persistent, key information.
- If no significant new information or changes are needed, output the original JSON array exactly as it was provided in "Current Memory Profile".

Updated JSON Array Memory Profile:`;

                try {
                    const memoryCompletion = await openai.chat.completions.create({
                        model: 'gpt-4o-mini', 
                        messages: [
                            { role: 'system', content: memoryUpdateSystemPrompt },
                            { role: 'user', content: memoryUpdateUserPrompt }
                        ],
                        max_tokens: 300, // Adjusted for potential JSON array
                        temperature: 0.2,
                    });
                    
                    let newMemoryArray: string[] | null = null;
                    const rawMemoryOutput = memoryCompletion.choices[0]?.message?.content?.trim();

                    if (rawMemoryOutput) {
                        try {
                            const parsedOutput = JSON.parse(rawMemoryOutput);
                            if (Array.isArray(parsedOutput) && parsedOutput.every(item => typeof item === 'string')) {
                                newMemoryArray = parsedOutput as string[];
                            } else {
                                console.warn(`/api/chat: Memory update LLM output was not a valid JSON array of strings. Output: ${rawMemoryOutput}`);
                                if (typeof rawMemoryOutput === 'string' && !rawMemoryOutput.startsWith('[') && rawMemoryOutput.length > 0) {
                                     newMemoryArray = [rawMemoryOutput];
                                     console.log("/api/chat: Salvaged plain string LLM memory output into a single-entry array.");
                                }
                            }
                        } catch (parseError) {
                            console.warn(`/api/chat: Failed to parse memory update LLM output as JSON. Output: ${rawMemoryOutput}. Error: ${parseError}`);
                             if (typeof rawMemoryOutput === 'string' && !rawMemoryOutput.startsWith('[') && rawMemoryOutput.length > 0) {
                                newMemoryArray = [rawMemoryOutput];
                                console.log("/api/chat: Salvaged plain string LLM memory output (due to parse error) into a single-entry array.");
                            }
                        }
                    }

                    if (newMemoryArray) {
                        const oldMemoryStringifiedSorted = initialUserMemoryArray ? JSON.stringify([...initialUserMemoryArray].sort()) : "[]";
                        const newMemoryStringifiedSorted = JSON.stringify([...newMemoryArray].sort());

                        if (newMemoryStringifiedSorted !== oldMemoryStringifiedSorted) {
                            await updateUserMemory(DEFAULT_USER_ID, newMemoryArray); // updateUserMemory expects string[]
                            console.log(`/api/chat: User memory updated for ${DEFAULT_USER_ID}.`);
                        } else {
                            console.log(`/api/chat: User memory for ${DEFAULT_USER_ID} remains unchanged after LLM evaluation.`);
                        }
                    } else {
                        console.warn(`/api/chat: Memory update LLM call returned or resulted in empty/invalid array for ${DEFAULT_USER_ID}. Memory not updated.`);
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
            console.error("/api/chat: Error occurred after stream response had already ended.");
        }
    }
}
