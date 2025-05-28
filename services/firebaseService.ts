
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
  where, // Already at the top
  limit // Added for fetching the most recent summary
} from 'firebase/firestore'; 

import { firebaseConfig } from './firebaseConfig.js'; 
import { ChatSession, Message, SenderType } from '../types'; // StoredSessionSummary will be imported from types.ts
import type { StoredSessionSummary } from '../types'; // Import the updated interface

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CHAT_SESSIONS_COLLECTION = 'chat_sessions';
const MESSAGES_SUBCOLLECTION = 'messages';
const USER_MEMORIES_COLLECTION = 'user_memories';
const SESSION_SUMMARIES_SUBCOLLECTION = 'session_summaries';
const DEFAULT_USER_ID = "default_user"; // Centralize default user ID

const convertMessageTimestamp = (messageData: any): Message => {
  const timestampField = messageData.timestamp;
  return {
    ...messageData,
    timestamp: timestampField instanceof Timestamp ? timestampField.toDate() : new Date(timestampField),
    feedback: messageData.feedback === undefined ? null : messageData.feedback,
  } as Message;
};

export const getChatSessions = async (): Promise<ChatSession[]> => {
  try {
    const sessionsQuery = query(collection(db, CHAT_SESSIONS_COLLECTION), orderBy('createdAt', 'desc'));
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
    console.error("Error fetching chat sessions:", error);
    throw error;
  }
};

export const getMessagesForSession = async (sessionId: string): Promise<Message[]> => {
  try {
    const messagesQuery = query(
      collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
      orderBy('timestamp', 'asc')
    );
    const querySnapshot = await getDocs(messagesQuery);
    return querySnapshot.docs.map(docSnapshot => 
      convertMessageTimestamp({ id: docSnapshot.id, ...docSnapshot.data() })
    );
  } catch (error) {
    console.error(`Error fetching messages for session ${sessionId}:`, error);
    throw error;
  }
};

export const createChatSessionInFirestore = async (
  title: string, 
  firstMessageText: string 
  ): Promise<ChatSession> => { 
  try {
    const newSessionRef = await addDoc(collection(db, CHAT_SESSIONS_COLLECTION), {
      title,
      createdAt: serverTimestamp(), 
      firstMessageTextForTitle: firstMessageText,
      userId: DEFAULT_USER_ID, // Assuming new chats are for the default user
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
    console.error("Error creating new chat session:", error);
    throw error;
  }
};

export const addMessageToFirestore = async (
  sessionId: string,
  messageData: { text: string; sender: SenderType }
): Promise<Message> => {
  try {
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
        return convertMessageTimestamp({ id: messageRef.id, ...docSnap.data() });
    } else {
         throw new Error("Failed to add and retrieve message from Firestore");
    }
  } catch (error) {
    console.error(`Error adding message to session ${sessionId}:`, error);
    throw error;
  }
};

export const updateMessageInFirestore = async (
  sessionId: string,
  messageId: string,
  newText: string
): Promise<void> => {
  try {
    const messageRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION, messageId);
    await updateDoc(messageRef, { 
      text: newText,
      timestamp: serverTimestamp() 
    });
    console.log(`Message ${messageId} in session ${sessionId} updated successfully.`);
  } catch (error) {
    console.error(`Error updating message ${messageId} in session ${sessionId}:`, error);
    throw error;
  }
};

export const updateMessageFeedbackInFirestore = async (
  sessionId: string,
  messageId: string,
  feedback: 'good' | 'bad' | null
): Promise<void> => {
  try {
    const messageRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION, messageId);
    await updateDoc(messageRef, { feedback });
    console.log(`Feedback for message ${messageId} in session ${sessionId} updated to ${feedback}.`);
  } catch (error) {
    console.error(`Error updating feedback for message ${messageId} in session ${sessionId}:`, error);
    throw error;
  }
};

export const updateChatSessionTitleInFirestore = async (sessionId: string, newTitle: string): Promise<void> => {
  try {
    const sessionRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId);
    await updateDoc(sessionRef, { title: newTitle });
  } catch (error) {
    console.error(`Error updating title for session ${sessionId}:`, error);
    throw error;
  }
};

export const deleteChatSessionFromFirestore = async (sessionId: string): Promise<void> => {
  try {
    const batch = writeBatch(db);

    // Delete associated session summaries
    const userMemoryDocRef = doc(db, USER_MEMORIES_COLLECTION, DEFAULT_USER_ID);
    const summariesColRef = collection(userMemoryDocRef, SESSION_SUMMARIES_SUBCOLLECTION);
    const summariesQuery = query(summariesColRef, where("sessionId", "==", sessionId));
    const summariesSnapshot = await getDocs(summariesQuery);

    if (!summariesSnapshot.empty) {
        summariesSnapshot.forEach(summaryDoc => {
            batch.delete(summaryDoc.ref);
        });
        console.log(`Marked ${summariesSnapshot.docs.length} summary/summaries for session ${sessionId} for deletion.`);
    } else {
        console.log(`No associated session summaries found for session ${sessionId} to delete.`);
    }

    // Delete messages in the chat session
    const messagesPath = collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION);
    const messagesQuery = query(messagesPath); // No order needed for deletion
    const messagesSnapshot = await getDocs(messagesQuery);

    if (!messagesSnapshot.empty) {
      messagesSnapshot.forEach(messageDoc => {
        batch.delete(messageDoc.ref);
      });
      console.log(`Marked ${messagesSnapshot.docs.length} messages for session ${sessionId} for deletion.`);
    }
    
    // Delete the main chat session document
    const sessionRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId);
    batch.delete(sessionRef);
    console.log(`Marked main chat session document ${sessionId} for deletion.`);

    await batch.commit();
    console.log(`Successfully committed deletions for chat session ${sessionId}, its messages, and associated summaries.`);

  } catch (error) {
    console.error(`Error deleting chat session ${sessionId} and its associated data:`, error);
    throw error;
  }
};

// Renamed and updated to include contentHash
export const addSessionSummaryWithEmbeddingAndHash = async (
  userId: string,
  sessionId: string,
  summaryText: string,
  embeddingVector: number[],
  contentHash: string // New parameter
): Promise<void> => {
  try {
    const userMemoryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId);
    const summariesColRef = collection(userMemoryDocRef, SESSION_SUMMARIES_SUBCOLLECTION);
    await addDoc(summariesColRef, {
      sessionId,
      summaryText,
      embeddingVector,
      contentHash, // Store the hash
      createdAt: serverTimestamp(),
    });
    console.log(`Session summary, embedding, and hash for session ${sessionId} (user ${userId}) added successfully.`);
  } catch (error) {
    console.error(`Error adding session summary, embedding, and hash for session ${sessionId} (user ${userId}):`, error);
  }
};

// Updated to fetch contentHash
export const getAllSessionSummariesWithEmbeddings = async (userId: string): Promise<StoredSessionSummary[]> => {
  try {
    const userMemoryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId);
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
        contentHash: data.contentHash, // Fetch contentHash
      } as StoredSessionSummary;
    });
  } catch (error) {
    console.error(`Error fetching session summaries with embeddings for user ${userId}:`, error);
    return []; 
  }
};

// New function to get the most recent summary for a specific session ID
export const getMostRecentSummaryForSession = async (userId: string, sessionId: string): Promise<StoredSessionSummary | null> => {
  try {
    const userMemoryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId);
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
      } as StoredSessionSummary;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching most recent summary for session ${sessionId}, user ${userId}:`, error);
    return null;
  }
};
