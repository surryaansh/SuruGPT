
import { initializeApp } from 'firebase/app';
// FIX: Changed import from named to namespace import for firestore
// This addresses errors like "Module '"firebase/firestore"' has no exported member 'getFirestore'".
import * as firestore from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig.js'; // Ensure this is a relative path
import { ChatSession, Message, SenderType } from '../types';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// FIX: Use namespaced getFirestore
const db = firestore.getFirestore(app);

const CHAT_SESSIONS_COLLECTION = 'chat_sessions';
const MESSAGES_SUBCOLLECTION = 'messages';

// Helper to convert Firestore Timestamps in a message to JS Date
const convertMessageTimestamp = (messageData: any): Message => {
  const timestamp = messageData.timestamp;
  return {
    ...messageData,
    // FIX: Use namespaced Timestamp for instanceof check
    timestamp: timestamp instanceof firestore.Timestamp ? timestamp.toDate() : new Date(timestamp), // Fallback for potential string dates
  } as Message;
};

// Fetch all chat sessions (metadata, not messages)
export const getChatSessions = async (): Promise<ChatSession[]> => {
  try {
    // FIX: Use namespaced query, collection, orderBy
    const sessionsQuery = firestore.query(firestore.collection(db, CHAT_SESSIONS_COLLECTION), firestore.orderBy('createdAt', 'desc'));
    // FIX: Use namespaced getDocs
    const querySnapshot = await firestore.getDocs(sessionsQuery);
    return querySnapshot.docs.map(docSnapshot => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        title: data.title,
        // FIX: Use namespaced Timestamp for instanceof check
        createdAt: data.createdAt instanceof firestore.Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
        firstMessageTextForTitle: data.firstMessageTextForTitle,
        userId: data.userId,
      } as ChatSession;
    });
  } catch (error) {
    console.error("Error fetching chat sessions:", error);
    throw error;
  }
};

// Fetch messages for a specific chat session
export const getMessagesForSession = async (sessionId: string): Promise<Message[]> => {
  try {
    // FIX: Use namespaced query, collection, orderBy
    const messagesQuery = firestore.query(
      firestore.collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
      firestore.orderBy('timestamp', 'asc')
    );
    // FIX: Use namespaced getDocs
    const querySnapshot = await firestore.getDocs(messagesQuery);
    return querySnapshot.docs.map(docSnapshot => 
      convertMessageTimestamp({ id: docSnapshot.id, ...docSnapshot.data() })
    );
  } catch (error) {
    console.error(`Error fetching messages for session ${sessionId}:`, error);
    throw error;
  }
};

// Create a new chat session
export const createChatSessionInFirestore = async (
  title: string, 
  firstMessageText: string, 
  // userId?: string // For future use
  ): Promise<ChatSession> => {
  try {
    // FIX: Use namespaced addDoc, collection, serverTimestamp
    const newSessionRef = await firestore.addDoc(firestore.collection(db, CHAT_SESSIONS_COLLECTION), {
      title,
      createdAt: firestore.serverTimestamp(), // Use server timestamp
      firstMessageTextForTitle: firstMessageText,
      // userId: userId || null, // For future use
    });

    // Fetch the created document to get the server timestamp resolved
    // FIX: Use namespaced getDoc
    const docSnap = await firestore.getDoc(newSessionRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            id: newSessionRef.id,
            title: data.title,
            // FIX: Use namespaced Timestamp for instanceof check
            createdAt: data.createdAt instanceof firestore.Timestamp ? data.createdAt.toDate() : new Date(), // Fallback
            firstMessageTextForTitle: data.firstMessageTextForTitle,
            // userId: data.userId
        } as ChatSession;
    } else {
        throw new Error("Failed to create and retrieve chat session from Firestore");
    }
  } catch (error) {
    console.error("Error creating new chat session:", error);
    throw error;
  }
};

// Add a message to a chat session
export const addMessageToFirestore = async (
  sessionId: string,
  messageData: { text: string; sender: SenderType }
): Promise<Message> => {
  try {
    // FIX: Use namespaced addDoc, collection, serverTimestamp
    const messageRef = await firestore.addDoc(
      firestore.collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
      {
        ...messageData,
        timestamp: firestore.serverTimestamp(), // Use server timestamp
      }
    );
     // Fetch the created document to get the server timestamp resolved
    // FIX: Use namespaced getDoc
    const docSnap = await firestore.getDoc(messageRef);
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

// Optional: Update chat session title (e.g., if it changes after first few messages)
export const updateChatSessionTitleInFirestore = async (sessionId: string, newTitle: string): Promise<void> => {
  try {
    // FIX: Use namespaced doc, updateDoc
    const sessionRef = firestore.doc(db, CHAT_SESSIONS_COLLECTION, sessionId);
    await firestore.updateDoc(sessionRef, { title: newTitle });
  } catch (error) {
    console.error(`Error updating title for session ${sessionId}:`, error);
    throw error;
  }
};


// Example for real-time listener (optional for now, can be integrated later)
// FIX: Unsubscribe type would also be namespaced if used
// export const listenToMessages = (sessionId: string, callback: (messages: Message[]) => void): firestore.Unsubscribe => {
//   // FIX: Use namespaced query, collection, orderBy, onSnapshot
//   const messagesQuery = firestore.query(
//     firestore.collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
//     firestore.orderBy('timestamp', 'asc')
//   );
//   return firestore.onSnapshot(messagesQuery, (querySnapshot) => {
//     const messages = querySnapshot.docs.map(docSnapshot =>
//       convertMessageTimestamp({ id: docSnapshot.id, ...docSnapshot.data() })
//     );
//     callback(messages);
//   });
// };
