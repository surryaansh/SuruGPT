
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
      message.text = data.text || '';
      message.feedback = data.feedback === undefined ? null : data.feedback;
      message.timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp || Date.now());
      // If no responses array, create one from top-level fields for consistency
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
        text: firstResponse.text,
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
  newResponseText: string
): Promise<Message> => {
  const messageRef = doc(db, CHAT_SESSIONS_COLLECTION, sessionId, MESSAGES_SUBCOLLECTION, messageId);
  try {
    const newResponseItemForDb = { 
      text: newResponseText,
      feedback: null,
      timestamp: serverTimestamp(),
    };

    const docSnap = await getDoc(messageRef);
    if (!docSnap.exists() || docSnap.data().sender !== SenderType.AI) {
      throw new Error("AI message not found or invalid type for adding response.");
    }
    const existingResponsesCount = (docSnap.data().responses || []).length;
    const newIndex = existingResponsesCount; 

    await updateDoc(messageRef, {
      responses: arrayUnion(newResponseItemForDb),
      currentResponseIndex: newIndex,
    });

    const updatedDocSnap = await getDoc(messageRef);
    if (!updatedDocSnap.exists()) throw new Error("Failed to re-fetch AI message after adding response.");
    
    let finalMessage = convertMessageDocumentToMessage(updatedDocSnap);
    
     if (finalMessage.responses && finalMessage.currentResponseIndex != null && finalMessage.currentResponseIndex < finalMessage.responses.length) {
        const currentActualResponse = finalMessage.responses[finalMessage.currentResponseIndex];
        await updateDoc(messageRef, {
            text: currentActualResponse.text,
            feedback: currentActualResponse.feedback,
            timestamp: Timestamp.fromDate(currentActualResponse.timestamp as Date), // Ensure Firestore Timestamp
            isStreamingThisResponse: false, 
        });
        const finalSnap = await getDoc(messageRef);
        return convertMessageDocumentToMessage(finalSnap);
    }
    return { ...finalMessage, isStreamingThisResponse: false };

  } catch (error) {
    console.error(`Error adding response to AI message ${messageId}:`, error);
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
    const messageData = convertMessageDocumentToMessage(docSnap); 
    
    if (!messageData.responses || newIndex < 0 || newIndex >= messageData.responses.length) {
      console.warn("Invalid newIndex or no responses available during navigation update. Current:", messageData.currentResponseIndex, "New:", newIndex, "Total:", messageData.responses?.length);
      return messageData; 
    }
    
    const currentResponse = messageData.responses[newIndex];
    await updateDoc(messageRef, {
      currentResponseIndex: newIndex,
      text: currentResponse.text,
      feedback: currentResponse.feedback,
      timestamp: Timestamp.fromDate(currentResponse.timestamp as Date), 
      isStreamingThisResponse: false, 
    });

    const updatedDocSnap = await getDoc(messageRef);
    return convertMessageDocumentToMessage(updatedDocSnap);

  } catch (error) {
    console.error(`Error updating AI message navigation for ${messageId}:`, error);
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
    
    let messageData = convertMessageDocumentToMessage(docSnap);
    
    if (!messageData.responses || typeof messageData.currentResponseIndex !== 'number' || 
        messageData.currentResponseIndex < 0 || messageData.currentResponseIndex >= messageData.responses.length) {
      throw new Error("Cannot update feedback: AI message has no responses or invalid index.");
    }

    const currentIdx = messageData.currentResponseIndex;
    
    const updatedResponses = messageData.responses.map((resp, index) => 
      index === currentIdx ? { ...resp, feedback: newFeedbackValue } : resp
    );

    await updateDoc(messageRef, {
      responses: updatedResponses.map(r => ({
        ...r, 
        timestamp: Timestamp.fromDate(r.timestamp as Date) 
      })), 
      feedback: newFeedbackValue, 
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
