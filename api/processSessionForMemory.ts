
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { Message as AppMessage, SenderType, StoredSessionSummary } from '../types.js'; // Ensure StoredSessionSummary is imported

const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
} else {
    console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set. Memory processing functionality will be disabled.");
}

// Firebase Admin SDK Initialization
let adminApp: AdminApp;
const serviceAccountString = process.env.FIREBASE_ADMIN_SDK_CONFIG;

if (serviceAccountString) {
    try {
        const serviceAccount = JSON.parse(serviceAccountString);
        if (!getApps().length) {
            adminApp = initializeApp({
                credential: cert(serviceAccount)
            });
            console.log("Firebase Admin SDK initialized successfully.");
        } else {
            adminApp = getApps()[0];
            console.log("Firebase Admin SDK already initialized.");
        }
    } catch (e: any) {
        console.error("CRITICAL_ERROR: Failed to parse FIREBASE_ADMIN_SDK_CONFIG or initialize Firebase Admin SDK.", e.message);
    }
} else {
    console.error("CRITICAL_ERROR: FIREBASE_ADMIN_SDK_CONFIG environment variable is not set. Firestore operations in this function will fail.");
}

const dbAdmin = adminApp! ? getAdminFirestore(adminApp) : null;


const USER_MEMORIES_COLLECTION = 'user_memories';
const SESSION_SUMMARIES_SUBCOLLECTION = 'session_summaries';

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

// Admin SDK version of getMostRecentSummaryForSession
async function getMostRecentSummaryForSessionAdmin(userId: string, sessionId: string): Promise<StoredSessionSummary | null> {
    if (!dbAdmin) {
        console.error("Admin Firestore not initialized in getMostRecentSummaryForSessionAdmin.");
        return null;
    }
    try {
        const summaryDocRef = dbAdmin.collection(USER_MEMORIES_COLLECTION).doc(userId).collection(SESSION_SUMMARIES_SUBCOLLECTION).doc(sessionId);
        const docSnapshot = await summaryDocRef.get();

        if (!docSnapshot.exists) {
            return null;
        }
        const docData = docSnapshot.data();
        if (!docData) return null; // Should not happen if exists, but good practice

        const createdAt = docData.createdAt; // This will be a Firestore Timestamp from Admin SDK

        return {
            id: docSnapshot.id, // which is sessionId
            sessionId: docData.sessionId, // Stored for consistency, also sessionId
            summaryText: docData.summaryText,
            embeddingVector: docData.embeddingVector,
            createdAt: createdAt instanceof AdminTimestamp ? createdAt.toDate() : new Date(createdAt), // Convert Admin SDK Timestamp
            contentHash: docData.contentHash,
        } as StoredSessionSummary;
    } catch (error) {
        console.error(`Error fetching most recent admin summary for session ${sessionId}, user ${userId}:`, error);
        return null;
    }
}

// Admin SDK version of addSessionSummaryWithEmbeddingAndHash
async function addSessionSummaryWithEmbeddingAndHashAdmin(
    userId: string,
    sessionId: string,
    summaryText: string,
    embeddingVector: number[],
    contentHash: string
): Promise<void> {
    if (!dbAdmin) {
        console.error("Admin Firestore not initialized in addSessionSummaryWithEmbeddingAndHashAdmin.");
        throw new Error("Admin Firestore not available.");
    }
    try {
        const summaryDocRef = dbAdmin.collection(USER_MEMORIES_COLLECTION).doc(userId).collection(SESSION_SUMMARIES_SUBCOLLECTION).doc(sessionId);
        
        await summaryDocRef.set({
            sessionId, // Store sessionId in the document for query consistency if needed elsewhere
            summaryText,
            embeddingVector,
            contentHash,
            createdAt: FieldValue.serverTimestamp(), // Use Admin SDK FieldValue
        }, { merge: true }); // Use merge:true to update if exists, create if not

        console.log(`Admin summary added/updated for session ${sessionId}, user ${userId}`);
    } catch (error) {
        console.error(`Error adding/updating admin session summary for session ${sessionId} (user ${userId}):`, error);
        throw error;
    }
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!openai) {
        console.error("/api/processSessionForMemory: OpenAI client not initialized.");
        return res.status(500).json({ error: 'OpenAI API key not configured.' });
    }
    if (!dbAdmin) {
        console.error("/api/processSessionForMemory: Firebase Admin Firestore client not initialized.");
        return res.status(500).json({ error: 'Firebase Admin SDK not configured correctly.' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Invalid request body: must be a JSON object.' });
    }

    const { userId, sessionId, sessionMessages } = body as { userId?: string, sessionId?: string, sessionMessages?: AppMessage[] };

    if (!userId || typeof userId !== 'string') {
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
        const mostRecentStoredSummary = await getMostRecentSummaryForSessionAdmin(userId, sessionId);

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
            model: 'gpt-4o-mini', 
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
                await addSessionSummaryWithEmbeddingAndHashAdmin(userId, sessionId, newSessionSummaryText, embeddingVector, currentContentHash);
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
            return res.status(500).json({ message: "Session processed, but an error occurred with AI service during summary/embedding."});
        }
        return res.status(500).json({ message: "Session processed, but a server-side error occurred during processing.", details: error.message });
    }

    return res.status(200).json({ message: "Session processed for summary and embedding storage." });
}
