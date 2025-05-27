
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
  arrayUnion
} from 'firebase/firestore'; 

import { firebaseConfig } from './firebaseConfig.js'; 
import { ChatSession, Message, SenderType, AIResponse } from '../types';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CHAT_SESSIONS_COLLECTION = 'chat_sessions';
const MESSAGES_SUBCOLLECTION = 'messages';

const convertAIResponseTimestamp = (response: any): AIResponse => ({
  ...response,
  timestamp: response.timestamp instanceof Timestamp ? response.timestamp.toDate() : new Date(response.timestamp || Date.now()), // Fallback for potential undefined timestamp during conversion
  feedback: response.feedback === undefined ? null : response.feedback,
});

const convertMessageDocumentToMessage = (docSnapshot: any): Message => {
  const data = docSnapshot.data();
  let message: Message = {
    id: docSnapshot.id,
    sender: data.sender,
    text: data.text, 
    timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp || Date.now()), 
    feedback: data.feedback === undefined ? null : data.feedback, 
    isStreamingThisResponse: data.isStreamingThisResponse || false,
  };

  if (data.sender === SenderType.AI) {
    message.responses = (data.responses || []).map(convertAIResponseTimestamp);
    message.currentResponseIndex = typeof data.currentResponseIndex === 'number' ? data.currentResponseIndex : 0;
    message.promptText = data.promptText;
    
    if (message.responses && message.responses.length > 0 && 
        typeof message.currentResponseIndex === 'number' && 
        message.currentResponseIndex >= 0 && 
        message.currentResponseIndex < message.responses.length) {
      const currentResp = message.responses[message.currentResponseIndex];
      message.text = currentResp.text;
      message.feedback = currentResp.feedback;
      message.timestamp = currentResp.timestamp;
    } else if (message.responses && message.responses.length > 0 && message.currentResponseIndex === undefined) {
      const firstResp = message.responses[0];
      message.text = firstResp.text;
      message.feedback = firstResp.feedback;
      message.timestamp = firstResp.timestamp;
      message.currentResponseIndex = 0;
    } else if (!message.responses || message.responses.length === 0) {
      // This case handles AI messages that might have been created before the 'responses' array structure.
      // It ensures they are compatible by creating a single-element responses array from top-level fields.
      message.text = data.text || '';
      message.feedback = data.feedback === undefined ? null : data.feedback;
      message.timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp || Date.now());
      message.responses = [{ text: message.text, feedback: message.feedback, timestamp: message.timestamp }];
      message.currentResponseIndex = 0;
    }
  }
  return message;
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
    return querySnapshot.docs.map(convertMessageDocumentToMessage);
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
  messageData: Partial<Message> 
): Promise<Message> => {
  try {
    let dataToSave: any;
    const currentServerTimestamp = serverTimestamp(); 

    if (messageData.sender === SenderType.USER) {
      dataToSave = {
        sender: SenderType.USER,
        text: messageData.text,
        timestamp: currentServerTimestamp,
      };
    } else { 
      // For AI messages, 'text' is the content of the first response.
      // 'messageData.isStreamingThisResponse' comes from App.tsx during placeholder creation.
      // If called after stream completion, App.tsx won't pass isStreamingThisResponse, so it defaults to false.
      const firstResponse: AIResponse = {
        text: messageData.text!,
        feedback: null,
        timestamp: currentServerTimestamp as unknown as Timestamp, 
      };
      dataToSave = {
        sender: SenderType.AI,
        promptText: messageData.promptText,
        responses: [firstResponse], 
        currentResponseIndex: 0,
        text: firstResponse.text, // Top-level fields reflect the current (first) response
        feedback: firstResponse.feedback,
        timestamp: currentServerTimestamp, 
        isStreamingThisResponse: messageData.isStreamingThisResponse || false,
      };
    }

    const messageRef = await addDoc(
      collection(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION),
      dataToSave
    );
    
    const docSnap = await getDoc(messageRef);
    if (docSnap.exists()) {
        // convertMessageDocumentToMessage will ensure isStreamingThisResponse is false if undefined in doc.
        return convertMessageDocumentToMessage(docSnap);
    } else {
         throw new Error("Failed to add and retrieve message from Firestore");
    }
  } catch (error) {
    console.error(`Error adding message to session ${sessionId}:`, error);
    throw error;
  }
};

export const updateUserMessageTextInFirestore = async (
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
  } catch (error) {
    console.error(`Error updating user message ${messageId} in session ${sessionId}:`, error);
    throw error;
  }
};

