
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

// Firebase Admin SDK Initialization
let adminApp: AdminApp;
const serviceAccountString = process.env.FIREBASE_ADMIN_SDK_CONFIG;

if (serviceAccountString) {
    try {
        const serviceAccount = JSON.parse(serviceAccountString);
        if (!getApps().length) { // No apps initialized yet
            adminApp = initializeApp({ credential: cert(serviceAccount) });
            console.log("Firebase Admin SDK initialized successfully in /api/renameChat.");
        } else { // Apps already initialized, get the default one
            adminApp = getApps()[0]; 
            // console.log("Firebase Admin SDK already initialized, using existing instance in /api/renameChat."); // Less verbose
        }
    } catch (e: any) {
        console.error("CRITICAL_ERROR: Failed to parse FIREBASE_ADMIN_SDK_CONFIG or initialize Firebase Admin SDK in /api/renameChat.", e.message);
        // adminApp will remain unassigned or undefined
    }
} else {
    console.error("CRITICAL_ERROR: FIREBASE_ADMIN_SDK_CONFIG environment variable is not set. Firestore operations in /api/renameChat will fail.");
    // adminApp will remain unassigned or undefined
}

const dbAdmin = adminApp! ? getAdminFirestore(adminApp) : null; // dbAdmin will be null if adminApp initialization failed
const CHAT_SESSIONS_COLLECTION = 'chat_sessions'; // Define this constant

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!dbAdmin) {
    console.error("/api/renameChat: Firebase Admin Firestore client not initialized. Check server logs for FIREBASE_ADMIN_SDK_CONFIG issues.");
    return res.status(500).json({ error: 'Server configuration error: Firebase Admin SDK not available.' });
  }

  const { userId, sessionId, newTitle } = req.body as { userId?: string, sessionId?: string, newTitle?: string };

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Invalid request body: "userId" string is required.' });
  }
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Invalid request body: "sessionId" is required and must be a string.' });
  }
  if (!newTitle || typeof newTitle !== 'string' || newTitle.trim() === '') {
    return res.status(400).json({ error: 'Invalid request body: "newTitle" is required and must be a non-empty string.' });
  }

  try {
    const sessionRef = dbAdmin.collection(CHAT_SESSIONS_COLLECTION).doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      console.warn(`[api/renameChat] User: ${userId}, Session ${sessionId} not found for rename.`);
      return res.status(404).json({ error: 'Chat session not found.' });
    }

    // Authorization: Check if the session belongs to the user making the request
    const sessionData = sessionDoc.data();
    if (sessionData?.userId !== userId) {
      console.warn(`[api/renameChat] User: ${userId} attempted to rename session ${sessionId} (owner: ${sessionData?.userId}) not belonging to them.`);
      return res.status(403).json({ error: 'Permission denied. You can only rename your own chat sessions.' });
    }

    await sessionRef.update({ title: newTitle.trim() });
    
    console.log(`[api/renameChat] User: ${userId}, Successfully renamed chat session ${sessionId} to "${newTitle.trim()}" using Admin SDK.`);
    return res.status(200).json({ message: 'Chat session renamed successfully.' });
  } catch (error: any) {
    console.error(`[api/renameChat] User: ${userId}, Error renaming chat session ${sessionId} with Admin SDK:`, error);
    res.status(500).json({
      error: 'Failed to rename chat session.',
      details: error.message || 'An unexpected server error occurred.'
    });
  }
}
