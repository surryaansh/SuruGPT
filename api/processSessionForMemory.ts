
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
// Removed getUserMemory and updateUserMemory imports
import { addSessionSummaryWithEmbedding } from '../services/firebaseService.js';
import { Message as AppMessage, SenderType } from '../types.js'; // Added .js extension

const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
} else {
    console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set. Memory processing functionality will be disabled.");
}

const DEFAULT_USER_ID = "default_user";
const MAX_CHARS_FOR_FULL_SESSION_SUMMARY_CONTEXT = 15000; // For 1-2 sentence summary of the full session
// MAX_MAIN_MEMORY_ENTRIES is no longer needed as we are not maintaining a rolling list in the main document.

// Helper function to create a text representation of the conversation
const getConversationAsText = (messages: AppMessage[], charLimit?: number): string => {
    let conversationText = messages.map(m => `${m.sender === SenderType.USER ? 'User' : 'AI'}: ${m.text}`).join("\n\n");
    if (charLimit && conversationText.length > charLimit) {
        conversationText = conversationText.substring(0, charLimit) + "\n\n... (conversation truncated due to length)";
        console.log(`/api/processSessionForMemory: Conversation text for processing was truncated to ${charLimit} chars.`);
    }
    return conversationText;
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!openai) {
        console.error("/api/processSessionForMemory: OpenAI client not initialized. OPENAI_API_KEY missing.");
        return res.status(500).json({ error: 'OpenAI API key not configured on the server.' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Invalid request body: must be a JSON object.' });
    }

    const { sessionId, sessionMessages } = body as { sessionId?: string, sessionMessages?: AppMessage[] };

    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'Invalid request body: "sessionId" string is required.' });
    }
    if (!sessionMessages || !Array.isArray(sessionMessages)) {
        return res.status(400).json({ error: 'Invalid request body: "sessionMessages" array is required.' });
    }
    
    if (sessionMessages.length === 0) {
      console.log("/api/processSessionForMemory: No messages in session to process for memory. Session ID:", sessionId);
      return res.status(200).json({ message: "No messages in session to process for memory." });
    }

    console.log(`/api/processSessionForMemory: Received request for session ${sessionId}. Messages count: ${sessionMessages.length}`);

    let newSessionSummaryText: string | null = null;

    try {
        const fullConversationTextForSummary = getConversationAsText(sessionMessages, MAX_CHARS_FOR_FULL_SESSION_SUMMARY_CONTEXT);
        
        const sessionSummarizationSystemPrompt = `You are an expert conversation analyst. Based on the following chat transcript, provide a compact memory entry (1–2 sentences max). This entry should summarize the entire conversation, capturing the user's key preferences, emotional tones if notable, and any important facts or decisions made that should be remembered. Respond ONLY with the 1-2 sentence memory entry.`;
        const sessionSummarizationUserPrompt = `Conversation Transcript:
---
${fullConversationTextForSummary}
---
Compact Memory Entry (1-2 sentences for future recall):`;

        console.log("/api/processSessionForMemory (Session Summary): Sending request to LLM (gpt-4.1-nano) for session summary.");
        const summaryCompletion = await openai.chat.completions.create({
            model: 'gpt-4.1-nano', // Model for session summarization, as per user request
            messages: [
                { role: 'system', content: sessionSummarizationSystemPrompt },
                { role: 'user', content: sessionSummarizationUserPrompt }
            ],
            max_tokens: 150, // Max tokens for the summary
            temperature: 0.5,
        });

        newSessionSummaryText = summaryCompletion.choices[0]?.message?.content?.trim() || null;

        if (newSessionSummaryText && newSessionSummaryText.length > 0) {
            console.log(`/api/processSessionForMemory (Session Summary): Generated compact summary for session ${sessionId}: "${newSessionSummaryText}"`);

            // Logic for updating the main memory_json_array directly is removed.
            // We only store this summary with its embedding.

            console.log("/api/processSessionForMemory (Embedding): Requesting embedding for summary using 'text-embedding-3-small'.");
            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small", // Model for embedding generation
                input: newSessionSummaryText,
            });

            if (embeddingResponse && embeddingResponse.data && embeddingResponse.data[0] && embeddingResponse.data[0].embedding) {
                const embeddingVector = embeddingResponse.data[0].embedding;
                console.log(`/api/processSessionForMemory (Embedding): Embedding generated for summary of session ${sessionId}.`);
                // Store this summary and its embedding
                await addSessionSummaryWithEmbedding(DEFAULT_USER_ID, sessionId, newSessionSummaryText, embeddingVector);
            } else {
                console.error(`/api/processSessionForMemory (Embedding): Failed to generate a valid embedding for session ${sessionId}.`, embeddingResponse);
            }

        } else {
            console.log(`/api/processSessionForMemory (Session Summary): No summary text generated by LLM for session ${sessionId}. Summary and embedding will not be stored.`);
        }
    } catch (error: any) {
        console.error('/api/processSessionForMemory (Session Summary/Embedding): Error during processing:', error);
        if (error instanceof OpenAI.APIError) {
            console.error(`/api/processSessionForMemory: OpenAI API Error Details: Status=${error.status}, Type=${error.type}, Code=${error.code}, Param=${error.param}, Message=${error.message}`);
        }
    }
    
    return res.status(200).json({ message: "Session processed for summary and embedding storage." });
}
