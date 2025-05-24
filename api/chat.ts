import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const API_KEY = process.env.OPENAI_API_KEY;
const openai = API_KEY ? new OpenAI({ apiKey: API_KEY }) : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    if (!openai) {
        return res.status(500).json({ error: 'OpenAI API key not configured on the server. Please set OPENAI_API_KEY in Vercel environment variables.' });
    }

    // VercelRequest['body'] is already parsed if Content-Type is application/json
    const { messages } = req.body as { messages: OpenAI.Chat.ChatCompletionMessageParam[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Invalid request body: "messages" array is required and cannot be empty.' });
    }

    try {
        const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages,
            stream: true,
        });

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8'); // Client will read as text
        // Vercel automatically handles chunked encoding for streams.

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
                res.write(content);
            }
        }
        res.end(); // Important to close the stream

    } catch (error: any) {
        console.error('Error streaming from OpenAI:', error);
        // Check if headers have been sent or stream has started
        if (!res.writableEnded) {
             if (error instanceof OpenAI.APIError) {
                 res.status(error.status || 500).json({ error: `OpenAI API Error: ${error.name} - ${error.message}` });
            } else {
                res.status(500).json({ error: 'Failed to stream response from AI.' });
            }
        } else {
            // If stream already started and error occurs, log it. Client will experience broken stream.
            console.error("Error occurred after stream started. Client connection may be broken.");
        }
    }
}
