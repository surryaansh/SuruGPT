
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { firebaseConfig } from './services/firebaseConfig'; // Ensure this has your actual config
import { initializeApp } from 'firebase/app';

import { Message, SenderType, ChatSession } from './types';
import Header from './components/Header';
import WelcomeMessage from './components/WelcomeMessage';
import ChatMessageList from './components/ChatMessageList';
import ChatInputBar from './components/ChatInputBar';
import Sidebar from './components/Sidebar';
import ConfirmationDialog from './components/ConfirmationDialog';
import {
  sendMessageStream,
  isChatAvailable as checkChatAvailability,
  startNewOpenAIChatSession as resetAiContextWithSystemPrompt,
  setConversationContextFromAppMessages,
  triggerMemoryUpdateForSession
} from './services/openAIService';
import {
  getChatSessions,
  getMessagesForSession,
  createChatSessionInFirestore,
  addMessageToFirestore,
  updateMessageInFirestore,
  deleteChatSessionFromFirestore,
  updateMessageFeedbackInFirestore,
} from './services/firebaseService';
import { IconHeart } from './constants'; // IconKawaiiSuru removed, IconHeart is used


// Initialize Firebase App and Auth
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const DESIGNATED_OWNER_EMAIL = "lilquee.master@gmail.com";
const DISPLAY_NAME = "Minnie";


