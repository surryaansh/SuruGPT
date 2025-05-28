
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import {
    addSessionSummaryWithEmbeddingAndHash,
    getMostRecentSummaryForSession
} from '../services/firebaseService.js';
import { Message as AppMessage, SenderType } from '../types.js'; // Ensure correct import from your types file

const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
} else {
    console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set. Memory processing (on tab close) will be disabled.");
}

const DEFAULT_USER_ID = "default_user";
const MAX_CHARS_FOR_FULL_SESSION_SUMMARY_CONTEXT = 15000;

const getConversationAsText = (messages: AppMessage[], charLimit?: number): string => {
    let conversationText = messages.map(m => `${m.sender === SenderType.USER ? 'User' : 'AI'}: ${m.text}`).join("\n\n");
    if (charLimit && conversationText.length > charLimit) {
        conversationText = conversationText.substring(0, charLimit) + "\n\n... (conversation truncated due to length)";
    }
    return conversationText;
};

const generateContentHash = (messages: AppMessage[]): string => {
    const stringToHash = messages.map(msg => `${msg.sender}:${msg.text}`).join('||');
    return createHash('sha256').update(stringToHash).digest('hex');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }
    
    let body;
    try {
        // navigator.sendBeacon usually sends data as Blob with type 'application/json'
        // Vercel's body parser should handle this if Content-Type is correct.
        // If it arrives as a string, we parse.
        if (typeof req.body === 'string') {
            body = JSON.parse(req.body);
        } else {
            body = req.body; // Assuming Vercel parsed it if it was JSON
        }
    } catch (e) {
        console.error("/api/handleTabCloseMemory: Error parsing request body:", e);
        res.status(400).json({ error: 'Invalid JSON in request body.' }); // Normal response for bad JSON
        return;
    }

    if (!openai) {
        console.error("/api/handleTabCloseMemory: OpenAI client not initialized.");
        res.status(204).send(''); // Respond quickly for beacon
        return;
    }

    if (!body || typeof body !== 'object') {
        console.error("/api/handleTabCloseMemory: Invalid request body from beacon (not an object or empty).");
        res.status(204).send('');
        return;
    }

    const { sessionId, sessionMessages } = body as { sessionId?: string, sessionMessages?: AppMessage[] };

    if (!sessionId || typeof sessionId !== 'string' || !sessionMessages || !Array.isArray(sessionMessages) || sessionMessages.length === 0) {
        console.warn("/api/handleTabCloseMemory: Invalid or empty data received from beacon. SessionID:", sessionId, "MsgCount:", sessionMessages?.length);
        res.status(204).send('');
        return;
    }
    
    console.log(`/api/handleTabCloseMemory: Received beacon for session ${sessionId}. Messages count: ${sessionMessages.length}`);
    
    // Respond quickly to the beacon, then process asynchronously.
    // Vercel will keep the function running for a short period after the response is sent.
    res.status(204).send('');

    // --- Asynchronous processing starts here ---
    try {
        const currentContentHash = generateContentHash(sessionMessages);
        const mostRecentStoredSummary = await getMostRecentSummaryForSession(DEFAULT_USER_ID, sessionId);

        if (mostRecentStoredSummary && mostRecentStoredSummary.contentHash === currentContentHash) {
            console.log(`/api/handleTabCloseMemory: Session ${sessionId} content unchanged (hash: ${currentContentHash}). Skipping summary generation.`);
            return; // End execution for this request
        }
        
        console.log(`/api/handleTabCloseMemory: Proceeding with summary for session ${sessionId}. Prev hash: ${mostRecentStoredSummary?.contentHash || 'N/A'}, New hash: ${currentContentHash}`);
        
        const fullConversationTextForSummary = getConversationAsText(sessionMessages, MAX_CHARS_FOR_FULL_SESSION_SUMMARY_CONTEXT);
        
        const sessionSummarizationSystemPrompt = `You are an expert conversation analyst. Based on the following chat transcript, provide a compact memory entry (1–2 sentences max). This entry should summarize the entire conversation, capturing the user's key preferences, emotional tones if notable, and any important facts or decisions made that should be remembered. Respond ONLY with the 1-2 sentence memory entry.`;
        const sessionSummarizationUserPrompt = `Conversation Transcript:
---
${fullConversationTextForSummary}
---
Compact Memory Entry (1-2 sentences for future recall):`;

        const summaryCompletion = await openai.chat.completions.create({
            model: 'gpt-4.1-nano', // As per user request for memory summarization
            messages: [
                { role: 'system', content: sessionSummarizationSystemPrompt },
                { role: 'user', content: sessionSummarizationUserPrompt }
            ],
            max_tokens: 150,
            temperature: 0.5,
        });
        const newSessionSummaryText = summaryCompletion.choices[0]?.message?.content?.trim() || null;

        if (newSessionSummaryText && newSessionSummaryText.length > 0) {
            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small", // As per user request for embeddings
                input: newSessionSummaryText,
            });
            if (embeddingResponse?.data?.[0]?.embedding) {
                const embeddingVector = embeddingResponse.data[0].embedding;
                await addSessionSummaryWithEmbeddingAndHash(DEFAULT_USER_ID, sessionId, newSessionSummaryText, embeddingVector, currentContentHash);
                 console.log(`/api/handleTabCloseMemory: Successfully processed and stored memory for session ${sessionId} from beacon.`);
            } else {
                console.error(`/api/handleTabCloseMemory (Embedding): Failed to generate a valid embedding for session ${sessionId} from beacon.`);
            }
        } else {
             console.log(`/api/handleTabCloseMemory: No summary text generated by LLM for session ${sessionId} from beacon.`);
        }

    } catch (error: any) {
        console.error('/api/handleTabCloseMemory (Async Handler): Error during processing beacon data:', error);
        if (error instanceof OpenAI.APIError) {
            console.error(`/api/handleTabCloseMemory: OpenAI API Error Details: Status=${error.status}, Type=${error.type}, Code=${error.code}, Param=${error.param}, Message=${error.message}`);
        }
        // No actual response can be sent back to the client here, as the initial 204 was already sent.
        // Errors are logged server-side.
    }
}
