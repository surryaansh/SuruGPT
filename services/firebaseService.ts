
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
  limit
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
  if (!userId) {
    console.warn("[firebaseService] getChatSessions called without userId.");
    return [];
  }
  try {
    const sessionsQuery = query(
      collection(db, CHAT_SESSIONS_COLLECTION),
      where('userId', '==', userId), // Filter by userId
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(sessionsQuery);
    return querySnapshot.docs.map(docSnapshot => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        title: data.title,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
        firstMessageTextForTitle: data.firstMessageTextForTitle,
        userId: data.userId,
      } as ChatSession;
    });
  } catch (error) {
    console.error("Error fetching chat sessions for user:", userId, error);
    throw error;
  }
};

export const getMessagesForSession = async (userId: string, sessionId: string): Promise<Message[]> => {
  if (!userId || !sessionId) {
    console.warn("[firebaseService] getMessagesForSession called without userId or sessionId.");
    return [];
  }
  try {
    // Optional: First verify the session belongs to the user if rules don't cover cross-access fully
    // const sessionDoc = await getDoc(doc(db, CHAT_SESSIONS_COLLECTION, sessionId));
    // if (!sessionDoc.exists() || sessionDoc.data()?.userId !== userId) {
    //   console.error(`[firebaseService] Attempt to access session ${sessionId} not belonging to user ${userId}`);
    //   return [];
    // }

    const messagesQuery = query(
      collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
      orderBy('timestamp', 'asc')
    );
    const querySnapshot = await getDocs(messagesQuery);
    return querySnapshot.docs.map(docSnapshot =>
      convertMessageTimestamp({ id: docSnapshot.id, ...docSnapshot.data() })
    );
  } catch (error) {
    console.error(`Error fetching messages for session ${sessionId}, user ${userId}:`, error);
    throw error;
  }
};

export const createChatSessionInFirestore = async (
  userId: string,
  title: string,
  firstMessageText: string
): Promise<ChatSession> => {
  if (!userId) {
    throw new Error("[firebaseService] createChatSessionInFirestore called without userId.");
  }
  try {
    const newSessionRef = await addDoc(collection(db, CHAT_SESSIONS_COLLECTION), {
      title,
      createdAt: serverTimestamp(),
      firstMessageTextForTitle: firstMessageText,
      userId: userId, // Store the userId
    });

    const docSnap = await getDoc(newSessionRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: newSessionRef.id,
        title: data.title,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
        firstMessageTextForTitle: data.firstMessageTextForTitle,
        userId: data.userId,
      } as ChatSession;
    } else {
      throw new Error("Failed to create and retrieve chat session from Firestore");
    }
  } catch (error) {
    console.error("Error creating new chat session for user:", userId, error);
    throw error;
  }
};

export const addMessageToFirestore = async (
  userId: string, // Not strictly needed if session already verified, but good for consistency
  sessionId: string,
  messageData: { text: string; sender: SenderType }
): Promise<Message> => {
  if (!userId || !sessionId) {
     throw new Error("[firebaseService] addMessageToFirestore called without userId or sessionId.");
  }
  try {
    const messageRef = await addDoc(
      collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
      {
        ...messageData,
        timestamp: serverTimestamp(),
        feedback: null,
        // userId: userId, // Optionally store userId on messages too for very specific rules
      }
    );
    const docSnap = await getDoc(messageRef);
    if (docSnap.exists()) {
      return convertMessageTimestamp({ id: messageRef.id, ...docSnap.data() });
    } else {
      throw new Error("Failed to add and retrieve message from Firestore");
    }
  } catch (error) {
    console.error(`Error adding message to session ${sessionId} for user ${userId}:`, error);
    throw error;
  }
};

export const updateMessageInFirestore = async (
  userId: string, // For verification if needed
  sessionId: string,
  messageId: string,
  newText: string
): Promise<void> => {
  if (!userId || !sessionId || !messageId) {
     throw new Error("[firebaseService] updateMessageInFirestore called without userId, sessionId, or messageId.");
  }
  try {
    const messageRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION, messageId);
    await updateDoc(messageRef, {
      text: newText,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error(`Error updating message ${messageId} in session ${sessionId} for user ${userId}:`, error);
    throw error;
  }
};

export const updateMessageFeedbackInFirestore = async (
  userId: string, // For verification
  sessionId: string,
  messageId: string,
  feedback: 'good' | 'bad' | null
): Promise<void> => {
   if (!userId || !sessionId || !messageId) {
     throw new Error("[firebaseService] updateMessageFeedbackInFirestore called without crucial IDs.");
  }
  try {
    const messageRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION, messageId);
    await updateDoc(messageRef, { feedback });
  } catch (error) {
    console.error(`Error updating feedback for message ${messageId} (user ${userId}):`, error);
    throw error;
  }
};

