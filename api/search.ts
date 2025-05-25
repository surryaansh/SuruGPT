
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

        const matchingSessions: ChatSession[] = [];

        for (const session of allSessions) {
            console.log(`[api/search] Checking session ID: ${session.id}, Title: "${session.title}"`);
            let found = false;

            // Check title
            if (session.title.toLowerCase().includes(lowerCaseSearchTerm)) {
                console.log(`[api/search] Match found in title for session ${session.id}`);
                found = true;
            }

            // Check first message text (if available and not already found)
            if (!found && session.firstMessageTextForTitle && session.firstMessageTextForTitle.toLowerCase().includes(lowerCaseSearchTerm)) {
                console.log(`[api/search] Match found in firstMessageTextForTitle for session ${session.id}`);
                found = true;
            }

            // If not found yet, check all messages in the session
            if (!found) {
                console.log(`[api/search] No match in title or firstMessage. Fetching messages for session ${session.id}...`);
                try {
                    const messages = await getMessagesForSession(session.id);
                    console.log(`[api/search] Fetched ${messages.length} messages for session ${session.id}.`);
                    for (const message of messages) {
                        // console.log(`[api/search] Checking message ID: ${message.id}, Text: "${message.text.substring(0, 50)}..."`); // Log snippet of message text for debugging
                        if (message.text.toLowerCase().includes(lowerCaseSearchTerm)) {
                            console.log(`[api/search] Match found in message content for session ${session.id}, message ID ${message.id}`);
                            found = true;
                            break; 
                        }
                    }
                } catch (msgError: any) {
                    console.error(`[api/search] Error fetching messages for session ${session.id}: ${msgError.message}`, msgError.stack);
                    // Continue to next session, or decide if this should halt the search
                }
            }

            if (found) {
                console.log(`[api/search] Adding session ${session.id} ("${session.title}") to results.`);
                matchingSessions.push(session);
            } else {
                 console.log(`[api/search] No match found for session ${session.id} ("${session.title}").`);
            }
        }

        console.log(`[api/search] Search complete. Found ${matchingSessions.length} matching sessions. Returning results.`);
        return res.status(200).json(matchingSessions);

    } catch (error: any) {
        console.error('[api/search] General error during search processing:', error.message, error.stack);
        res.status(500).json({
            error: 'Failed to perform search.',
            details: error.message || 'An unexpected server error occurred.'
        });
    }
}
