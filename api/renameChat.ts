
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateChatSessionTitleInFirestore } from '../services/firebaseService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { sessionId, newTitle } = req.body;

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Invalid request body: "sessionId" is required and must be a string.' });
  }
  if (!newTitle || typeof newTitle !== 'string' || newTitle.trim() === '') {
    return res.status(400).json({ error: 'Invalid request body: "newTitle" is required and must be a non-empty string.' });
  }

  try {
    await updateChatSessionTitleInFirestore(sessionId, newTitle.trim());
    console.log(`[api/renameChat] Successfully renamed chat session ${sessionId} to "${newTitle.trim()}"`);
    return res.status(200).json({ message: 'Chat session renamed successfully.' });
  } catch (error: any) {
    console.error(`[api/renameChat] Error renaming chat session ${sessionId}:`, error);
    res.status(500).json({
      error: 'Failed to rename chat session.',
      details: error.message || 'An unexpected server error occurred.'
    });
  }
}
