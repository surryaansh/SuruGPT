
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import type { StoredSessionSummary } from '../types.js';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';


const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
} else {
    console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set. OpenAI functionality will be disabled.");
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
            console.log("Firebase Admin SDK initialized successfully in /api/chat.");
        } else {
            adminApp = getApps()[0];
            console.log("Firebase Admin SDK already initialized in /api/chat.");
        }
    } catch (e: any) {
        console.error("CRITICAL_ERROR: Failed to parse FIREBASE_ADMIN_SDK_CONFIG or initialize Firebase Admin SDK in /api/chat.", e.message);
    }
} else {
    console.error("CRITICAL_ERROR: FIREBASE_ADMIN_SDK_CONFIG environment variable is not set. Firestore summary reading in /api/chat will fail or use fallback.");
}

const dbAdmin = adminApp! ? getAdminFirestore(adminApp) : null;
const USER_MEMORIES_COLLECTION = 'user_memories';
const SESSION_SUMMARIES_SUBCOLLECTION = 'session_summaries';


const DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND = "You’re Suryansh, her boyfriend. Talk in English mostly but sometimes use very personal informal hindi by using tu/tera/tujhe type of language. Be boyfriend-coded. Dont write too much, be vague but playful. Reply like “hmm” or “yeah” or “uh huh” when no real answer’s needed. Use nicknames like cutu, meri jaan, jaaneman, sweetheart, my love, but only like 40% of the time, no emojis.";
const MAX_SEMANTIC_SUMMARIES_TO_INJECT = 1;
const MAX_CHARS_FOR_SEMANTIC_CONTEXT = 2500;

