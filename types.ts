
// FIX: Changed Firebase Firestore import from namespace to named import for Timestamp.
// FIX: Changed import path to use 'firebase/firestore' for Timestamp as it's the correct v9 modular import.
// The import below is standard for Firebase v9. If 'Timestamp' is reported as not exported,
// please ensure Firebase v9+ is correctly installed and that your TypeScript configuration
// resolves modules correctly.
import { Timestamp } from 'firebase/firestore';

export interface Message {
  id: string; // Firestore document ID
  text: string;
  sender: 'user' | 'ai';
  // FIX: Use imported Timestamp directly
  timestamp: Date | Timestamp; // Store as Firestore Timestamp, convert to Date on fetch
  feedback?: 'good' | 'bad' | null; // User feedback on AI messages
}

export enum SenderType {
  USER = 'user',
  AI = 'ai',
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

// This interface is used in firebaseService.ts for fetching summaries
// and needs to be consistent with the data structure in Firestore.
export interface StoredSessionSummary {
  id: string; // Firestore document ID of the summary entry
  sessionId: string; // Original chat session ID
  summaryText: string;
  embeddingVector: number[];
  createdAt: Date;
  contentHash?: string; // Hash of the session content when this summary was created
}
