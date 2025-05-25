
// FIX: Changed import from named to namespace import for firestore
import * as firestore from 'firebase/firestore';

export interface Message {
  id: string; // Firestore document ID
  text: string;
  sender: 'user' | 'ai';
  // FIX: Use namespaced Timestamp
  timestamp: Date | firestore.Timestamp; // Store as Firestore Timestamp, convert to Date on fetch
}

export enum SenderType {
  USER = 'user',
  AI = 'ai',
}

export interface ChatSession {
  id: string; // Firestore document ID
  title: string;
  // messages: Message[]; // Messages will be a subcollection, not stored directly on session
  // FIX: Use namespaced Timestamp
  createdAt: Date | firestore.Timestamp; // Store as Firestore Timestamp, convert to Date on fetch
  firstMessageTextForTitle?: string; // Store first message text to regenerate title if needed
  userId?: string; // For future multi-user/login feature
}