const summarizeTextForTitle = async (text: string, userId: string | null): Promise<string | null> => {
  if (!userId) return null; // Need userId for API call
  console.log("[App][summarizeTextForTitle] Attempting to summarize:", text);
  try {
    const response = await fetch(`${window.location.origin}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textToSummarize: text, userId: userId }),
    });
    console.log('[App][summarizeTextForTitle] API Response Status:', response.status, response.statusText);
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[App][summarizeTextForTitle] Summarization API error. Status:', response.status, 'Body:', errorBody);
      return null;
    }
    const data = await response.json();
    console.log('[App][summarizeTextForTitle] API Response Data:', data);
    if (data && data.summary && typeof data.summary === 'string' && data.summary.trim() !== "") {
      return data.summary.trim();
    }
    console.warn('[App][summarizeTextForTitle] Summary was null, empty, or not a string. Data received:', data);
    return null;
  } catch (error) {
    console.error('[App][summarizeTextForTitle] Failed to fetch summary due to network or parsing error:', error);
    return null;
  }
};

const generateFallbackTitle = (firstMessageText: string): string => {
  if (!firstMessageText) return `Chat @ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const words = firstMessageText.split(' ');
  if (words.length > 5) {
    return words.slice(0, 5).join(' ') + '...';
  }
  return firstMessageText;
};

const generateChatTitle = async (firstMessageText: string, userId: string | null): Promise<string> => {
  const timestampTitle = `Chat @ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (!userId || !firstMessageText || firstMessageText.trim() === "") {
    console.log("[App][generateChatTitle] No first message text or userId, using timestamp title.");
    return timestampTitle;
  }
  console.log("[App][generateChatTitle] Attempting to generate title for:", `"${firstMessageText}"`);
  const summary = await summarizeTextForTitle(firstMessageText, userId);
  if (summary) {
    console.log("[App][generateChatTitle] Using summarized title:", `"${summary}"`);
    return summary;
  }
  const fallback = generateFallbackTitle(firstMessageText);
  console.log("[App][generateChatTitle] Summarization failed or returned empty, using fallback title:", `"${fallback}"`);
  return fallback;
};

const INACTIVITY_TIMEOUT_DURATION_MS = 1 * 60 * 1000; // 1 minute
const LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY = 'surugpt_activeChatId_owner';
const SESSION_STORAGE_RELOAD_STATE_KEY = 'surugpt_reloadState'; // Key for richer reload state object

type MainContentState = 'AUTH_LOADING' | 'LOGIN_SCREEN' | 'SESSIONS_LOADING' | 'RESTORING_SESSION' | 'MESSAGES_LOADING' | 'NEW_CHAT_EXPERIENCE' | 'CHAT_VIEW' | 'INITIALIZING';


const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [justLoggedIn, setJustLoggedIn] = useState(false); // For login animation


  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [allChatSessions, setAllChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [isLoadingAiResponse, setIsLoadingAiResponse] = useState<boolean>(false);
  const [isSessionsLoading, setIsSessionsLoading] = useState<boolean>(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState<boolean>(false);

  const [chatReady, setChatReady] = useState<boolean>(true);

  const [isDesktopView, setIsDesktopView] = useState(window.innerWidth >= 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);

  const [globalContextSummary, setGlobalContextSummary] = useState<string>('');

  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [sessionToConfirmDelete, setSessionToConfirmDelete] = useState<{ id: string, title: string } | null>(null);

  const inactivityTimerRef = useRef<number | null>(null);
  const activeChatIdForTimerRef = useRef<string | null>(null);
  const currentMessagesForTimerRef = useRef<Message[]>([]);
  const heartsContainerRef = useRef<HTMLDivElement>(null);

  const initialPersistedIdFromLocalStorageRef = useRef<string | null>(null);
  const initialLoadAndRestoreAttemptCompleteRef = useRef<boolean>(false);
  const initialViewSetupDone = useRef(false);
  const isInitialLoadLogicRunning = useRef<boolean>(false); 

  const activeChatIdRef = useRef(activeChatId);
  const isLoadingAiResponseRef = useRef(isLoadingAiResponse);
  const previousActiveSessionIdToProcessOnNewChatRef = useRef<string | null>(null);


  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    isLoadingAiResponseRef.current = isLoadingAiResponse;
  }, [isLoadingAiResponse]);


  useEffect(() => {
    const handleBeforeUnload = () => {
      const currentAuthUser = auth.currentUser;
      const currentUid = currentAuthUser?.uid;
      const currentActiveChat = activeChatIdRef.current; 

      console.log(`[App] onbeforeunload: Fired. UID: ${currentUid}, Active Chat (from ref): ${currentActiveChat}`);

      if (currentUid && currentActiveChat && !currentActiveChat.startsWith("PENDING_")) {
        const reloadState = {
          isReloading: true,
          activeChatIdForReload: currentActiveChat,
          timestamp: new Date().toISOString()
        };
        sessionStorage.setItem(`${SESSION_STORAGE_RELOAD_STATE_KEY}_${currentUid}`, JSON.stringify(reloadState));
        console.log(`[App] onbeforeunload: Set reloadState in sessionStorage for user ${currentUid}:`, reloadState);
      } else {
        console.log(`[App] onbeforeunload: Conditions not met to set reloadState. currentUid: ${currentUid}, currentActiveChat (from ref): ${currentActiveChat}`);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []); 


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email === DESIGNATED_OWNER_EMAIL) {
        setCurrentUser(user);
        setJustLoggedIn(true); // Trigger login animation
        setTimeout(() => setJustLoggedIn(false), 600); // Reset after animation (0.5s duration + buffer)
        console.log("[App] Owner authenticated:", user.uid, user.email);
        initialPersistedIdFromLocalStorageRef.current = localStorage.getItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${user.uid}`);
        console.log(`[App] onAuthStateChanged: Read initialPersistedIdFromLocalStorageRef for user ${user.uid}:`, initialPersistedIdFromLocalStorageRef.current);
      } else {
        setCurrentUser(null);
        setJustLoggedIn(false);
        initialPersistedIdFromLocalStorageRef.current = null;
        if (user) {
          console.warn("[App] Non-owner user attempted login:", user.email);
          signOut(auth);
          setLoginError("Access denied. This application is for a designated user only.");
        }
      }
      setIsLoadingAuth(false);
      initialLoadAndRestoreAttemptCompleteRef.current = false;
      isInitialLoadLogicRunning.current = false; 
      previousActiveSessionIdToProcessOnNewChatRef.current = null; // Clear on auth change
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoadingAuth(true);
    try {
      await signInWithEmailAndPassword(auth, DESIGNATED_OWNER_EMAIL, passwordInput);
      setPasswordInput('');
      // setJustLoggedIn(true) is now handled in onAuthStateChanged
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        
