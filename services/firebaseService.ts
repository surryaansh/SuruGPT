
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
  // setDoc // No longer needed for main memory_json_array
} from 'firebase/firestore'; 

import { firebaseConfig } from './firebaseConfig.js'; 
import { ChatSession, Message, SenderType } from '../types';

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
    });

    const docSnap = await getDoc(newSessionRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            id: newSessionRef.id,
            title: data.title,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(), 
            firstMessageTextForTitle: data.firstMessageTextForTitle,
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
    // Also delete associated session summaries if they exist
    const userMemoryDocRef = doc(db, USER_MEMORIES_COLLECTION, "default_user"); // Assuming DEFAULT_USER_ID
    const summariesColRef = collection(userMemoryDocRef, SESSION_SUMMARIES_SUBCOLLECTION);
    const summariesQuery = query(summariesColRef, where("sessionId", "==", sessionId));
    const summariesSnapshot = await getDocs(summariesQuery);

    const batch = writeBatch(db);

    if (!summariesSnapshot.empty) {
        summariesSnapshot.forEach(summaryDoc => {
            batch.delete(summaryDoc.ref);
        });
        console.log(`Marked summaries for session ${sessionId} for deletion.`);
    }

    const messagesPath = collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION);
    const messagesQuery = query(messagesPath);
    const messagesSnapshot = await getDocs(messagesQuery);

    if (!messagesSnapshot.empty) {
      messagesSnapshot.forEach(messageDoc => {
        batch.delete(messageDoc.ref);
      });
    }
    
    const sessionRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId);
    batch.delete(sessionRef);

    await batch.commit();
    console.log(`Successfully deleted chat session ${sessionId}, its messages, and associated summaries.`);

  } catch (error) {
    console.error(`Error deleting chat session ${sessionId}:`, error);
    throw error;
  }
};

// getUserMemory and updateUserMemory (for memory_json_array) are removed.

// Function for session summaries with embeddings (store)
export const addSessionSummaryWithEmbedding = async (
  userId: string,
  sessionId: string,
  summaryText: string,
  embeddingVector: number[]
): Promise<void> => {
  try {
    const userMemoryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId);
    const summariesColRef = collection(userMemoryDocRef, SESSION_SUMMARIES_SUBCOLLECTION);
    await addDoc(summariesColRef, {
      sessionId,
      summaryText,
      embeddingVector,
      createdAt: serverTimestamp(),
    });
    console.log(`Session summary and embedding for session ${sessionId} (user ${userId}) added successfully.`);
  } catch (error) {
    console.error(`Error adding session summary and embedding for session ${sessionId} (user ${userId}):`, error);
  }
};

// New function to get all session summaries with embeddings
export interface StoredSessionSummary {
  id: string; // Firestore document ID of the summary entry
  sessionId: string; // Original chat session ID
  summaryText: string;
  embeddingVector: number[];
  createdAt: Date;
}

export const getAllSessionSummariesWithEmbeddings = async (userId: string): Promise<StoredSessionSummary[]> => {
  try {
    const userMemoryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId);
    const summariesColRef = collection(userMemoryDocRef, SESSION_SUMMARIES_SUBCOLLECTION);
    const summariesQuery = query(summariesColRef, orderBy('createdAt', 'desc')); // Get most recent first
    
    const querySnapshot = await getDocs(summariesQuery);
    return querySnapshot.docs.map(docSnapshot => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        sessionId: data.sessionId,
        summaryText: data.summaryText,
        embeddingVector: data.embeddingVector,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
      } as StoredSessionSummary;
    });
  } catch (error) {
    console.error(`Error fetching session summaries with embeddings for user ${userId}:`, error);
    return []; // Return empty array on error
  }
};

// Need to re-import `where` if it's used.
// It IS used now in deleteChatSessionFromFirestore
import { where } from 'firebase/firestore';