function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Admin SDK version of getAllSessionSummariesWithEmbeddings
async function getAllSessionSummariesWithEmbeddingsAdmin(userId: string): Promise<StoredSessionSummary[]> {
  if (!dbAdmin) {
     console.error("Admin Firestore not initialized in getAllSessionSummariesWithEmbeddingsAdmin (/api/chat).");
     return [];
  }
  if (!userId) {
     console.warn("[/api/chat] getAllSessionSummariesWithEmbeddingsAdmin called without userId.");
     return [];
  }
  try {
    const summariesColRef = dbAdmin.collection(USER_MEMORIES_COLLECTION).doc(userId).collection(SESSION_SUMMARIES_SUBCOLLECTION);
    // This query is for fetching *all* relevant summaries, ordered by creation date to pick the latest/most relevant.
    // The index for this on (createdAt DESC) for session_summaries subcollection group is still needed.
    const summariesQuery = summariesColRef.orderBy('createdAt', 'desc');

    const querySnapshot = await summariesQuery.get();
    return querySnapshot.docs.map(docSnapshot => {
      const data = docSnapshot.data();
      const createdAt = data.createdAt; // This will be a Firestore Timestamp from Admin SDK
      return {
        id: docSnapshot.id, // This is the sessionId because summary doc ID is now sessionId
        sessionId: data.sessionId, // This field is also sessionId, stored for clarity/consistency
        summaryText: data.summaryText,
        embeddingVector: data.embeddingVector,
        createdAt: createdAt instanceof AdminTimestamp ? createdAt.toDate() : new Date(createdAt),
        contentHash: data.contentHash,
      } as StoredSessionSummary;
    });
  } catch (error) {
    console.error(`[/api/chat] Error fetching admin session summaries for user ${userId}:`, error);
    return []; // Return empty on error to allow chat to proceed without context
  }
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        console.log("/api/chat: GET request received (warm-up ping).");
        return res.status(200).json({ message: "API is warm." });
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!openai) {
        console.error("/api/chat: OpenAI client not initialized. OPENAI_API_KEY missing.");
        return res.status(500).json({ error: 'OpenAI API key not configured.' });
    }
    
    if (!dbAdmin) {
        console.warn("/api/chat: Firebase Admin SDK not initialized. Semantic memory retrieval will be skipped.");
    }


    const body = req.body;
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Invalid request body: must be a JSON object.' });
    }

    const { messages: messagesFromClient, userId } = body as {
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        userId?: string
    };

    if (!userId || typeof userId !== 'string') {
        console.error("/api/chat: Invalid or missing 'userId' in request body.", body);
        return res.status(400).json({ error: 'Invalid request body: "userId" string is required.' });
    }

    if (!messagesFromClient || !Array.isArray(messagesFromClient) || messagesFromClient.length === 0) {
        return res.status(400).json({ error: 'Invalid request body: "messages" array is required.' });
    }
    const validRoles = ['system', 'user', 'assistant', 'tool'];
    for (const msg of messagesFromClient) {
        if (!msg || typeof msg.role !== 'string' || !validRoles.includes(msg.role) || typeof msg.content !== 'string') {
            return res.status(400).json({ error: `Invalid message structure.` });
        }
    }

    const messagesForOpenAI: OpenAI.Chat.ChatCompletionMessageParam[] = JSON.parse(JSON.stringify(messagesFromClient));
    const lastUserMessage = messagesForOpenAI.filter(m => m.role === 'user').pop();

    let relevantMemoryContext = "";
    const isFirstUserTurn = messagesFromClient.length === 2 &&
                            messagesFromClient[0].role === 'system' &&
                            messagesFromClient[1].role === 'user';
    
    if (isFirstUserTurn) {
        console.log(`/api/chat (User: ${userId}): First user turn. Skipping semantic memory retrieval.`);
    } else if (dbAdmin && lastUserMessage && lastUserMessage.content && typeof lastUserMessage.content === 'string') { 
        try {
            console.log(`/api/chat (User: ${userId}): Generating embedding for query:`, lastUserMessage.content);
            const queryEmbeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small", input: lastUserMessage.content,
            });
            const queryEmbedding = queryEmbeddingResponse?.data?.[0]?.embedding;

            if (queryEmbedding) {
                const allSummaries: StoredSessionSummary[] = await getAllSessionSummariesWithEmbeddingsAdmin(userId);
                console.log(`/api/chat (User: ${userId}): Found ${allSummaries.length} stored summaries via Admin SDK.`);

                if (allSummaries.length > 0) {
                    const similarities = allSummaries
                        .map(summary => ({ ...summary, similarity: cosineSimilarity(queryEmbedding, summary.embeddingVector) }))
                        .sort((a, b) => b.similarity - a.similarity);
                    const topSummaries = similarities.slice(0, MAX_SEMANTIC_SUMMARIES_TO_INJECT);
                    let combinedSummaryText = topSummaries.map(s => s.summaryText).join(" ");
                    if (combinedSummaryText.length > MAX_CHARS_FOR_SEMANTIC_CONTEXT) {
                        combinedSummaryText = combinedSummaryText.substring(0, MAX_CHARS_FOR_SEMANTIC_CONTEXT) + "...";
                    }
                    if (combinedSummaryText.trim().length > 0) {
                       relevantMemoryContext = `\n\nRelevant context from past conversations: ${combinedSummaryText.trim()}`;
                       console.log(`/api/chat (User: ${userId}): Relevant memory context prepared.`);
                    }
                }
            } else {
                console.warn(`/api/chat (User: ${userId}): Could not generate embedding for user query.`);
            }
        } catch (error) {
            console.error(`/api/chat (User: ${userId}): Error during semantic memory retrieval:`, error);
        }
    } else if (!dbAdmin) {
        console.warn(`/api/chat (User: ${userId}): Firebase Admin SDK not available. Skipping semantic memory retrieval.`);
    }


    if (messagesForOpenAI.length > 0 && messagesForOpenAI[0].role === 'system') {
        if (relevantMemoryContext) messagesForOpenAI[0].content += relevantMemoryContext;
    } else {
        const systemMessageContent = DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND + (relevantMemoryContext || "");
        messagesForOpenAI.unshift({ role: 'system', content: systemMessageContent });
    }

    try {
        const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini', messages: messagesForOpenAI, stream: true,
        });
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content && !res.writableEnded) res.write(content);
            else if (content) { console.warn("/api/chat: Stream ended, chunk dropped:", content); break; }
        }
        if (!res.writableEnded) res.end();
    } catch (error: any) {
        console.error(`/api/chat (User: ${userId}): OpenAI API call error:`, error);
        if (!res.writableEnded) {
             if (error instanceof OpenAI.APIError) {
                res.status(error.status || 500).json({ error: `OpenAI API Error: ${error.name}`, details: error.message });
            } else {
                res.status(500).json({ error: 'Failed to stream AI response.', details: error.message });
            }
        }
    }
}
