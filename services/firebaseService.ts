import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
  Timestamp,
  addDoc,
  serverTimestamp,
  getDoc,
  doc,
  updateDoc,
  writeBatch,
  where,
  setDoc
} from 'firebase/firestore';

import { firebaseConfig } from './firebaseConfig.js';
import { ChatSession, Message, SenderType } from '../types';
import type { StoredSessionSummary } from '../types';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CHAT_SESSIONS_COLLECTION = 'chat_sessions';
const MESSAGES_SUBCOLLECTION = 'messages';
const USER_MEMORIES_COLLECTION = 'user_memories';
const SESSION_SUMMARIES_SUBCOLLECTION = 'session_summaries';

const convertMessageTimestamp = (messageData: any): Message => {
  const timestampField = messageData.timestamp;
  return {
    ...messageData,
    timestamp: timestampField instanceof Timestamp ? timestampField.toDate() : new Date(timestampField),
    feedback: messageData.feedback === undefined ? null : messageData.feedback,
  } as Message;
};

export const getChatSessions = async (userId: string): Promise<ChatSession[]> => {
  if (!userId) return [];
  try {
    const sessionsQuery = query(
      collection(db, CHAT_SESSIONS_COLLECTION),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(sessionsQuery);
    return querySnapshot.docs.map(docSnapshot => {
      // FIX: Cast docSnapshot.data() to any to allow access to properties like title, createdAt, and userId
      const data = docSnapshot.data() as any;
      return {
        id: docSnapshot.id,
        title: data.title,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
        firstMessageTextForTitle: data.firstMessageTextForTitle,
        userId: data.userId,
      } as ChatSession;
    });
  } catch (error) {
    console.error("Error fetching chat sessions:", error);
    return [];
  }
};

export const getMessagesForSession = async (userId: string, sessionId: string): Promise<Message[]> => {
  if (!userId || !sessionId) return [];
  try {
    const messagesQuery = query(
      collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
      orderBy('timestamp', 'asc')
    );
    const querySnapshot = await getDocs(messagesQuery);
    return querySnapshot.docs.map(docSnapshot =>
      // FIX: Cast docSnapshot.data() to any to allow spreading the data into the message object
      convertMessageTimestamp({ id: docSnapshot.id, ...(docSnapshot.data() as any) })
    );
  } catch (error) {
    // Return empty instead of throwing to prevent background cleanup from blocking UI
    console.warn(`[firebaseService] Could not fetch messages for session ${sessionId}. Legacy data or permission issue?`, error);
    return [];
  }
};

export const createChatSessionInFirestore = async (
  userId: string,
  title: string,
  firstMessageText: string
): Promise<ChatSession> => {
  if (!userId) throw new Error("userId is required");
  const newSessionRef = await addDoc(collection(db, CHAT_SESSIONS_COLLECTION), {
    title,
    createdAt: serverTimestamp(),
    firstMessageTextForTitle: firstMessageText,
    userId: userId,
  });

  const docSnap = await getDoc(newSessionRef);
  if (docSnap.exists()) {
    // FIX: Cast docSnap.data() to any to access properties like title and createdAt
    const data = docSnap.data() as any;
    return {
      id: newSessionRef.id,
      title: data.title,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
      firstMessageTextForTitle: data.firstMessageTextForTitle,
      userId: data.userId,
    } as ChatSession;
  }
  throw new Error("Failed to create chat session");
};

export const addMessageToFirestore = async (
  userId: string, 
  sessionId: string,
  messageData: { text: string; sender: SenderType }
): Promise<Message> => {
  if (!userId || !sessionId) throw new Error("Missing ID for addMessage");
  const messageRef = await addDoc(
    collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
    {
      ...messageData,
      timestamp: serverTimestamp(),
      feedback: null,
    }
  );
  const docSnap = await getDoc(messageRef);
  if (docSnap.exists()) {
    // FIX: Cast docSnap.data() to any to allow object spreading for the message
    return convertMessageTimestamp({ id: messageRef.id, ...(docSnap.data() as any) });
  }
  throw new Error("Failed to add message");
};

export const updateMessageInFirestore = async (
  userId: string, 
  sessionId: string,
  messageId: string,
  newText: string
): Promise<void> => {
  const messageRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, {
    text: newText,
    timestamp: serverTimestamp()
  });
};

export const updateMessageFeedbackInFirestore = async (
  userId: string, 
  sessionId: string,
  messageId: string,
  feedback: 'good' | 'bad' | null
): Promise<void> => {
  const messageRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { feedback });
};

export const updateChatSessionTitleInFirestore = async (userId: string, sessionId: string, newTitle: string): Promise<void> => {
  const sessionRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId);
  await updateDoc(sessionRef, { title: newTitle });
};

export const deleteChatSessionFromFirestore = async (userId: string, sessionId: string): Promise<void> => {
  const batch = writeBatch(db);
  const sessionDocRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId);
  const sessionDocSnap = await getDoc(sessionDocRef);
  
  // FIX: Cast sessionDocSnap.data() to any to verify ownership via the userId property
  if (!sessionDocSnap.exists() || (sessionDocSnap.data() as any)?.userId !== userId) {
      throw new Error("Permission denied or session not found");
  }

  const summaryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId, SESSION_SUMMARIES_SUBCOLLECTION, sessionId);
  batch.delete(summaryDocRef);

  const messagesPath = collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION);
  const messagesSnapshot = await getDocs(query(messagesPath));
  messagesSnapshot.forEach(messageDoc => batch.delete(messageDoc.ref));

  batch.delete(sessionDocRef);
  await batch.commit();
};

export const addSessionSummaryWithEmbeddingAndHash = async (
  userId: string,
  sessionId: string,
  summaryText: string,
  embeddingVector: number[],
  contentHash: string
): Promise<void> => {
  const summaryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId, SESSION_SUMMARIES_SUBCOLLECTION, sessionId);
  await setDoc(summaryDocRef, { 
    sessionId, 
    summaryText, 
    embeddingVector, 
    contentHash, 
    createdAt: serverTimestamp() 
  }, { merge: true });
};

export const getMostRecentSummaryForSession = async (userId: string, sessionId: string): Promise<StoredSessionSummary | null> => {
  if (!userId || !sessionId) return null;
  try {
    const summaryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId, SESSION_SUMMARIES_SUBCOLLECTION, sessionId);
    const docSnapshot = await getDoc(summaryDocRef);
    if (docSnapshot.exists()) {
      // FIX: Cast docSnapshot.data() to any to access sessionId, summaryText, embeddingVector, etc.
      const data = docSnapshot.data() as any;
      return {
        id: docSnapshot.id,
        sessionId: data.sessionId,
        summaryText: data.summaryText,
        embeddingVector: data.embeddingVector,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
        contentHash: data.contentHash,
      } as StoredSessionSummary;
    }
  } catch (e) { console.error("Summary fetch error:", e); }
  return null;
};
