
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
} else {
    console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set or is empty. OpenAI functionality will be disabled.");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!openai) {
        // This console.error was already logged at startup, but good to be explicit here too.
        console.error("/api/chat: OpenAI client not initialized. OPENAI_API_KEY missing.");
        return res.status(500).json({ error: 'OpenAI API key not configured on the server. Please check Vercel environment variables.' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object') {
        console.error("/api/chat: Invalid request body: not an object or empty.", body);
        return res.status(400).json({ error: 'Invalid request body: must be a JSON object.' });
    }
    
    const messages = body.messages as OpenAI.Chat.ChatCompletionMessageParam[];

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        console.error("/api/chat: Invalid request body: 'messages' array is missing, not an array, or empty.", body);
        return res.status(400).json({ error: 'Invalid request body: "messages" array is required and cannot be empty.' });
    }

    // Basic validation of message structure
    for (const msg of messages) {
        if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') {
            console.error("/api/chat: Invalid message structure in 'messages' array. Each message must have 'role' and 'content' strings.", messages);
            return res.status(400).json({ error: "Invalid message structure in 'messages' array. Each message must have 'role' and 'content' as strings." });
        }
    }

    try {
        const stream = await openai.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: messages,
            stream: true,
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
                if (!res.writableEnded) {
                    res.write(content);
                } else {
                    console.warn("/api/chat: Attempted to write to an ended stream (client might have disconnected). Chunk dropped:", content);
                    break; 
                }
            }
        }
        
        if (!res.writableEnded) {
            res.end();
        }

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
