
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getChatSessions, getMessagesForSession } from '../services/firebaseService.js';
import { ChatSession } from '../types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { searchTerm, userId } = req.body as { searchTerm?: string, userId?: string };

    if (!userId || typeof userId !== 'string') { // Validate userId
        return res.status(400).json({ error: 'Invalid request body: "userId" string is required.' });
    }
    if (typeof searchTerm !== 'string') {
        return res.status(400).json({ error: 'Invalid request body: "searchTerm" must be a string.' });
    }

    const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
    console.log(`[api/search] User: ${userId}, SearchTerm: "${lowerCaseSearchTerm}"`);

    try {
        // Fetch sessions specifically for the given userId
        const userSessions = await getChatSessions(userId);
        console.log(`[api/search] User: ${userId}, Fetched ${userSessions.length} sessions.`);

        if (!lowerCaseSearchTerm) {
            return res.status(200).json(userSessions); // Return all user's sessions if search term is empty
        }
        
        if (userSessions.length === 0) {
            return res.status(200).json([]);
        }

        const directMatches: ChatSession[] = [];
        const sessionsToSearchMessagesFor: ChatSession[] = [];

        for (const session of userSessions) {
            let foundDirectly = false;
            if (session.title.toLowerCase().includes(lowerCaseSearchTerm)) {
                directMatches.push(session);
                foundDirectly = true;
            } else if (session.firstMessageTextForTitle && session.firstMessageTextForTitle.toLowerCase().includes(lowerCaseSearchTerm)) {
                directMatches.push(session);
                foundDirectly = true;
            }
            if (!foundDirectly) {
                sessionsToSearchMessagesFor.push(session);
            }
        }

        const messageSearchPromises = sessionsToSearchMessagesFor.map(async (session) => {
            try {
                // Pass userId to getMessagesForSession for consistency, though session ID should be unique enough
                const messages = await getMessagesForSession(userId, session.id);
                for (const message of messages) {
                    if (message.text.toLowerCase().includes(lowerCaseSearchTerm)) {
                        return session;
                    }
                }
            } catch (msgError: any) {
                console.error(`[api/search] User: ${userId}, Error fetching messages for session ${session.id}:`, msgError.message);
            }
            return null;
        });

        const messageMatchResults = await Promise.all(messageSearchPromises);
        const messageContentMatches = messageMatchResults.filter(session => session !== null) as ChatSession[];

        const combinedResults = [...directMatches, ...messageContentMatches];
        const uniqueResultsMap = new Map<string, ChatSession>();
        combinedResults.forEach(session => uniqueResultsMap.set(session.id, session));
        const finalMatchingSessions = Array.from(uniqueResultsMap.values());

        console.log(`[api/search] User: ${userId}, Found ${finalMatchingSessions.length} matching sessions. Returning.`);
        return res.status(200).json(finalMatchingSessions);

    } catch (error: any) {
        console.error(`[api/search] User: ${userId}, General error:`, error.message);
        res.status(500).json({
            error: 'Failed to perform search.',
            details: error.message || 'An unexpected server error occurred.'
        });
    }
}
