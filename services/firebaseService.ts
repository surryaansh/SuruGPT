import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  setDoc,
  onSnapshot, // For potential real-time updates later
  Unsubscribe,
  updateDoc
} from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig'; // Your Firebase config
import { ChatSession, Message, SenderType } from '../types';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CHAT_SESSIONS_COLLECTION = 'chat_sessions';
const MESSAGES_SUBCOLLECTION = 'messages';

// Helper to convert Firestore Timestamps in a message to JS Date
const convertMessageTimestamp = (messageData: any): Message => {
  const timestamp = messageData.timestamp;
  return {
    ...messageData,
    timestamp: timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp), // Fallback for potential string dates
  } as Message;
};

// Fetch all chat sessions (metadata, not messages)
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

// Fetch messages for a specific chat session
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

// Create a new chat session
export const createChatSessionInFirestore = async (
  title: string, 
  firstMessageText: string, 
  // userId?: string // For future use
  ): Promise<ChatSession> => {
  try {
    const newSessionRef = await addDoc(collection(db, CHAT_SESSIONS_COLLECTION), {
      title,
      createdAt: serverTimestamp(), // Use server timestamp
      firstMessageTextForTitle: firstMessageText,
      // userId: userId || null, // For future use
    });

    // Fetch the created document to get the server timestamp resolved
    const docSnap = await getDoc(newSessionRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            id: newSessionRef.id,
            title: data.title,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(), // Fallback
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
    const messageRef = await addDoc(
      collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
      {
        ...messageData,
        timestamp: serverTimestamp(), // Use server timestamp
      }
    );
     // Fetch the created document to get the server timestamp resolved
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

// Optional: Update chat session title (e.g., if it changes after first few messages)
export const updateChatSessionTitleInFirestore = async (sessionId: string, newTitle: string): Promise<void> => {
  try {
    const sessionRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId);
    await updateDoc(sessionRef, { title: newTitle });
  } catch (error) {
    console.error(`Error updating title for session ${sessionId}:`, error);
    throw error;
  }
};


// Example for real-time listener (optional for now, can be integrated later)
// export const listenToMessages = (sessionId: string, callback: (messages: Message[]) => void): Unsubscribe => {
//   const messagesQuery = query(
//     collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
//     orderBy('timestamp', 'asc')
//   );
//   return onSnapshot(messagesQuery, (querySnapshot) => {
//     const messages = querySnapshot.docs.map(docSnapshot =>
//       convertMessageTimestamp({ id: docSnapshot.id, ...docSnapshot.data() })
//     );
//     callback(messages);
//   });
// };
