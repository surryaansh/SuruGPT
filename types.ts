
// FIX: Changed Firebase Firestore import from namespace to named import for Timestamp.
// FIX: Changed import path to use 'firebase/firestore' for Timestamp as it's the correct v9 modular import.
// The import below is standard for Firebase v9. If 'Timestamp' is reported as not exported,
// please ensure Firebase v9+ is correctly installed and that your TypeScript configuration
// resolves modules correctly.
import { Timestamp } from 'firebase/firestore';

export enum SenderType {
  USER = 'user',
  AI = 'ai',
}

export interface AIResponse {
  text: string;
  feedback?: 'good' | 'bad' | null;
  timestamp: Date | Timestamp; // Timestamp of when this specific response was generated
}

export interface Message {
  id: string; // Firestore document ID
  sender: SenderType;
  
  // For User messages OR the currently selected AI response text/timestamp/feedback
  text: string;
  timestamp: Date | Timestamp; 
  feedback?: 'good' | 'bad' | null; 

  // AI-specific fields
  responses?: AIResponse[];
  currentResponseIndex?: number;
  promptText?: string; // The user prompt that led to these AI responses for retrying
  isStreamingThisResponse?: boolean; // True if the text for responses[currentResponseIndex] is currently being streamed
}

export interface ChatSession {
  id: string; // Firestore document ID
  title: string;
  // messages: Message[]; // Messages will be a subcollection, not stored directly on session
  // FIX: Use imported Timestamp directly
  createdAt: Date | Timestamp; // Store as Firestore Timestamp, convert to Date on fetch
  firstMessageTextForTitle?: string; // Store first message text to regenerate title if needed
  userId?: string; // For future multi-user/login feature
}