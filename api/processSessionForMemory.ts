
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { getUserMemory, updateUserMemory } from '../services/firebaseService.js';
import { Message as AppMessage } from '../types'; // Assuming your Message type is exported from types.ts

const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
} else {
    console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set. Memory processing functionality will be disabled.");
}

const DEFAULT_USER_ID = "default_user"; 

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

    if (!sessionMessages || !Array.isArray(sessionMessages)) {
        return res.status(400).json({ error: 'Invalid request body: "sessionMessages" array is required.' });
    }
    
    if (sessionMessages.length === 0) {
      console.log("/api/processSessionForMemory: No messages in session to process for memory. Session ID:", sessionId);
      return res.status(200).json({ message: "No messages in session to process for memory." });
    }

    console.log(`/api/processSessionForMemory: Received request for session ${sessionId || 'Unknown'}. Messages count: ${sessionMessages.length}`);

    try {
        let initialUserMemoryArray: string[] | null = null;
        try {
            initialUserMemoryArray = await getUserMemory(DEFAULT_USER_ID);
            console.log("/api/processSessionForMemory: Fetched initialUserMemoryArray:", initialUserMemoryArray);
        } catch (e) {
            console.error("/api/processSessionForMemory: Error fetching user memory, proceeding as if empty:", e);
            initialUserMemoryArray = []; // Treat as empty on error for update logic
        }

        const lastFewMessages = sessionMessages.slice(-6); // Get last ~3 turns (user + AI = 1 turn)
        let conversationSnippet = "";

        if (lastFewMessages.length > 0) {
            conversationSnippet = "Context from the conversation that just ended:\n" +
                lastFewMessages.map(m => `${m.sender === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
        } else {
            // This case should be caught by the length check at the beginning, but as a fallback:
            console.log("/api/processSessionForMemory: No conversation snippet to use for memory update. Session ID:", sessionId);
            return res.status(200).json({ message: "No meaningful conversation snippet to process." });
        }
        
        const userMemoryArrayStringified = initialUserMemoryArray ? JSON.stringify(initialUserMemoryArray) : "[]";
        
        const memoryUpdateSystemPrompt = `You are a User Memory Updater.
Input: Current memory (JSON array of strings), and context from a recently concluded conversation.
Task: Update the memory. Add new facts/preferences. Modify/remove outdated ones. Each fact must be a distinct string.
Output: ONLY the new JSON array of strings. Example: ["Fact 1", "Fact 2"]. If no changes, output original array. If empty and no new facts, output [].`;
        
        const memoryUpdateUserPrompt = `Current Memory (JSON array):
\`\`\`json
${userMemoryArrayStringified}
\`\`\`

${conversationSnippet}

New Memory (JSON array):`;

        console.log("/api/processSessionForMemory: System Prompt for LLM:", memoryUpdateSystemPrompt);
        console.log("/api/processSessionForMemory: User Prompt for LLM:", memoryUpdateUserPrompt);

        const memoryCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini', 
            messages: [
                { role: 'system', content: memoryUpdateSystemPrompt },
                { role: 'user', content: memoryUpdateUserPrompt }
            ],
            max_tokens: 350, 
            temperature: 0.2,
        });
        
        let newMemoryArray: string[] | null = null;
        const rawMemoryOutput = memoryCompletion.choices[0]?.message?.content?.trim();
        console.log("/api/processSessionForMemory: Raw LLM output for memory:", rawMemoryOutput);

        if (rawMemoryOutput) {
            try {
                let jsonString = rawMemoryOutput;
                const markdownMatch = rawMemoryOutput.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
                if (markdownMatch && markdownMatch[1]) {
                    jsonString = markdownMatch[1].trim();
                }

                const parsedOutput = JSON.parse(jsonString);
                if (Array.isArray(parsedOutput) && parsedOutput.every(item => typeof item === 'string')) {
                    newMemoryArray = parsedOutput.filter(item => item.trim() !== ""); 
                } else {
                    console.warn(`/api/processSessionForMemory: LLM output was not a valid JSON array of strings. Output: ${rawMemoryOutput}`);
                    if (typeof rawMemoryOutput === 'string' && !rawMemoryOutput.startsWith('[') && rawMemoryOutput.length > 0) {
                         newMemoryArray = [rawMemoryOutput.trim()].filter(item => item !== "");
                         console.log("/api/processSessionForMemory: Salvaged plain string LLM memory output into a single-entry array.");
                    }
                }
            } catch (parseError) {
                console.warn(`/api/processSessionForMemory: Failed to parse LLM output as JSON. Output: ${rawMemoryOutput}. Error: ${parseError}`);
                 if (typeof rawMemoryOutput === 'string' && !rawMemoryOutput.startsWith('[') && rawMemoryOutput.length > 0) {
                    newMemoryArray = [rawMemoryOutput.trim()].filter(item => item !== "");
                    console.log("/api/processSessionForMemory: Salvaged plain string LLM memory output (due to parse error) into a single-entry array.");
                }
            }
        }
        console.log("/api/processSessionForMemory: Parsed newMemoryArray:", newMemoryArray);

        if (newMemoryArray && newMemoryArray.length > 0) { 
            const oldMemoryStringifiedSorted = initialUserMemoryArray ? JSON.stringify([...initialUserMemoryArray].sort()) : "[]";
            const newMemoryStringifiedSorted = JSON.stringify([...newMemoryArray].sort());

            if (newMemoryStringifiedSorted !== oldMemoryStringifiedSorted) {
                await updateUserMemory(DEFAULT_USER_ID, newMemoryArray); 
                console.log(`/api/processSessionForMemory: User memory updated for ${DEFAULT_USER_ID}.`);
            } else {
                console.log(`/api/processSessionForMemory: User memory for ${DEFAULT_USER_ID} remains unchanged after LLM evaluation (content identical after sorting).`);
            }
        } else if (newMemoryArray && newMemoryArray.length === 0 && initialUserMemoryArray && initialUserMemoryArray.length > 0) {
            await updateUserMemory(DEFAULT_USER_ID, []); // Explicitly clear memory if LLM returns empty array
            console.log(`/api/processSessionForMemory: User memory for ${DEFAULT_USER_ID} cleared by LLM evaluation.`);
        } else {
            console.warn(`/api/processSessionForMemory: LLM call resulted in empty/invalid array or no change for ${DEFAULT_USER_ID}. Memory not updated or cleared if it was already empty.`);
        }
        
        return res.status(200).json({ message: "Memory processed successfully." });

    } catch (error: any) {
        console.error('/api/processSessionForMemory: Error during memory processing:', error);
        if (error instanceof OpenAI.APIError) {
            console.error(`/api/processSessionForMemory: OpenAI API Error Details: Status=${error.status}, Type=${error.type}, Code=${error.code}, Param=${error.param}, Message=${error.message}`);
            return res.status(error.status || 500).json({ 
                error: `OpenAI API Error: ${error.name || 'Unknown Error'}`,
                details: error.message 
            });
        }
        return res.status(500).json({ 
            error: 'Failed to process session for memory.',
            details: error.message || 'An unexpected server error occurred.'
        });
    }
}