export const addResponseToAIMessageInFirestore = async (
  sessionId: string,
  messageId: string,
  newResponseText: string // This is the full text of the new response variant
): Promise<Message> => {
  const messageRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION, messageId);
  try {
    // Get current state to determine the new index for the responses array
    const initialDocSnap = await getDoc(messageRef);
    if (!initialDocSnap.exists() || initialDocSnap.data().sender !== SenderType.AI) {
      throw new Error("AI message not found or invalid type for adding response.");
    }
    const existingResponses = (initialDocSnap.data().responses || []) as any[];
    const newIndex = existingResponses.length; // New response will be at this index

    // 1. Add the new response (with its full text) to the 'responses' array
    //    and update 'currentResponseIndex' to point to this new response.
    //    Firestore's serverTimestamp() will be used for the new response's timestamp.
    const newResponseItemForDb = { 
      text: newResponseText,
      feedback: null,
      timestamp: serverTimestamp(),
    };
    await updateDoc(messageRef, {
      responses: arrayUnion(newResponseItemForDb),
      currentResponseIndex: newIndex,
    });

    // 2. Read the document again. By now, serverTimestamp() for the new response
    //    will have resolved to an actual Timestamp.
    const docSnapAfterUnion = await getDoc(messageRef);
    if (!docSnapAfterUnion.exists()) {
      throw new Error("Failed to re-fetch AI message after adding response shell.");
    }
    // Convert to client-side Message type. This will also set top-level text, feedback, timestamp
    // based on the new currentResponseIndex. isStreamingThisResponse will be its current DB value.
    const tempMessageState = convertMessageDocumentToMessage(docSnapAfterUnion);

    if (!tempMessageState.responses || tempMessageState.currentResponseIndex == null ||
        tempMessageState.currentResponseIndex < 0 || 
        tempMessageState.currentResponseIndex >= tempMessageState.responses.length) {
      console.error("FirebaseService Error: Inconsistent message state after adding response. Index out of bounds. Attempting recovery.");
      // Fallback: Try to set streaming to false and return the current state.
      await updateDoc(messageRef, { isStreamingThisResponse: false });
      const recoverySnap = await getDoc(messageRef);
      return convertMessageDocumentToMessage(recoverySnap);
    }
    
    // 3. Prepare the final update for top-level fields and ensure isStreamingThisResponse is false.
    //    The currentActualResponse is the newly added one, now with a resolved timestamp.
    const currentActualResponse = tempMessageState.responses[tempMessageState.currentResponseIndex];
    
    await updateDoc(messageRef, {
      text: currentActualResponse.text, // This is newResponseText
      feedback: currentActualResponse.feedback, // Should be null for a new response
      // Ensure the timestamp is a Firestore Timestamp object before saving.
      // convertMessageDocumentToMessage converts Firestore Timestamps to JS Dates, so convert back.
      timestamp: currentActualResponse.timestamp instanceof Date ? Timestamp.fromDate(currentActualResponse.timestamp) : currentActualResponse.timestamp, 
      isStreamingThisResponse: false, // CRITICALLY ensure this is set to false
    });

    // 4. Fetch the absolute final state from Firestore and return
    const finalSnap = await getDoc(messageRef);
    return convertMessageDocumentToMessage(finalSnap);

  } catch (error) {
    console.error(`Error adding response to AI message ${messageId} in session ${sessionId}:`, error);
    throw error;
  }
};

export const updateAIMessageResponseNavigationInFirestore = async (
  sessionId: string,
  messageId: string,
  newIndex: number
): Promise<Message> => {
  const messageRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION, messageId);
  try {
    const docSnap = await getDoc(messageRef);
    if (!docSnap.exists() || docSnap.data().sender !== SenderType.AI) {
      throw new Error("AI message not found or invalid type for navigation.");
    }
    // Use convertMessageDocumentToMessage to work with consistent Message structure
    const messageData = convertMessageDocumentToMessage(docSnap); 
    
    if (!messageData.responses || newIndex < 0 || newIndex >= messageData.responses.length) {
      console.warn(`FirebaseService Warn: Invalid newIndex (${newIndex}) or no responses for navigation. Total responses: ${messageData.responses?.length}. Message ID: ${messageId}`);
      return messageData; // Return current state if navigation is not possible
    }
    
    const newCurrentResponse = messageData.responses[newIndex];
    await updateDoc(messageRef, {
      currentResponseIndex: newIndex,
      text: newCurrentResponse.text,
      feedback: newCurrentResponse.feedback,
      // Ensure timestamp is Firestore Timestamp for saving
      timestamp: newCurrentResponse.timestamp instanceof Date ? Timestamp.fromDate(newCurrentResponse.timestamp) : newCurrentResponse.timestamp, 
      isStreamingThisResponse: false, // Navigating implies the response is not streaming
    });

    const updatedDocSnap = await getDoc(messageRef);
    return convertMessageDocumentToMessage(updatedDocSnap);

  } catch (error) {
    console.error(`Error updating AI message navigation for ${messageId} in session ${sessionId}:`, error);
    throw error;
  }
};


export const updateMessageFeedbackInFirestore = async (
  sessionId: string,
  messageId: string,
  newFeedbackValue: 'good' | 'bad' | null 
): Promise<Message> => {
  const messageRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION, messageId);
  try {
    const docSnap = await getDoc(messageRef);
    if (!docSnap.exists() || docSnap.data().sender !== SenderType.AI) {
      throw new Error("Feedback can only be applied to AI messages.");
    }
    
    let messageData = convertMessageDocumentToMessage(docSnap); // Use converter
    
    if (!messageData.responses || typeof messageData.currentResponseIndex !== 'number' || 
        messageData.currentResponseIndex < 0 || messageData.currentResponseIndex >= messageData.responses.length) {
      throw new Error("Cannot update feedback: AI message has no responses or invalid currentResponseIndex.");
    }

    const currentIdx = messageData.currentResponseIndex;
    
    // Create a new responses array with updated feedback for the specific response
    const updatedResponses = messageData.responses.map((resp, index) => 
      index === currentIdx ? { ...resp, feedback: newFeedbackValue } : resp
    );

    // When saving back, ensure all timestamps in the responses array are Firestore Timestamps
    const responsesForDb = updatedResponses.map(r => ({
      ...r, 
      timestamp: r.timestamp instanceof Date ? Timestamp.fromDate(r.timestamp) : r.timestamp,
    }));

    await updateDoc(messageRef, {
      responses: responsesForDb, 
      feedback: newFeedbackValue, // Update top-level feedback to match current response's feedback
    });

    const updatedDocSnap = await getDoc(messageRef);
    return convertMessageDocumentToMessage(updatedDocSnap);

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

  } catch (error) {
    console.error(`Error deleting chat session ${sessionId}:`, error);
    throw error;
  }
};