export const updateChatSessionTitleInFirestore = async (userId: string, sessionId: string, newTitle: string): Promise<void> => {
  if (!userId || !sessionId) {
     throw new Error("[firebaseService] updateChatSessionTitleInFirestore called without userId or sessionId.");
  }
  try {
    const sessionRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId);
    // Optional: Verify ownership before update if rules are not sufficient or for proactive check
    // const sessionSnap = await getDoc(sessionRef);
    // if (!sessionSnap.exists() || sessionSnap.data()?.userId !== userId) throw new Error("Permission denied or session not found.");
    await updateDoc(sessionRef, { title: newTitle });
  } catch (error) {
    console.error(`Error updating title for session ${sessionId} (user ${userId}):`, error);
    throw error;
  }
};

export const deleteChatSessionFromFirestore = async (userId: string, sessionId: string): Promise<void> => {
  if (!userId || !sessionId) {
    throw new Error("[firebaseService] deleteChatSessionFromFirestore called without userId or sessionId.");
  }
  try {
    const batch = writeBatch(db);

    // Verify session ownership before starting delete
    const sessionDocRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId);
    const sessionDocSnap = await getDoc(sessionDocRef);
    if (!sessionDocSnap.exists() || sessionDocSnap.data()?.userId !== userId) {
        console.error(`[firebaseService] Attempt to delete session ${sessionId} not belonging to user ${userId} or session not found.`);
        throw new Error("Permission denied or session not found for deletion.");
    }

    // Delete associated session summaries (now under user_memories/{userId}/...)
    const userMemoryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId); // Path to user's memory
    const summariesColRef = collection(userMemoryDocRef, SESSION_SUMMARIES_SUBCOLLECTION);
    const summariesQuery = query(summariesColRef, where("sessionId", "==", sessionId));
    const summariesSnapshot = await getDocs(summariesQuery);

    summariesSnapshot.forEach(summaryDoc => batch.delete(summaryDoc.ref));

    const messagesPath = collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION);
    const messagesSnapshot = await getDocs(query(messagesPath));
    messagesSnapshot.forEach(messageDoc => batch.delete(messageDoc.ref));

    batch.delete(sessionDocRef);
    await batch.commit();
  } catch (error) {
    console.error(`Error deleting chat session ${sessionId} for user ${userId}:`, error);
    throw error;
  }
};

export const addSessionSummaryWithEmbeddingAndHash = async (
  userId: string,
  sessionId: string,
  summaryText: string,
  embeddingVector: number[],
  contentHash: string
): Promise<void> => {
  if (!userId) {
    throw new Error("[firebaseService] addSessionSummaryWithEmbeddingAndHash called without userId.");
  }
  try {
    const userMemoryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId); // Use dynamic userId
    const summariesColRef = collection(userMemoryDocRef, SESSION_SUMMARIES_SUBCOLLECTION);
    await addDoc(summariesColRef, {
      sessionId,
      summaryText,
      embeddingVector,
      contentHash,
      createdAt: serverTimestamp(),
      // userId: userId, // Implicitly part of the path, but can be added for explicit querying
    });
  } catch (error) {
    console.error(`Error adding session summary for session ${sessionId} (user ${userId}):`, error);
  }
};

export const getAllSessionSummariesWithEmbeddings = async (userId: string): Promise<StoredSessionSummary[]> => {
  if (!userId) {
     console.warn("[firebaseService] getAllSessionSummariesWithEmbeddings called without userId.");
     return [];
  }
  try {
    const userMemoryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId); // Use dynamic userId
    const summariesColRef = collection(userMemoryDocRef, SESSION_SUMMARIES_SUBCOLLECTION);
    const summariesQuery = query(summariesColRef, orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(summariesQuery);
    return querySnapshot.docs.map(docSnapshot => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        sessionId: data.sessionId,
        summaryText: data.summaryText,
        embeddingVector: data.embeddingVector,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
        contentHash: data.contentHash,
        // userId: data.userId || userId, // Ensure userId is present
      } as StoredSessionSummary;
    });
  } catch (error) {
    console.error(`Error fetching session summaries for user ${userId}:`, error);
    return [];
  }
};

export const getMostRecentSummaryForSession = async (userId: string, sessionId: string): Promise<StoredSessionSummary | null> => {
  if (!userId || !sessionId) {
     console.warn("[firebaseService] getMostRecentSummaryForSession called without userId or sessionId.");
     return null;
  }
  try {
    const userMemoryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId); // Use dynamic userId
    const summariesColRef = collection(userMemoryDocRef, SESSION_SUMMARIES_SUBCOLLECTION);
    const q = query(
      summariesColRef,
      where("sessionId", "==", sessionId),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docSnapshot = querySnapshot.docs[0];
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        sessionId: data.sessionId,
        summaryText: data.summaryText,
        embeddingVector: data.embeddingVector,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
        contentHash: data.contentHash,
        // userId: data.userId || userId,
      } as StoredSessionSummary;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching most recent summary for session ${sessionId}, user ${userId}:`, error);
    return null;
  }
};
