
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getChatSessions, getMessagesForSession } from '../services/firebaseService.js'; // Added .js extension
import { ChatSession } from '../types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { searchTerm } = req.body;

    if (typeof searchTerm !== 'string') {
        console.error('[api/search] Invalid searchTerm type:', typeof searchTerm);
        return res.status(400).json({ error: 'Invalid request body: "searchTerm" must be a string.' });
    }

    console.log(`[api/search] Received raw searchTerm: "${searchTerm}"`);
    const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
    console.log(`[api/search] Processing lowerCaseSearchTerm: "${lowerCaseSearchTerm}"`);

    if (!lowerCaseSearchTerm) {
        console.log("[api/search] Empty search term after trim, attempting to return all sessions.");
        try {
            const allSessions = await getChatSessions();
            console.log(`[api/search] Fetched ${allSessions.length} sessions for empty search term.`);
            return res.status(200).json(allSessions);
        } catch (error: any) {
            console.error('[api/search] Error fetching all sessions for empty search term:', error.message, error.stack);
            return res.status(500).json({
                error: 'Failed to fetch sessions for empty search.',
                details: error.message || 'An unexpected server error occurred.'
            });
        }
    }

    try {
        console.log("[api/search] Non-empty search term. Attempting to fetch all chat sessions.");
        const allSessions = await getChatSessions();
        console.log(`[api/search] Fetched ${allSessions.length} total sessions from Firestore.`);
        
        if (allSessions.length === 0) {
            console.log("[api/search] No sessions found in Firestore. Returning empty results.");
            return res.status(200).json([]);
        }

        const directMatches: ChatSession[] = [];
        const sessionsToSearchMessagesFor: ChatSession[] = [];

        // Stage 1: Check titles and firstMessageTextForTitle
        for (const session of allSessions) {
            console.log(`[api/search] Stage 1: Checking session ID: ${session.id}, Title: "${session.title}"`);
            let foundDirectly = false;
            if (session.title.toLowerCase().includes(lowerCaseSearchTerm)) {
                console.log(`[api/search] Match found in title for session ${session.id}`);
                directMatches.push(session);
                foundDirectly = true;
            } else if (session.firstMessageTextForTitle && session.firstMessageTextForTitle.toLowerCase().includes(lowerCaseSearchTerm)) {
                console.log(`[api/search] Match found in firstMessageTextForTitle for session ${session.id}`);
                directMatches.push(session);
                foundDirectly = true;
            }

            if (!foundDirectly) {
                sessionsToSearchMessagesFor.push(session);
            }
        }
        console.log(`[api/search] Stage 1 complete. Direct matches: ${directMatches.length}. Sessions needing deep search: ${sessionsToSearchMessagesFor.length}`);

        // Stage 2: Fetch and search messages in parallel for remaining sessions
        const messageSearchPromises = sessionsToSearchMessagesFor.map(async (session) => {
            console.log(`[api/search] Stage 2: Fetching messages for session ${session.id}...`);
            try {
                const messages = await getMessagesForSession(session.id);
                console.log(`[api/search] Fetched ${messages.length} messages for session ${session.id}.`);
                for (const message of messages) {
                    if (message.text.toLowerCase().includes(lowerCaseSearchTerm)) {
                        console.log(`[api/search] Match found in message content for session ${session.id}, message ID ${message.id}`);
                        return session; // Return the session if a match is found
                    }
                }
            } catch (msgError: any) {
                console.error(`[api/search] Error fetching messages for session ${session.id}: ${msgError.message}`, msgError.stack);
            }
            return null; // Return null if no match found in messages or if an error occurred
        });

        const messageMatchResults = await Promise.all(messageSearchPromises);
        const messageContentMatches = messageMatchResults.filter(session => session !== null) as ChatSession[];
        
        console.log(`[api/search] Stage 2 complete. Matches found in message content: ${messageContentMatches.length}`);

        // Combine results and remove duplicates (though unlikely with this logic separation)
        const combinedResults = [...directMatches, ...messageContentMatches];
        const uniqueResultsMap = new Map<string, ChatSession>();
        combinedResults.forEach(session => uniqueResultsMap.set(session.id, session));
        const finalMatchingSessions = Array.from(uniqueResultsMap.values());

        console.log(`[api/search] Search complete. Found ${finalMatchingSessions.length} total matching sessions. Returning results.`);
        return res.status(200).json(finalMatchingSessions);

    } catch (error: any) {
        console.error('[api/search] General error during search processing:', error.message, error.stack);
        res.status(500).json({
            error: 'Failed to perform search.',
            details: error.message || 'An unexpected server error occurred.'
        });
    }
}
