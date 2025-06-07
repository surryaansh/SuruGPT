
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { getAllSessionSummariesWithEmbeddings } from '../services/firebaseService.js';
import type { StoredSessionSummary } from '../types.js';

const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
} else {
    console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set. OpenAI functionality will be disabled.");
}

const DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND = "You are SuruGPT, a helpful and friendly AI assistant. Keep your responses concise and delightful, like a sprinkle of magic! ✨";
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

    const body = req.body;
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Invalid request body: must be a JSON object.' });
    }

    const { messages: messagesFromClient, userId } = body as {
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        userId?: string // Added userId from client
    };

    if (!userId || typeof userId !== 'string') { // Validate userId
        console.error("/api/chat: Invalid or missing 'userId' in request body.", body);
        return res.status(400).json({ error: 'Invalid request body: "userId" string is required.' });
    }

    if (!messagesFromClient || !Array.isArray(messagesFromClient) || messagesFromClient.length === 0) {
        return res.status(400).json({ error: 'Invalid request body: "messages" array is required.' });
    }
    // ... (message validation remains the same)
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
    } else if (lastUserMessage && lastUserMessage.content && typeof lastUserMessage.content === 'string') {
        try {
            console.log(`/api/chat (User: ${userId}): Generating embedding for query:`, lastUserMessage.content);
            const queryEmbeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small", input: lastUserMessage.content,
            });
            const queryEmbedding = queryEmbeddingResponse?.data?.[0]?.embedding;

            if (queryEmbedding) {
                // Use the provided userId to fetch summaries
                const allSummaries: StoredSessionSummary[] = await getAllSessionSummariesWithEmbeddings(userId);
                console.log(`/api/chat (User: ${userId}): Found ${allSummaries.length} stored summaries.`);

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
