
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
// User memory functions (getUserMemory, updateUserMemory) are no longer needed here.
// They will be used in the new api/processSessionForMemory.ts file.

const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
} else {
    console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set or is empty. OpenAI functionality will be disabled.");
}

const DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND = "You are SuruGPT, a helpful and friendly AI assistant. Keep your responses concise and delightful, like a sprinkle of magic! ✨";


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
    
    // Expect only 'messages' from the client now for this endpoint
    const { messages: messagesFromClient } = body as { 
        messages: OpenAI.Chat.ChatCompletionMessageParam[]
        // triggerMemoryUpdate flag is removed
    };


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
    
    const messagesForOpenAI: OpenAI.Chat.ChatCompletionMessageParam[] = JSON.parse(JSON.stringify(messagesFromClient));

    if (messagesForOpenAI.length === 0 || messagesForOpenAI[0].role !== 'system') {
        const systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
            role: 'system',
            content: DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND 
        };
        messagesForOpenAI.unshift(systemMessage);
        console.warn("/api/chat: System message was not the first message from client, prepended default backend system prompt.");
    }

    try {
        console.log("/api/chat: Sending to OpenAI with messages:", JSON.stringify(messagesForOpenAI, null, 2));
        const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messagesForOpenAI,
            stream: true,
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        
        // let currentAssistantResponse = ""; // Not needed here as memory update is separate
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
                if (!res.writableEnded) {
                    res.write(content);
                    // currentAssistantResponse += content; // Not needed here
                } else {
                    console.warn("/api/chat: Attempted to write to an ended stream. Chunk dropped:", content);
                    break; 
                }
            }
        }
        
        if (!res.writableEnded) {
            res.end();
        }

        // All memory update logic (conditional block based on triggerMemoryUpdate) is REMOVED from here.
        // It will reside in the new api/processSessionForMemory.ts file.

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
