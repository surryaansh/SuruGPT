
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
import { IconHeart, IconLogout, IconTrash } from './constants'; // Changed from IconKawaiiSuru, Added IconLogout, IconTrash


// Initialize Firebase App and Auth
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const DESIGNATED_OWNER_EMAIL = "mehtamanvi29oct@gmail.com";
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
  
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false);


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

  const [appFadeInAnimation, setAppFadeInAnimation] = useState('');
  const [appFadeOutAnimation, setAppFadeOutAnimation] = useState('');
  const prevCurrentUserRef = useRef<User | null>(null);


  useEffect(() => {
    if (!isLoadingAuth && currentUser && !prevCurrentUserRef.current) {
      setAppFadeInAnimation('animate-fadeInUpSlightly');
      setAppFadeOutAnimation(''); // Clear any lingering fade-out
    }
    prevCurrentUserRef.current = currentUser;
  }, [currentUser, isLoadingAuth]);


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
        console.log("[App] Owner authenticated:", user.uid, user.email);
        initialPersistedIdFromLocalStorageRef.current = localStorage.getItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${user.uid}`);
        console.log(`[App] onAuthStateChanged: Read initialPersistedIdFromLocalStorageRef for user ${user.uid}:`, initialPersistedIdFromLocalStorageRef.current);
      } else {
        setCurrentUser(null);
        setAppFadeInAnimation(''); 
        setAppFadeOutAnimation('');
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
      previousActiveSessionIdToProcessOnNewChatRef.current = null; 
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
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        setLoginError('Invalid password. Please try again.');
      } else {
        setLoginError('Login failed. Please try again later.');
      }
      setIsLoadingAuth(false);
    }
  };

  const processEndedSessionForMemory = useCallback(async (ownerUid: string, endedSessionId: string, endedSessionMessages: Message[]) => {
    if (!ownerUid) {
      console.warn("[App][processEndedSessionForMemory] Called without ownerUid. Skipping.");
      return;
    }

    if (endedSessionId === activeChatIdRef.current && isLoadingAiResponseRef.current) {
      console.log(`[App][processEndedSessionForMemory] Skipped memory update for session ${endedSessionId} because it is currently the active chat and loading an AI response.`);
      return;
    }

    if (endedSessionId && endedSessionMessages.length > 0 && !endedSessionId.startsWith("PENDING_")) {
      console.log(`[App][processEndedSessionForMemory] Triggering memory update for user ${ownerUid}, session: ${endedSessionId}. Message count: ${endedSessionMessages.length}`);
      try {
        await triggerMemoryUpdateForSession(ownerUid, endedSessionId, endedSessionMessages);
        console.log(`[App][processEndedSessionForMemory] Memory update request for session ${endedSessionId} (user ${ownerUid}) successfully sent/completed.`);
      } catch (error) {
        console.error(`[App][processEndedSessionForMemory] Error during memory update for session ${endedSessionId} (user ${ownerUid}):`, error);
      }
    } else if (endedSessionId.startsWith("PENDING_")) {
      console.log(`[App][processEndedSessionForMemory] Skipped memory update for PENDING session ID: ${endedSessionId}`);
    } else if (endedSessionMessages.length === 0) {
      console.log(`[App][processEndedSessionForMemory] Skipped memory update for session ${endedSessionId} (user ${ownerUid}) as it has no messages.`);
    } else {
      console.log(`[App][processEndedSessionForMemory] Conditions not met for memory update. SessionID: ${endedSessionId}, Message Count: ${endedSessionMessages.length}, OwnerUID: ${ownerUid}`);
    }
  }, []); 

  const handleRequestLogoutConfirmation = () => {
    setIsLogoutConfirmationOpen(true);
  };

  const handleCancelLogout = () => {
    setIsLogoutConfirmationOpen(false);
  };

  const handleLogout = async () => {
    setIsLogoutConfirmationOpen(false);
    setAppFadeOutAnimation('animate-fadeOutDownSlightly');

    setTimeout(async () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      const endedSessionId = activeChatIdForTimerRef.current;
      const endedSessionMessages = endedSessionId ? [...currentMessagesForTimerRef.current] : [];

      const loggingOutUid = currentUser?.uid;
      console.log(`[App] handleLogout: Initiated for user ${loggingOutUid}. Ended session ID: ${endedSessionId}`);

      if (currentUser && endedSessionId && endedSessionMessages.length > 0 && !endedSessionId.startsWith("PENDING_")) {
        await processEndedSessionForMemory(currentUser.uid, endedSessionId, endedSessionMessages);
      }
      
      previousActiveSessionIdToProcessOnNewChatRef.current = null;
      console.log("[App][handleLogout] Cleared previousActiveSessionIdToProcessOnNewChatRef.");

      await signOut(auth);

      if (loggingOutUid) {
        localStorage.removeItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${loggingOutUid}`);
        sessionStorage.removeItem(`${SESSION_STORAGE_RELOAD_STATE_KEY}_${loggingOutUid}`);
        console.log(`[App] handleLogout: Cleared localStorage (activeChatId) & sessionStorage (reloadState) for user ${loggingOutUid}.`);
      }

      setActiveChatId(null);
      setCurrentMessages([]);
      setAllChatSessions([]);
      setGlobalContextSummary('');
      initialLoadAndRestoreAttemptCompleteRef.current = false;
      isInitialLoadLogicRunning.current = false; 
      initialPersistedIdFromLocalStorageRef.current = null;
      
      setAppFadeInAnimation(''); 
      setAppFadeOutAnimation(''); 
      console.log("[App] User logout process completed.");
    }, 500); // Animation duration
  };


  useEffect(() => {
    if (currentUser && activeChatId && !activeChatId.startsWith("PENDING_")) {
      localStorage.setItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${currentUser.uid}`, activeChatId);
      console.log(`[App] Persisted activeChatId to localStorage for user ${currentUser.uid}: ${activeChatId} (current session).`);
    }
  }, [activeChatId, currentUser]);


  useEffect(() => {
    activeChatIdForTimerRef.current = activeChatId;
    currentMessagesForTimerRef.current = currentMessages;
  }, [activeChatId, currentMessages]);


  useEffect(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (currentUser && activeChatId && currentMessages.length > 0 && !activeChatId.startsWith("PENDING_")) { 
      const sessionStillActiveId = activeChatId;
      console.log(`[App] Setting inactivity timer for session: ${sessionStillActiveId} (user: ${currentUser.uid})`);
      inactivityTimerRef.current = window.setTimeout(() => {
        if (currentUser && activeChatIdForTimerRef.current &&
            activeChatIdForTimerRef.current === sessionStillActiveId &&
            activeChatId === sessionStillActiveId && 
            currentMessagesForTimerRef.current && currentMessagesForTimerRef.current.length > 0) {
          console.log(`[App] Inactivity timer fired for session: ${activeChatIdForTimerRef.current}. Processing for memory.`);
          processEndedSessionForMemory(currentUser.uid, activeChatIdForTimerRef.current, currentMessagesForTimerRef.current);
        } else {
          console.log(`[App] Inactivity timer fired, but conditions changed. Timer for ${sessionStillActiveId} ignored. Current activeChatId: ${activeChatId}`);
        }
      }, INACTIVITY_TIMEOUT_DURATION_MS);
    }
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [currentUser, activeChatId, currentMessages, processEndedSessionForMemory]);


  const handleToggleSidebar = useCallback(() => setIsSidebarOpen(prev => !prev), []);

  useEffect(() => {
    const handleResizeAndUpdateInitialView = () => {
      const currentIsDesktop = window.innerWidth >= 768;
      setIsDesktopView(currentIsDesktop);
      if (!initialViewSetupDone.current) {
        setIsSidebarOpen(currentIsDesktop);
        initialViewSetupDone.current = true;
      }
    };
    handleResizeAndUpdateInitialView();
    window.addEventListener('resize', handleResizeAndUpdateInitialView);
    return () => window.removeEventListener('resize', handleResizeAndUpdateInitialView);
  }, []);

  const handleSelectChat = useCallback(async (chatId: string) => {
    if (!currentUser) {
      console.warn("[App][handleSelectChat] No current user. Aborting.");
      return;
    }
    
    previousActiveSessionIdToProcessOnNewChatRef.current = null;
    console.log("[App][handleSelectChat] Cleared previousActiveSessionIdToProcessOnNewChatRef.");

    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

    const endedSessionId = activeChatIdForTimerRef.current;
    const endedSessionMessages = (endedSessionId && endedSessionId !== chatId && !endedSessionId.startsWith("PENDING_")) 
      ? [...currentMessagesForTimerRef.current] 
      : [];

    console.log(`[App][handleSelectChat] Selecting chat ${chatId}. Previous active: ${endedSessionId}`);

    if (activeChatId === chatId && currentMessages.length > 0) {
      console.log(`[App][handleSelectChat] Chat ${chatId} already active. Sidebar closed if mobile.`);
      if (!isDesktopView) setIsSidebarOpen(false);
      return;
    }

    setActiveChatId(chatId); 
    setCurrentMessages([]);
    setIsMessagesLoading(true);
    if (!isDesktopView) setIsSidebarOpen(false);

    if (currentUser && endedSessionId && endedSessionId !== chatId && endedSessionMessages.length > 0) {
      console.log(`[App][handleSelectChat] Processing ended session ${endedSessionId} for memory.`);
      await processEndedSessionForMemory(currentUser.uid, endedSessionId, endedSessionMessages);
    }

    try {
      console.log(`[App][handleSelectChat] Fetching messages for chat ${chatId}.`);
      const messages = await getMessagesForSession(currentUser.uid, chatId);
      setCurrentMessages(messages);
      setConversationContextFromAppMessages(
        messages.map(m => ({ ...m, timestamp: new Date(m.timestamp as Date) })),
        undefined,
        globalContextSummary
      );
      console.log(`[App][handleSelectChat] Successfully loaded ${messages.length} messages for chat ${chatId}.`);
    } catch (error) {
      console.error(`[App][handleSelectChat] Failed to load messages for chat ${chatId}:`, error);
      setCurrentMessages([{ id: crypto.randomUUID(), text: "Error loading messages.", sender: SenderType.AI, timestamp: new Date(), feedback: null }]);
    } finally {
      setIsMessagesLoading(false);
      console.log(`[App][handleSelectChat] Message loading finished for chat ${chatId}.`);
    }
  }, [currentUser, globalContextSummary, isDesktopView, processEndedSessionForMemory, activeChatId, currentMessages.length]);


  useEffect(() => {
    if (!currentUser || initialLoadAndRestoreAttemptCompleteRef.current) {
        console.log(`[App] Initial Load useEffect: Skipped. currentUser: ${!!currentUser}, initialLoadAndRestoreAttemptCompleteRef: ${initialLoadAndRestoreAttemptCompleteRef.current}`);
        return;
    }

    if (isInitialLoadLogicRunning.current) {
        console.log("[App] Initial Load useEffect: Skipped, logic already running.");
        return;
    }

    const loadInitialData = async () => {
        if (!currentUser) return;

        isInitialLoadLogicRunning.current = true;
        console.log(`[App] Initial Load (User: ${currentUser.uid}): Starting.`);
        setIsSessionsLoading(true);

        let reloadState = null;
        const reloadStateKey = `${SESSION_STORAGE_RELOAD_STATE_KEY}_${currentUser.uid}`;
        try {
            const storedReloadState = sessionStorage.getItem(reloadStateKey);
            if (storedReloadState) reloadState = JSON.parse(storedReloadState);
        } catch (e) { console.error(`[App] Initial Load (User: ${currentUser.uid}): Error parsing reloadState`, e); }
        sessionStorage.removeItem(reloadStateKey); // Remove after reading

        try {
            const sessions = await getChatSessions(currentUser.uid);
            setAllChatSessions(sessions);
            console.log(`[App] Initial Load (User: ${currentUser.uid}): Fetched ${sessions.length} sessions.`);

            const persistedChatIdForUiRestoreFromReload = reloadState?.isReloading ? reloadState.activeChatIdForReload : null;
            const idFromLastBrowserClose = initialPersistedIdFromLocalStorageRef.current;
            console.log(`[App] Initial Load (User: ${currentUser.uid}): idFromLastBrowserClose = ${idFromLastBrowserClose}, persistedChatIdForUiRestoreFromReload = ${persistedChatIdForUiRestoreFromReload}`);


            if (persistedChatIdForUiRestoreFromReload && sessions.some(s => s.id === persistedChatIdForUiRestoreFromReload)) {
                console.log(`[App] Initial Load (User: ${currentUser.uid}): Page reload detected for session ${persistedChatIdForUiRestoreFromReload}. Restoring UI and processing session.`);
                const messagesForReloadedSession = await getMessagesForSession(currentUser.uid, persistedChatIdForUiRestoreFromReload);
                if (messagesForReloadedSession.length > 0) {
                    console.log(`[App] Initial Load (User: ${currentUser.uid}): Processing reloaded session ${persistedChatIdForUiRestoreFromReload} for memory (due to page reload).`);
                    await processEndedSessionForMemory(currentUser.uid, persistedChatIdForUiRestoreFromReload, messagesForReloadedSession);
                }
                previousActiveSessionIdToProcessOnNewChatRef.current = null; 
                console.log(`[App] Initial Load (User: ${currentUser.uid}): Cleared previousActiveSessionIdToProcessOnNewChatRef due to reload path.`);
                await handleSelectChat(persistedChatIdForUiRestoreFromReload);
            } else {
                console.log(`[App] Initial Load (User: ${currentUser.uid}): Fresh app open or invalid/stale reload state. Setting to new chat experience.`);
                setActiveChatId(null); 
                setCurrentMessages([]);
                if (currentUser) { // Ensure currentUser is available before removing from localStorage
                    localStorage.removeItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${currentUser.uid}`);
                    console.log(`[App] Initial Load (User: ${currentUser.uid}): Cleared activeChatId from localStorage for new chat experience.`);
                }
                

                if (idFromLastBrowserClose) {
                    const sessionExists = sessions.some(s => s.id === idFromLastBrowserClose);
                    console.log(`[App] Initial Load (User: ${currentUser.uid}): Checking idFromLastBrowserClose '${idFromLastBrowserClose}'. Does it exist in fetched sessions? ${sessionExists}`);
                    if (sessionExists) {
                        console.log(`[App] Initial Load (User: ${currentUser.uid}): Session ${idFromLastBrowserClose} (from last browser close) identified and exists. Will be processed for memory upon sending the first message in this new chat experience.`);
                        previousActiveSessionIdToProcessOnNewChatRef.current = idFromLastBrowserClose;
                    } else {
                        console.log(`[App] Initial Load (User: ${currentUser.uid}): Session ${idFromLastBrowserClose} (from last browser close) was NOT FOUND in current sessions list. Not queueing for memory processing.`);
                        previousActiveSessionIdToProcessOnNewChatRef.current = null; 
                    }
                } else {
                    console.log(`[App] Initial Load (User: ${currentUser.uid}): No 'idFromLastBrowserClose' found. Not queueing any session for memory processing.`);
                    previousActiveSessionIdToProcessOnNewChatRef.current = null; 
                }
                resetAiContextWithSystemPrompt(undefined, globalContextSummary);
            }
        } catch (error) {
            console.error("[App] Failed during initial data load:", error);
            setActiveChatId(null); setCurrentMessages([]);
            previousActiveSessionIdToProcessOnNewChatRef.current = null;
            if (currentUser) localStorage.removeItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${currentUser.uid}`);
        } finally {
            setIsSessionsLoading(false);
            setChatReady(checkChatAvailability());
            initialLoadAndRestoreAttemptCompleteRef.current = true;
            isInitialLoadLogicRunning.current = false;
            console.log(`[App] Initial Load (User: ${currentUser.uid}): Completed. previousActiveSessionIdToProcessOnNewChatRef is now: ${previousActiveSessionIdToProcessOnNewChatRef.current}`);
        }
    };

    loadInitialData();

}, [currentUser, processEndedSessionForMemory, handleSelectChat, globalContextSummary]);


  useEffect(() => {
    if (allChatSessions.length > 0) {
      const MAX_TITLES_IN_SUMMARY = 3;
      const allSanitizedTitles = allChatSessions.map(s => s.title.replace(/[^\w\s.,!?']/gi, '').trim()).filter(t => t.length > 0);
      const uniqueRecentTitles: string[] = [];
      const seenTitles = new Set<string>();
      for (const title of allSanitizedTitles) {
        if (!seenTitles.has(title)) {
          seenTitles.add(title); uniqueRecentTitles.push(title);
          if (uniqueRecentTitles.length >= MAX_TITLES_IN_SUMMARY) break;
        }
      }
      if (uniqueRecentTitles.length > 0) {
        setGlobalContextSummary(`Key topics from recent chat sessions include: ${uniqueRecentTitles.join('; ')}.`);
      } else { setGlobalContextSummary(''); }
    } else { setGlobalContextSummary(''); }
  }, [allChatSessions]);

  useEffect(() => {
    if (currentUser && initialLoadAndRestoreAttemptCompleteRef.current) {
      if (activeChatId === null) {
        resetAiContextWithSystemPrompt(undefined, globalContextSummary);
      }
    }
  }, [currentUser, globalContextSummary, activeChatId]);

  const warmUpApis = useCallback(() => {
    const endpoints = ['/api/chat', '/api/summarize'];
    console.log("[App] Attempting to warm up APIs:", endpoints.join(', '));
    endpoints.forEach(endpoint => {
      fetch(`${window.location.origin}${endpoint}`, { method: 'GET', cache: 'no-store' })
        .then(res => {
          if (res.ok) console.log(`[App] API ${endpoint} warm-up successful.`);
          else console.warn(`[App] API ${endpoint} warm-up ping returned non-OK status:`, res.status);
        })
        .catch(err => console.warn(`[App] API ${endpoint} warm-up ping request failed:`, err));
    });
  }, []);


  const handleNewChat = useCallback(async () => {
    if (!currentUser) return;
    warmUpApis();
    
    previousActiveSessionIdToProcessOnNewChatRef.current = null;
    console.log("[App][handleNewChat] Cleared previousActiveSessionIdToProcessOnNewChatRef.");

    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

    const endedSessionId = activeChatIdForTimerRef.current;
    const endedSessionMessages = (endedSessionId && !endedSessionId.startsWith("PENDING_")) 
        ? [...currentMessagesForTimerRef.current] 
        : [];

    setCurrentMessages([]);
    setActiveChatId(null);
    if (currentUser) {
      localStorage.removeItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${currentUser.uid}`);
      console.log(`[App][handleNewChat] Cleared activeChatId from localStorage for user ${currentUser.uid}.`);
    }
    if (!isDesktopView) setIsSidebarOpen(false);

    resetAiContextWithSystemPrompt(undefined, globalContextSummary);

    if (currentUser && endedSessionId && endedSessionMessages.length > 0) {
      await processEndedSessionForMemory(currentUser.uid, endedSessionId, endedSessionMessages);
    }
  }, [currentUser, globalContextSummary, isDesktopView, processEndedSessionForMemory, warmUpApis]);


  const getAiResponse = useCallback(async (
    textForAi: string,
    currentSessionIdForAi: string | null
  ) => {
    if (!currentUser) return;
    if (!currentSessionIdForAi || currentSessionIdForAi.startsWith("PENDING_")) {
      console.error("[App] getAiResponse called with invalid or pending session ID:", currentSessionIdForAi);
      setIsLoadingAiResponse(false);
      setCurrentMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        text: "Error: Could not send message. Session not fully initialized.",
        sender: SenderType.AI,
        timestamp: new Date(),
        feedback: null
      }]);
      return;
    }

    setIsLoadingAiResponse(true);
    const tempAiMessageId = crypto.randomUUID();
    const aiPlaceholderMessageForUI: Message = { id: tempAiMessageId, text: '', sender: SenderType.AI, timestamp: new Date(), feedback: null };
    setCurrentMessages(prevMessages => [...prevMessages, aiPlaceholderMessageForUI]);

    let accumulatedAiText = '';
    try {
      const stream = await sendMessageStream(textForAi, currentUser.uid);
      if (stream) {
        for await (const chunk of stream) {
          const chunkText = chunk.text;
          if (chunkText !== undefined) {
            accumulatedAiText += chunkText;
            setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: accumulatedAiText, timestamp: new Date() } : msg)));
          }
        }
        if (accumulatedAiText.trim()) {
          await addMessageToFirestore(currentUser.uid, currentSessionIdForAi, { text: accumulatedAiText, sender: SenderType.AI });
        } else {
          const fallbackMsg = "SuruGPT didn't provide a text response. Perhaps the request was unclear? 🤔";
          accumulatedAiText = fallbackMsg;
          setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: fallbackMsg, timestamp: new Date() } : msg)));
          await addMessageToFirestore(currentUser.uid, currentSessionIdForAi, { text: fallbackMsg, sender: SenderType.AI });
        }
      } else {
        const errorMsg = "Stream could not be established.";
        accumulatedAiText = errorMsg;
        setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: errorMsg, timestamp: new Date() } : msg)));
        await addMessageToFirestore(currentUser.uid, currentSessionIdForAi, { text: errorMsg, sender: SenderType.AI });
      }
    } catch (error: any) {
      console.error('Error streaming response in App.tsx getAiResponse:', error);
      const errorText = error.message || "AI error.";
      accumulatedAiText = errorText;
      setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: errorText, timestamp: new Date() } : msg)));
      await addMessageToFirestore(currentUser.uid, currentSessionIdForAi, { text: errorText, sender: SenderType.AI });
    } finally {
      setIsLoadingAiResponse(false);
      setCurrentMessages(prev => {
        const finalMessages = prev.map(msg =>
          msg.id === tempAiMessageId && msg.text.trim() === '' && accumulatedAiText.trim() === ''
            ? { ...msg, text: "AI response was empty.", timestamp: new Date() }
            : msg
        );
        setConversationContextFromAppMessages(
          finalMessages.map(m => ({ ...m, timestamp: new Date(m.timestamp as Date) })),
          undefined,
          globalContextSummary
        );
        return finalMessages;
      });
    }
  }, [currentUser, globalContextSummary]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!currentUser) return;
    console.log(`[App][handleSendMessage] Called. Current activeChatId: ${activeChatId}. previousActiveSessionIdToProcessOnNewChatRef: ${previousActiveSessionIdToProcessOnNewChatRef.current}`);

    if (!chatReady) {
      setCurrentMessages(prev => [...prev, { id: crypto.randomUUID(), text: "Chat service unavailable.", sender: SenderType.AI, timestamp: new Date(), feedback: null }]);
      return;
    }

    if (!activeChatId && previousActiveSessionIdToProcessOnNewChatRef.current && currentUser) {
        const sessionToSummarize = previousActiveSessionIdToProcessOnNewChatRef.current;
        console.log(`[App][handleSendMessage] First message in new chat. Attempting to process previous session ${sessionToSummarize} for memory.`);
        try {
            const messagesForOldSession = await getMessagesForSession(currentUser.uid, sessionToSummarize);
            if (messagesForOldSession.length > 0) {
                console.log(`[App][handleSendMessage] Fetched ${messagesForOldSession.length} messages for old session ${sessionToSummarize}. Processing...`);
                await processEndedSessionForMemory(currentUser.uid, sessionToSummarize, messagesForOldSession);
            } else {
                console.log(`[App][handleSendMessage] Previous session ${sessionToSummarize} had no messages, skipping memory processing.`);
            }
        } catch (error) {
            console.error(`[App][handleSendMessage] Error processing previous session ${sessionToSummarize} for memory:`, error);
        } finally {
            previousActiveSessionIdToProcessOnNewChatRef.current = null; 
            console.log(`[App][handleSendMessage] Cleared previousActiveSessionIdToProcessOnNewChatRef after processing attempt for ${sessionToSummarize}.`);
        }
    }


    if (!activeChatId) {
      const tempUserMessageId = crypto.randomUUID();
      const tempSessionId = `PENDING_${crypto.randomUUID()}`;
      const optimisticUserMessage: Message = { id: tempUserMessageId, text, sender: SenderType.USER, timestamp: new Date() };
      const optimisticSession: ChatSession = { id: tempSessionId, title: text.substring(0, 30) + "..." || "New Chat...", createdAt: new Date(), firstMessageTextForTitle: text, userId: currentUser.uid };

      setCurrentMessages([optimisticUserMessage]);
      setAllChatSessions(prevSessions => [optimisticSession, ...prevSessions]);
      setActiveChatId(tempSessionId);

      (async () => {
        try {
          const title = await generateChatTitle(text, currentUser.uid);
          const newSessionFromDb = await createChatSessionInFirestore(currentUser.uid, title, text);
          const actualSessionId = newSessionFromDb.id;

          setActiveChatId(actualSessionId);
          setAllChatSessions(prevSessions => prevSessions.map(s => s.id === tempSessionId ? newSessionFromDb : s));
          const finalUserMessage = await addMessageToFirestore(currentUser.uid, actualSessionId, { text, sender: SenderType.USER });
          setCurrentMessages(prevMsgs => prevMsgs.map(m => m.id === tempUserMessageId ? finalUserMessage : m));
          await getAiResponse(finalUserMessage.text, actualSessionId);
        } catch (err) {
          console.error("Error during new chat creation:", err);
          setCurrentMessages(prev => prev.filter(m => m.id !== tempUserMessageId));
          setAllChatSessions(prev => prev.filter(s => s.id !== tempSessionId));
          if (activeChatId === tempSessionId) setActiveChatId(null);
          setCurrentMessages(prev => [...prev, { id: crypto.randomUUID(), text: "Failed to start new chat.", sender: SenderType.AI, timestamp: new Date(), feedback: null }]);
        }
      })();
    } else {
      const finalUserMessage = await addMessageToFirestore(currentUser.uid, activeChatId, { text, sender: SenderType.USER });
      setCurrentMessages(prevMessages => [...prevMessages, finalUserMessage]);
      await getAiResponse(finalUserMessage.text, activeChatId);
    }
  }, [currentUser, chatReady, activeChatId, globalContextSummary, getAiResponse, processEndedSessionForMemory]);

  const handleCopyText = useCallback(async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch (err) { console.error('Failed to copy text: ', err); }
  }, []);

  const handleRateResponse = useCallback(async (messageId: string, rating: 'good' | 'bad') => {
    if (!currentUser || !activeChatId || activeChatId.startsWith("PENDING_")) return;
    setCurrentMessages(prevMessages =>
      prevMessages.map(msg => {
        if (msg.id === messageId) {
          const newFeedback = msg.feedback === rating ? null : rating;
          updateMessageFeedbackInFirestore(currentUser.uid, activeChatId, messageId, newFeedback).catch(error => {
            console.error("Failed to update feedback in Firestore:", error);
          });
          return { ...msg, feedback: newFeedback };
        }
        return msg;
      })
    );
  }, [currentUser, activeChatId]);

  const handleRetryAiResponse = useCallback(async (aiMessageToRetryId: string, userPromptText: string) => {
    if (!currentUser || !activeChatId || activeChatId.startsWith("PENDING_") || !userPromptText) return;
    setCurrentMessages(prev => {
      const updatedMessagesAfterRemoval = prev.filter(msg => msg.id !== aiMessageToRetryId);
      setConversationContextFromAppMessages(
        updatedMessagesAfterRemoval.map(m => ({ ...m, timestamp: new Date(m.timestamp as Date) })),
        undefined,
        globalContextSummary
      );
      return updatedMessagesAfterRemoval;
    });
    await getAiResponse(userPromptText, activeChatId);
  }, [currentUser, activeChatId, getAiResponse, globalContextSummary]);

  const handleSaveUserEdit = useCallback(async (messageId: string, newText: string) => {
    if (!currentUser || !activeChatId || activeChatId.startsWith("PENDING_")) return;
    setCurrentMessages(prevMessages => {
      const messageIndex = prevMessages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) return prevMessages;
      const updatedMessage = { ...prevMessages[messageIndex], text: newText, timestamp: new Date() };
      const messagesForContextAndDisplay = [...prevMessages.slice(0, messageIndex), updatedMessage];
      setConversationContextFromAppMessages(
        messagesForContextAndDisplay.map(m => ({ ...m, timestamp: new Date(m.timestamp as Date) })),
        undefined,
        globalContextSummary
      );
      return messagesForContextAndDisplay;
    });
    await updateMessageInFirestore(currentUser.uid, activeChatId, messageId, newText);
    await getAiResponse(newText, activeChatId);
  }, [currentUser, activeChatId, getAiResponse, globalContextSummary]);

  const handleRequestDeleteConfirmation = (sessionId: string, sessionTitle: string) => {
    setSessionToConfirmDelete({ id: sessionId, title: sessionTitle });
    setIsDeleteConfirmationOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!currentUser || !sessionToConfirmDelete) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

    const sessionToDeleteId = sessionToConfirmDelete.id;
    const endedSessionMessages = (activeChatIdForTimerRef.current === sessionToDeleteId && !sessionToDeleteId.startsWith("PENDING_")) 
        ? [...currentMessagesForTimerRef.current] 
        : [];

    setAllChatSessions(prevSessions => prevSessions.filter(session => session.id !== sessionToDeleteId));
    if (activeChatId === sessionToDeleteId) {
      setCurrentMessages([]);
      setActiveChatId(null);
      previousActiveSessionIdToProcessOnNewChatRef.current = null; 
    }
    setIsDeleteConfirmationOpen(false);
    setSessionToConfirmDelete(null);

    if (currentUser && endedSessionMessages.length > 0) { 
      await processEndedSessionForMemory(currentUser.uid, sessionToDeleteId, endedSessionMessages);
    }
    try {
      await deleteChatSessionFromFirestore(currentUser.uid, sessionToDeleteId);
    } catch (error: any) {
      console.error('Error deleting chat session:', error);
    }
  };
  const handleCancelDelete = () => {
    setIsDeleteConfirmationOpen(false);
    setSessionToConfirmDelete(null);
  };

  const handleRenameChatSession = async (sessionId: string, newTitle: string): Promise<void> => {
    if (!currentUser) return;
    const originalSession = allChatSessions.find(s => s.id === sessionId);
    const originalTitle = originalSession ? originalSession.title : '';
    setAllChatSessions(prevSessions => prevSessions.map(session => session.id === sessionId ? { ...session, title: newTitle } : session));
    try {
      const response = await fetch(`${window.location.origin}/api/renameChat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.uid, sessionId, newTitle }),
      });
      if (!response.ok) throw new Error(await response.text());
    } catch (error: any) {
      console.error('Error calling renameChat API:', error);
      setAllChatSessions(prevSessions => prevSessions.map(session => session.id === sessionId ? { ...session, title: originalTitle } : session));
    }
  };


  const isNewChatExperience =
    initialLoadAndRestoreAttemptCompleteRef.current &&
    (!activeChatId || activeChatId.startsWith("PENDING_")) &&
    currentMessages.length === 0 &&
    chatReady &&
    !isSessionsLoading &&
    !isMessagesLoading;

  useEffect(() => {
    const container = heartsContainerRef.current;
    let activeHearts: HTMLElement[] = [];

    if (currentUser && isNewChatExperience && container) {
      warmUpApis();
      const numHearts = 20; 

      for (let i = 0; i < numHearts; i++) {
        const heartElement = document.createElement('span'); 
        heartElement.className = 'heart-float';
        heartElement.textContent = '❤︎'; 
        heartElement.style.color = '#FF8DC7';
        heartElement.style.left = `${Math.random() * 100}%`; 
        
        heartElement.style.fontSize = `${Math.random() * 12 + 12}px`; 
        heartElement.style.filter = `blur(${Math.random() * 1.5}px)`; 

        heartElement.style.animationDuration = `${Math.random() * 5 + 5}s`; 
        heartElement.style.animationDelay = `${Math.random() * 5}s`; 

        container.appendChild(heartElement);
        activeHearts.push(heartElement);
      }
    }
    return () => {
      activeHearts.forEach(heart => heart.remove());
      activeHearts = [];
    };
  }, [currentUser, isNewChatExperience, warmUpApis]);


  const calculateMainContentState = (): MainContentState => {
    if (isLoadingAuth) return 'AUTH_LOADING';
    if (!currentUser) return 'LOGIN_SCREEN';
    if (!initialLoadAndRestoreAttemptCompleteRef.current) return 'INITIALIZING'; 
    if (isSessionsLoading && !initialLoadAndRestoreAttemptCompleteRef.current) return 'SESSIONS_LOADING'; 

    if (activeChatId && !activeChatId.startsWith("PENDING_") && isMessagesLoading) return 'MESSAGES_LOADING';

    if (activeChatId && !activeChatId.startsWith("PENDING_") && !isMessagesLoading) return 'CHAT_VIEW';

    if (activeChatId && activeChatId.startsWith("PENDING_")) return 'CHAT_VIEW';


    if (!activeChatId && !isSessionsLoading && !isMessagesLoading) return 'NEW_CHAT_EXPERIENCE';

    return 'NEW_CHAT_EXPERIENCE'; 
  };

  const mainContentCurrentState = calculateMainContentState();

  if (mainContentCurrentState === 'AUTH_LOADING') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#2E2B36] text-[#EAE6F0]">
        <IconHeart className="w-10 h-10 mb-4 text-[#FFD1DC] animate-pulse" style={{ filter: 'blur(0.5px)' }} />
        <p className="text-lg">Initializing SuruGPT...</p>
      </div>
    );
  }

  if (mainContentCurrentState === 'LOGIN_SCREEN') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#2E2B36] text-[#EAE6F0] p-4">
        <div className="relative w-40 h-40 mb-6"> {/* Adjusted size and margin */}
          <iframe
            src="https://giphy.com/embed/xX1PKy7MVU4xUvQ7bL"
            width="100%"
            height="100%"
            style={{ border: '0' }}
            className="giphy-embed"
            allowFullScreen
            title="Login Animation"
          />
          <div className="absolute inset-0 z-[1]" aria-hidden="true"></div> 
        </div>
        <h1 className="text-3xl font-semibold mb-3">Welcome back, {DISPLAY_NAME}!</h1>
        <p className="text-md text-[#A09CB0] mb-8">Please enter your password to continue.</p>
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#C0BCCF] sr-only">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              className="appearance-none block w-full px-4 py-3 bg-[#4A4754] border border-[#5A5666] rounded-xl shadow-sm placeholder-[#A09CB0] focus:outline-none focus:ring-2 focus:ring-[#FF8DC7] focus:border-[#FF8DC7] sm:text-sm text-[#EAE6F0]"
            />
          </div>
          {loginError && <p className="text-sm text-[#FF6B6B] text-center">{loginError}</p>}
          <div>
            <button
              type="submit"
              disabled={isLoadingAuth}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-[#FF8DC7] hover:bg-opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#2E2B36] focus:ring-[#FF8DC7] disabled:opacity-50"
            >
              {isLoadingAuth ? 'Signing In...' : 'Login'}
            </button>
          </div>
        </form>
         <p className="mt-8 text-xs text-center text-[#A09CB0]">
           For designated user: {DESIGNATED_OWNER_EMAIL}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-[#2E2B36] overflow-hidden ${appFadeInAnimation} ${appFadeOutAnimation}`}>
      {currentUser && (
        <>
          <Sidebar
            isOpen={isSidebarOpen}
            onClose={handleToggleSidebar}
            onNewChat={handleNewChat}
            chatSessions={allChatSessions}
            activeChatId={activeChatId}
            onSelectChat={handleSelectChat}
            onRequestDeleteConfirmation={handleRequestDeleteConfirmation}
            onRenameChatSession={handleRenameChatSession}
            isLoading={isSessionsLoading && !initialLoadAndRestoreAttemptCompleteRef.current}
            onLogout={handleRequestLogoutConfirmation}
            userName={DISPLAY_NAME}
            ownerUID={currentUser.uid}
          />
          {isSidebarOpen && !isDesktopView && (
            <div className="fixed inset-0 bg-black/50 z-30 sidebar-overlay" onClick={handleToggleSidebar} aria-hidden="true"></div>
          )}
          <div className={`relative z-10 flex flex-col flex-grow h-full bg-[#2E2B36] transition-all duration-300 ease-in-out ${(isSidebarOpen && isDesktopView) ? 'md:ml-60' : 'ml-0'}`}>
            <Header
              onToggleSidebar={handleToggleSidebar}
              onNewChat={handleNewChat}
              isSidebarOpen={isSidebarOpen}
            />
            <main className="flex-grow flex flex-col overflow-hidden bg-[#2E2B36]">
              {(mainContentCurrentState === 'INITIALIZING' ||
                (isSessionsLoading && !initialLoadAndRestoreAttemptCompleteRef.current && mainContentCurrentState === 'SESSIONS_LOADING') || 
                (isMessagesLoading && mainContentCurrentState === 'MESSAGES_LOADING') 
              ) && (
                  <div className="flex-grow flex items-center justify-center">
                    {/* Icon removed as per user request */}
                  </div>
                )}
              {mainContentCurrentState === 'NEW_CHAT_EXPERIENCE' && (
                <div className={`flex-grow flex flex-col justify-center items-center p-4 relative ${mainContentCurrentState === 'NEW_CHAT_EXPERIENCE' ? 'animate-fadeInContent' : ''}`}>
                  <div ref={heartsContainerRef} className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0" aria-hidden="true"></div>
                  <div className="relative w-full max-w-2xl z-10">
                    <div className="absolute bottom-[calc(100%+1rem)] left-1/2 -translate-x-1/2 w-full">
                      <WelcomeMessage />
                    </div>
                    <ChatInputBar onSendMessage={handleSendMessage} isLoading={isLoadingAiResponse} isChatAvailable={chatReady} isCentered={true} />
                  </div>
                </div>
              )}
              {mainContentCurrentState === 'CHAT_VIEW' && (
                <>
                  <ChatMessageList
                    messages={currentMessages.map(m => ({ ...m, timestamp: new Date(m.timestamp as Date) }))}
                    isLoadingAiResponse={isLoadingAiResponse}
                    onCopyText={handleCopyText}
                    onRateResponse={handleRateResponse}
                    onRetryResponse={handleRetryAiResponse}
                    onSaveEdit={handleSaveUserEdit}
                  />
                  <div className="sticky bottom-0 z-10 w-full">
                    <ChatInputBar onSendMessage={handleSendMessage} isLoading={isLoadingAiResponse} isChatAvailable={chatReady} isCentered={false} />
                  </div>
                </>
              )}
            </main>
          </div>
          <ConfirmationDialog
            isOpen={isDeleteConfirmationOpen}
            onClose={handleCancelDelete}
            onConfirm={handleConfirmDelete}
            title="Confirm Deletion"
            message={sessionToConfirmDelete ? <>Are you sure you want to delete the chat "<strong>{sessionToConfirmDelete.title}</strong>"?<br />This action cannot be undone.</> : "Are you sure?"}
            confirmButtonText={<><IconTrash className="w-4 h-4 mr-2" />Confirm Delete</>}
            confirmButtonColorClass="bg-[#FF6B6B] hover:bg-[#E05252]"
          />
          <ConfirmationDialog
            isOpen={isLogoutConfirmationOpen}
            onClose={handleCancelLogout}
            onConfirm={handleLogout}
            title="Confirm Logout"
            message={isLogoutConfirmationOpen ? <>Are you sure you want to log out, <strong>{DISPLAY_NAME}</strong>?</> : ""}
            confirmButtonText={<><IconLogout className="w-4 h-4 mr-2" />Log Out</>}
            confirmButtonColorClass="bg-[#FF8DC7] hover:bg-opacity-80"
          />
        </>
      )}
    </div>
  );
};

export default App;
