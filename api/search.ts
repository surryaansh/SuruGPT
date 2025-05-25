
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getChatSessions, getMessagesForSession } from '../services/firebaseService';
import { ChatSession } from '../types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { searchTerm } = req.body;

    if (typeof searchTerm !== 'string') { // Allow empty string for clearing search
        return res.status(400).json({ error: 'Invalid request body: "searchTerm" must be a string.' });
    }

    const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();

    if (!lowerCaseSearchTerm) { // If search term is empty after trim, return all sessions or empty array
        try {
            // Optionally, you could return all sessions here if desired for an empty search
            // For now, returning empty as the frontend will handle showing all if term is empty.
            // Or, to be more robust, let frontend decide to fetch all or clear.
            // Let's return empty, frontend will show all if it sent an empty search.
            const allSessions = await getChatSessions();
             return res.status(200).json(allSessions); // Return all sessions if search term is empty
        } catch (error: any) {
            console.error('/api/search: Error fetching all sessions for empty search:', error);
            return res.status(500).json({
                error: 'Failed to fetch sessions.',
                details: error.message || 'An unexpected server error occurred.'
            });
        }
    }

    try {
        const allSessions = await getChatSessions();
        const matchingSessions: ChatSession[] = [];

        for (const session of allSessions) {
            let found = false;

            // Check title
            if (session.title.toLowerCase().includes(lowerCaseSearchTerm)) {
                found = true;
            }

            // Check first message text (if available and not already found)
            if (!found && session.firstMessageTextForTitle && session.firstMessageTextForTitle.toLowerCase().includes(lowerCaseSearchTerm)) {
                found = true;
            }

            // If not found yet, check all messages in the session
            if (!found) {
                const messages = await getMessagesForSession(session.id);
                for (const message of messages) {
                    if (message.text.toLowerCase().includes(lowerCaseSearchTerm)) {
                        found = true;
                        break; // Found in messages, no need to check further messages for this session
                    }
                }
            }

            if (found) {
                matchingSessions.push(session);
            }
        }

        return res.status(200).json(matchingSessions);

    } catch (error: any) {
        console.error('/api/search: Error during search:', error);
        res.status(500).json({
            error: 'Failed to perform search.',
            details: error.message || 'An unexpected server error occurred.'
        });
    }
}
