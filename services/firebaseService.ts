
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  query,
  orderBy,
  serverTimestamp,
// Fix: Ensure Timestamp is correctly imported from 'firebase/firestore'.
  Timestamp,
  updateDoc
  // onSnapshot, Unsubscribe // For potential real-time updates later (currently commented out)
} from 'firebase/firestore';
import { firebaseConfig, IS_FIREBASE_CONFIG_PLACEHOLDER } from './firebaseConfig'; // Ensure this is a relative path
import { ChatSession, Message, SenderType } from '../types';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let firebaseInitializationError: Error | null = null;

// Fix: Define constants for Firestore collection names
const CHAT_SESSIONS_COLLECTION = 'chatSessions';
const MESSAGES_SUBCOLLECTION = 'messages';

// Initialize Firebase ONLY if the configuration is not using placeholders.
if (!IS_FIREBASE_CONFIG_PLACEHOLDER) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    // console.log("Firebase initialized (not placeholder)."); // Optional: for debugging successful initialization
  } catch (e: any) {
    // Catch errors during initialization (e.g., malformed config even if not placeholder)
    firebaseInitializationError = new Error(`Firebase initialization failed: ${e.message || String(e)}`);
    console.error(firebaseInitializationError.message, e);
    // app and db will remain null, preventing further operations.
  }
} else {
  // console.warn("Firebase configuration uses placeholders. Firebase services are intentionally not initialized."); // Optional: for debugging
}

// Helper to get DB instance or throw appropriate error
const getDbInstance = (): Firestore => {
  if (IS_FIREBASE_CONFIG_PLACEHOLDER) {
    // This error will be shown if any firebaseService function is called while config is placeholder.
    // App.tsx's UI should prevent this by showing the config error screen, but this is a programmatic safeguard.
    throw new Error("Firebase is not configured. Please update services/firebaseConfig.ts with your project credentials. Firebase services are currently disabled.");
  }
  if (firebaseInitializationError) {
    // This error indicates that initialization was attempted (config was not placeholder) but failed.
    throw firebaseInitializationError;
  }
  if (!db) {
    // This is a fallback for an unexpected state: config not placeholder, no init error, but db is still null.
    // It implies an issue with the Firebase SDK's initialization or an incorrect non-placeholder config that didn't throw during initializeApp/getFirestore.
    throw new Error("Firestore database instance is not available. Initialization may have failed or the configuration is incorrect. Please check Firebase project settings and credentials.");
  }
  return db;
};

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
  const currentDb = getDbInstance(); // Ensures Firebase is usable or throws before attempting operation
  try {
    const sessionsQuery = query(collection(currentDb, CHAT_SESSIONS_COLLECTION), orderBy('createdAt', 'desc'));
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
    console.error("Error fetching chat sessions from Firestore:", error);
    throw error; // Re-throw Firestore operation errors to be handled by the caller
  }
};

// Fetch messages for a specific chat session
export const getMessagesForSession = async (sessionId: string): Promise<Message[]> => {
  const currentDb = getDbInstance();
  try {
    const messagesQuery = query(
      collection(currentDb, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
      orderBy('timestamp', 'asc')
    );
    const querySnapshot = await getDocs(messagesQuery);
    return querySnapshot.docs.map(docSnapshot =>
      convertMessageTimestamp({ id: docSnapshot.id, ...docSnapshot.data() })
    );
  } catch (error) {
    console.error(`Error fetching messages for session ${sessionId} from Firestore:`, error);
    throw error;
  }
};

// Create a new chat session
export const createChatSessionInFirestore = async (
  title: string,
  firstMessageText: string,
  // userId?: string // For future use
  ): Promise<ChatSession> => {
  const currentDb = getDbInstance();
  try {
    const newSessionRef = await addDoc(collection(currentDb, CHAT_SESSIONS_COLLECTION), {
      title,
      createdAt: serverTimestamp(), // Use server timestamp
      firstMessageTextForTitle: firstMessageText,
      // userId: userId || null, // For future use
    });

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
        throw new Error("Failed to create and retrieve chat session from Firestore after addDoc.");
    }
  } catch (error) {
    console.error("Error creating new chat session in Firestore:", error);
    throw error;
  }
};

// Add a message to a chat session
export const addMessageToFirestore = async (
  sessionId: string,
  messageData: { text: string; sender: SenderType }
): Promise<Message> => {
  const currentDb = getDbInstance();
  try {
    const messageRef = await addDoc(
      collection(currentDb, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
      {
        ...messageData,
        timestamp: serverTimestamp(), // Use server timestamp
      }
    );
    const docSnap = await getDoc(messageRef);
    if (docSnap.exists()) {
        return convertMessageTimestamp({ id: messageRef.id, ...docSnap.data() });
    } else {
         throw new Error("Failed to add and retrieve message from Firestore after addDoc.");
    }
  } catch (error) {
    console.error(`Error adding message to session ${sessionId} in Firestore:`, error);
    throw error;
  }
};

// Optional: Update chat session title (e.g., if it changes after first few messages)
export const updateChatSessionTitleInFirestore = async (sessionId: string, newTitle: string): Promise<void> => {
  const currentDb = getDbInstance();
  try {
    const sessionRef = doc(currentDb, CHAT_SESSIONS_COLLECTION, sessionId);
    await updateDoc(sessionRef, { title: newTitle });
  } catch (error) {
    console.error(`Error updating title for session ${sessionId} in Firestore:`, error);
    throw error;
  }
};

// Example for real-time listener (optional for now, can be integrated later)
// export const listenToMessages = (sessionId: string, callback: (messages: Message[]) => void): Unsubscribe => {
//   const currentDb = getDbInstance();
//   const messagesQuery = query(
//     collection(currentDb, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
//     orderBy('timestamp', 'asc')
//   );
//   return onSnapshot(messagesQuery, (querySnapshot) => {
//     const messages = querySnapshot.docs.map(docSnapshot =>
//       convertMessageTimestamp({ id: docSnapshot.id, ...docSnapshot.data() })
//     );
//     callback(messages);
//   });
// };
