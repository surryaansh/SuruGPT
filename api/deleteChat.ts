
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteChatSessionFromFirestore } from '../services/firebaseService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userId, sessionId } = req.body as { userId?: string, sessionId?: string };

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Invalid request body: "userId" string is required.' });
  }
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Invalid request body: "sessionId" is required and must be a string.' });
  }

  try {
    await deleteChatSessionFromFirestore(userId, sessionId);
    console.log(`[api/deleteChat] User: ${userId}, Successfully deleted chat session: ${sessionId}`);
    return res.status(200).json({ message: 'Chat session deleted successfully.' });
  } catch (error: any) {
    console.error(`[api/deleteChat] User: ${userId}, Error deleting chat session ${sessionId}:`, error);
    res.status(500).json({
      error: 'Failed to delete chat session.',
      details: error.message || 'An unexpected server error occurred.'
    });
  }
}
