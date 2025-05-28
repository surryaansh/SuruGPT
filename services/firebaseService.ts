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
  deleteDoc,
  setDoc // Added for upserting memory
} from 'firebase/firestore'; 

import { firebaseConfig } from './firebaseConfig.js'; 
import { ChatSession, Message, SenderType } from '../types';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CHAT_SESSIONS_COLLECTION = 'chat_sessions';
const MESSAGES_SUBCOLLECTION = 'messages';
const USER_MEMORIES_COLLECTION = 'user_memories'; // New collection for user memory

const convertMessageTimestamp = (messageData: any): Message => {
  const timestampField = messageData.timestamp;
  return {
    ...messageData,
    timestamp: timestampField instanceof Timestamp ? timestampField.toDate() : new Date(timestampField),
    feedback: messageData.feedback === undefined ? null : messageData.feedback, // Ensure feedback defaults to null
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
        feedback: null, // Initialize feedback as null
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
    const messagesPath = collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION);
    const messagesQuery = query(messagesPath);
    const messagesSnapshot = await getDocs(messagesQuery);

    const batch = writeBatch(db);

    if (!messagesSnapshot.empty) {
      messagesSnapshot.forEach(messageDoc => {
        batch.delete(messageDoc.ref);
      });
    }
    
    const sessionRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId);
    batch.delete(sessionRef);

    await batch.commit();
    console.log(`Successfully deleted chat session ${sessionId} and all its messages.`);

  } catch (error) {
    console.error(`Error deleting chat session ${sessionId}:`, error);
    throw error;
  }
};

// Functions for user memory
export const getUserMemory = async (userId: string): Promise<string | null> => {
  try {
    const memoryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId);
    const docSnap = await getDoc(memoryDocRef);
    if (docSnap.exists()) {
      return docSnap.data()?.memory_summary || null;
    }
    console.log(`No memory found for user ${userId}.`);
    return null;
  } catch (error) {
    console.error(`Error fetching memory for user ${userId}:`, error);
    return null; // Return null on error to allow chat to proceed
  }
};

export const updateUserMemory = async (userId: string, memorySummary: string): Promise<void> => {
  try {
    const memoryDocRef = doc(db, USER_MEMORIES_COLLECTION, userId);
    // Using setDoc with merge: true to create the document if it doesn't exist, or update it if it does.
    await setDoc(memoryDocRef, { memory_summary: memorySummary, updatedAt: serverTimestamp() }, { merge: true });
    console.log(`Memory for user ${userId} updated/created successfully.`);
  } catch (error) {
    console.error(`Error updating memory for user ${userId}:`, error);
    // Do not throw, allow chat flow to continue
  }
};
