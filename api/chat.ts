
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { getAllSessionSummariesWithEmbeddings } from '../services/firebaseService.js';
import type { StoredSessionSummary } from '../types.js'; // Corrected import path

const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
} else {
    console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set or is empty. OpenAI functionality will be disabled.");
}

const DEFAULT_USER_ID = "default_user"; // For fetching summaries
const DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND = "You are SuruGPT, a helpful and friendly AI assistant. Keep your responses concise and delightful, like a sprinkle of magic! ✨";
const MAX_SEMANTIC_SUMMARIES_TO_INJECT = 1; // CHANGED FROM 3 to 1
const MAX_CHARS_FOR_SEMANTIC_CONTEXT = 2500; // Max characters for the combined relevant summaries text

// Helper function to calculate cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) {
        return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) {
        return 0;
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
    
    const { messages: messagesFromClient } = body as { 
        messages: OpenAI.Chat.ChatCompletionMessageParam[]
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
    const lastUserMessage = messagesForOpenAI.filter(m => m.role === 'user').pop();
    let relevantMemoryContext = "";

    // --- Semantic Memory Retrieval ---
    if (lastUserMessage && lastUserMessage.content && typeof lastUserMessage.content === 'string') {
        try {
            console.log("/api/chat: Generating embedding for current user query:", lastUserMessage.content);
            const queryEmbeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: lastUserMessage.content,
            });
            const queryEmbedding = queryEmbeddingResponse?.data?.[0]?.embedding;

            if (queryEmbedding) {
                console.log("/api/chat: Fetching all session summaries with embeddings.");
                const allSummaries: StoredSessionSummary[] = await getAllSessionSummariesWithEmbeddings(DEFAULT_USER_ID);
                console.log(`/api/chat: Found ${allSummaries.length} stored session summaries.`);

                if (allSummaries.length > 0) {
                    const similarities = allSummaries
                        .map(summary => ({
                            ...summary,
                            similarity: cosineSimilarity(queryEmbedding, summary.embeddingVector),
                        }))
                        .sort((a, b) => b.similarity - a.similarity); // Sort by descending similarity

                    const topSummaries = similarities.slice(0, MAX_SEMANTIC_SUMMARIES_TO_INJECT);
                    console.log(`/api/chat: Top ${topSummaries.length} relevant summary/summaries selected (MAX_SEMANTIC_SUMMARIES_TO_INJECT is ${MAX_SEMANTIC_SUMMARIES_TO_INJECT}).`);
                    
                    let combinedSummaryText = topSummaries.map(s => s.summaryText).join(" "); // For N=1, this is just the single summary text
                    if (combinedSummaryText.length > MAX_CHARS_FOR_SEMANTIC_CONTEXT) {
                        combinedSummaryText = combinedSummaryText.substring(0, MAX_CHARS_FOR_SEMANTIC_CONTEXT) + "...";
                        console.log("/api/chat: Combined relevant summary text truncated.");
                    }
                    if (combinedSummaryText.trim().length > 0) {
                       relevantMemoryContext = `\n\nRelevant context from past conversations: ${combinedSummaryText.trim()}`;
                       console.log("/api/chat: Relevant memory context prepared:", relevantMemoryContext);
                    }
                }
            } else {
                console.warn("/api/chat: Could not generate embedding for user query.");
            }
        } catch (error) {
            console.error("/api/chat: Error during semantic memory retrieval:", error);
            // Continue without semantic memory if there's an error
        }
    }
    // --- End of Semantic Memory Retrieval ---

    if (messagesForOpenAI.length > 0 && messagesForOpenAI[0].role === 'system') {
        messagesForOpenAI[0].content += relevantMemoryContext; // Append relevant memory to existing system prompt
        console.log("/api/chat: Appended relevant memory context to existing system prompt.");
    } else {
        const systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
            role: 'system',
            content: DEFAULT_OPENAI_SYSTEM_PROMPT_BACKEND + relevantMemoryContext
        };
        messagesForOpenAI.unshift(systemMessage);
        console.warn("/api/chat: System message was not the first message from client, prepended default backend system prompt with relevant memory.");
    }


    try {
        console.log("/api/chat: Sending to OpenAI with messages (final system prompt content: '", messagesForOpenAI[0].content, "')");
        const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Main chat model
            messages: messagesForOpenAI,
            stream: true,
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
                if (!res.writableEnded) {
                    res.write(content);
                } else {
                    console.warn("/api/chat: Attempted to write to an ended stream. Chunk dropped:", content);
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
            console.error("/api/chat: Error occurred after stream response had already ended.");
        }
    }
}
