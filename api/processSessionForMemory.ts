
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import {
    addSessionSummaryWithEmbeddingAndHash,
    getMostRecentSummaryForSession
} from '../services/firebaseService.js';
import { Message as AppMessage, SenderType } from '../types.js';

const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
} else {
    console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set. Memory processing functionality will be disabled.");
}

const MAX_CHARS_FOR_FULL_SESSION_SUMMARY_CONTEXT = 15000;

const getConversationAsText = (messages: AppMessage[], charLimit?: number): string => {
    let conversationText = messages.map(m => `${m.sender === SenderType.USER ? 'User' : 'AI'}: ${m.text}`).join("\n\n");
    if (charLimit && conversationText.length > charLimit) {
        conversationText = conversationText.substring(0, charLimit) + "\n\n... (conversation truncated)";
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
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!openai) {
        console.error("/api/processSessionForMemory: OpenAI client not initialized.");
        return res.status(500).json({ error: 'OpenAI API key not configured.' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Invalid request body: must be a JSON object.' });
    }

    const { userId, sessionId, sessionMessages } = body as { userId?: string, sessionId?: string, sessionMessages?: AppMessage[] };

    if (!userId || typeof userId !== 'string') { // Validate userId
        return res.status(400).json({ error: 'Invalid request body: "userId" string is required.' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'Invalid request body: "sessionId" string is required.' });
    }
    if (!sessionMessages || !Array.isArray(sessionMessages)) {
        return res.status(400).json({ error: 'Invalid request body: "sessionMessages" array is required.' });
    }

    if (sessionMessages.length === 0) {
      console.log(`/api/processSessionForMemory (User: ${userId}): No messages in session ${sessionId} to process.`);
      return res.status(200).json({ message: "No messages in session to process." });
    }

    console.log(`/api/processSessionForMemory (User: ${userId}): Request for session ${sessionId}. Messages: ${sessionMessages.length}`);

    try {
        const currentContentHash = generateContentHash(sessionMessages);
        // Use the provided userId to fetch user-specific summary
        const mostRecentStoredSummary = await getMostRecentSummaryForSession(userId, sessionId);

        if (mostRecentStoredSummary && mostRecentStoredSummary.contentHash === currentContentHash) {
            console.log(`/api/processSessionForMemory (User: ${userId}): Session ${sessionId} content unchanged. Skipping.`);
            return res.status(200).json({ message: "Session content unchanged." });
        }
        
        console.log(`/api/processSessionForMemory (User: ${userId}): Session ${sessionId} content changed or no previous summary. Proceeding.`);

        let newSessionSummaryText: string | null = null;
        const fullConversationTextForSummary = getConversationAsText(sessionMessages, MAX_CHARS_FOR_FULL_SESSION_SUMMARY_CONTEXT);

        const sessionSummarizationSystemPrompt = `You are an expert conversation analyst. Based on the following chat transcript, provide a compact memory entry (1–2 sentences max). This entry should summarize the entire conversation, capturing the user's key preferences, emotional tones if notable, and any important facts or decisions made that should be remembered. Respond ONLY with the 1-2 sentence memory entry.`;
        const sessionSummarizationUserPrompt = `Conversation Transcript:\n---\n${fullConversationTextForSummary}\n---\nCompact Memory Entry (1-2 sentences for future recall):`;

        const summaryCompletion = await openai.chat.completions.create({
            model: 'gpt-4.1-nano',
            messages: [
                { role: 'system', content: sessionSummarizationSystemPrompt },
                { role: 'user', content: sessionSummarizationUserPrompt }
            ],
            max_tokens: 150, temperature: 0.5,
        });
        newSessionSummaryText = summaryCompletion.choices[0]?.message?.content?.trim() || null;

        if (newSessionSummaryText && newSessionSummaryText.length > 0) {
            console.log(`/api/processSessionForMemory (User: ${userId}, Session: ${sessionId}): Generated summary: "${newSessionSummaryText}"`);
            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small", input: newSessionSummaryText,
            });
            if (embeddingResponse?.data?.[0]?.embedding) {
                const embeddingVector = embeddingResponse.data[0].embedding;
                // Use the provided userId to store user-specific summary
                await addSessionSummaryWithEmbeddingAndHash(userId, sessionId, newSessionSummaryText, embeddingVector, currentContentHash);
            } else {
                console.error(`/api/processSessionForMemory (User: ${userId}, Session: ${sessionId}): Failed to generate embedding.`);
            }
        } else {
            console.log(`/api/processSessionForMemory (User: ${userId}, Session: ${sessionId}): No summary text generated.`);
        }
    } catch (error: any) {
        console.error(`/api/processSessionForMemory (User: ${userId}, Session: ${sessionId}): Error:`, error);
        if (error instanceof OpenAI.APIError) {
            console.error(`OpenAI API Error Details: Status=${error.status}, Message=${error.message}`);
        }
        return res.status(200).json({ message: "Session processed, server-side error during processing."});
    }

    return res.status(200).json({ message: "Session processed for summary and embedding storage." });
}
