
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAuth, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { firebaseConfig } from './services/firebaseConfig';

import { Message, SenderType, ChatSession } from './types';
import Header from './components/Header';
import WelcomeMessage from './components/WelcomeMessage';
import ChatMessageList from './components/ChatMessageList';
import ChatInputBar from './components/ChatInputBar';
import Sidebar from './components/Sidebar';
import ConfirmationDialog from './components/ConfirmationDialog';
import LoginScreen from './components/LoginScreen';
import LoadingScreen from './components/LoadingScreen';

import { generateChatTitle } from './services/chatTitleService';
import {
  sendMessageStream,
  isChatAvailable as checkChatAvailability,
  startNewOpenAIChatSession,
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
import { IconLogout, IconTrash } from './constants';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const DESIGNATED_OWNER_EMAIL = "mehtamanvi29oct@gmail.com";
const DISPLAY_NAME = "Minnie";
const INACTIVITY_TIMEOUT_DURATION_MS = 1 * 60 * 1000;
const LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY = 'surugpt_activeChatId_owner';
const SESSION_STORAGE_RELOAD_STATE_KEY = 'surugpt_reloadState';

const App: React.FC = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Chat/Session State
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [allChatSessions, setAllChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [globalContextSummary, setGlobalContextSummary] = useState('');

  // UI State
  const [isLoadingAiResponse, setIsLoadingAiResponse] = useState(false);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [isDesktopView, setIsDesktopView] = useState(window.innerWidth >= 768);
  const [chatReady] = useState(checkChatAvailability());

  // Dialog State
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [sessionToConfirmDelete, setSessionToConfirmDelete] = useState<{ id: string, title: string } | null>(null);
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false);

  // Animation Refs
  const heartsContainerRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const previousActiveSessionIdToProcessOnNewChatRef = useRef<string | null>(null);

  // --- Auth & Lifecycle ---

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email === DESIGNATED_OWNER_EMAIL) {
        setCurrentUser(user);
        const storedId = localStorage.getItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${user.uid}`);
        previousActiveSessionIdToProcessOnNewChatRef.current = storedId;
      } else {
        setCurrentUser(null);
        if (user) signOut(auth);
      }
      setIsLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const processMemory = useCallback(async (uid: string, sid: string, msgs: Message[]) => {
    if (!sid || sid.startsWith("PENDING_") || msgs.length === 0) return;
    try {
      await triggerMemoryUpdateForSession(uid, sid, msgs);
    } catch (e) { console.error("Memory error:", e); }
  }, []);

  // --- Handlers ---

  const handleSelectChat = useCallback(async (chatId: string) => {
    if (!currentUser) return;
    if (activeChatId === chatId) {
        if (!isDesktopView) setIsSidebarOpen(false);
        return;
    }

    if (activeChatId && currentMessages.length > 0) {
        processMemory(currentUser.uid, activeChatId, currentMessages);
    }

    setActiveChatId(chatId);
    setIsMessagesLoading(true);
    if (!isDesktopView) setIsSidebarOpen(false);

    try {
      const messages = await getMessagesForSession(currentUser.uid, chatId);
      setCurrentMessages(messages);
      setConversationContextFromAppMessages(messages, undefined, globalContextSummary);
    } finally {
      setIsMessagesLoading(false);
    }
  }, [currentUser, activeChatId, currentMessages, globalContextSummary, isDesktopView, processMemory]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!currentUser) return;
    
    // Process previous session memory if starting a fresh chat
    if (!activeChatId && previousActiveSessionIdToProcessOnNewChatRef.current) {
        const oldId = previousActiveSessionIdToProcessOnNewChatRef.current;
        const oldMsgs = await getMessagesForSession(currentUser.uid, oldId);
        processMemory(currentUser.uid, oldId, oldMsgs);
        previousActiveSessionIdToProcessOnNewChatRef.current = null;
    }

    if (!activeChatId) {
      const tempId = `PENDING_${crypto.randomUUID()}`;
      setActiveChatId(tempId);
      setCurrentMessages([{ id: crypto.randomUUID(), text, sender: SenderType.USER, timestamp: new Date() }]);
      
      const title = await generateChatTitle(text, currentUser.uid);
      const newSession = await createChatSessionInFirestore(currentUser.uid, title, text);
      setActiveChatId(newSession.id);
      setAllChatSessions(prev => [newSession, ...prev]);
      localStorage.setItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${currentUser.uid}`, newSession.id);
      
      const finalMsg = await addMessageToFirestore(currentUser.uid, newSession.id, { text, sender: SenderType.USER });
      setCurrentMessages([finalMsg]);
      streamAiResponse(text, newSession.id);
    } else {
      const finalMsg = await addMessageToFirestore(currentUser.uid, activeChatId, { text, sender: SenderType.USER });
      setCurrentMessages(prev => [...prev, finalMsg]);
      streamAiResponse(text, activeChatId);
    }
  }, [currentUser, activeChatId, processMemory]);

  const streamAiResponse = async (text: string, sessionId: string) => {
    if (!currentUser) return;
    setIsLoadingAiResponse(true);
    const aiId = crypto.randomUUID();
    setCurrentMessages(prev => [...prev, { id: aiId, text: '', sender: SenderType.AI, timestamp: new Date(), feedback: null }]);

    let accumulated = '';
    try {
      const stream = await sendMessageStream(text, currentUser.uid);
      if (stream) {
        for await (const chunk of stream) {
          accumulated += chunk.text || '';
          setCurrentMessages(prev => prev.map(m => m.id === aiId ? { ...m, text: accumulated } : m));
        }
        await addMessageToFirestore(currentUser.uid, sessionId, { text: accumulated, sender: SenderType.AI });
      }
    } finally {
      setIsLoadingAiResponse(false);
    }
  };

  const handleLogout = async () => {
    if (currentUser && activeChatId) {
        processMemory(currentUser.uid, activeChatId, currentMessages);
    }
    await signOut(auth);
    setActiveChatId(null);
    setCurrentMessages([]);
    setIsLogoutConfirmationOpen(false);
  };

  const handleNewChat = () => {
    if (currentUser && activeChatId) processMemory(currentUser.uid, activeChatId, currentMessages);
    setActiveChatId(null);
    setCurrentMessages([]);
    if (!isDesktopView) setIsSidebarOpen(false);
  };

  // --- Effects ---

  useEffect(() => {
    if (currentUser && isSessionsLoading) {
      getChatSessions(currentUser.uid).then(sessions => {
        setAllChatSessions(sessions);
        setIsSessionsLoading(false);
      });
    }
  }, [currentUser, isSessionsLoading]);

  // Hearts Animation
  useEffect(() => {
    if (!activeChatId && currentMessages.length === 0 && heartsContainerRef.current) {
        const container = heartsContainerRef.current;
        for (let i = 0; i < 15; i++) {
            const heart = document.createElement('span');
            heart.className = 'heart-float';
            heart.textContent = '❤︎';
            heart.style.left = `${Math.random() * 100}%`;
            heart.style.animationDuration = `${5 + Math.random() * 5}s`;
            heart.style.animationDelay = `${Math.random() * 5}s`;
            container.appendChild(heart);
        }
        return () => { container.innerHTML = ''; };
    }
  }, [activeChatId, currentMessages]);

  if (isLoadingAuth) return <LoadingScreen />;
  if (!currentUser) return <LoginScreen designatedEmail={DESIGNATED_OWNER_EMAIL} displayName={DISPLAY_NAME} onLoginSuccess={() => {}} />;

  return (
    <div className="flex flex-col h-full bg-[#2E2B36] overflow-hidden animate-fadeInUpSlightly">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onNewChat={handleNewChat}
        chatSessions={allChatSessions}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onRequestDeleteConfirmation={(id, title) => { setSessionToConfirmDelete({ id, title }); setIsDeleteConfirmationOpen(true); }}
        onRenameChatSession={async (id, title) => {}}
        onLogout={() => setIsLogoutConfirmationOpen(true)}
        userName={DISPLAY_NAME}
        ownerUID={currentUser.uid}
      />
      <div className={`relative z-10 flex flex-col flex-grow h-full bg-[#2E2B36] transition-all duration-300 ${(isSidebarOpen && isDesktopView) ? 'md:ml-60' : 'ml-0'}`}>
        <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} onNewChat={handleNewChat} isSidebarOpen={isSidebarOpen} />
        <main className="flex-grow flex flex-col overflow-hidden bg-[#2E2B36]">
          {!activeChatId && currentMessages.length === 0 ? (
            <div className="flex-grow flex flex-col justify-center items-center p-4 relative animate-fadeInContent">
              <div ref={heartsContainerRef} className="absolute inset-0 overflow-hidden pointer-events-none" />
              <div className="relative w-full max-w-2xl">
                <div className="absolute bottom-[calc(100%+1rem)] left-1/2 -translate-x-1/2 w-full"><WelcomeMessage /></div>
                <ChatInputBar onSendMessage={handleSendMessage} isLoading={isLoadingAiResponse} isChatAvailable={chatReady} isCentered={true} />
              </div>
            </div>
          ) : (
            <>
              <ChatMessageList
                messages={currentMessages}
                isLoadingAiResponse={isLoadingAiResponse}
                onCopyText={(txt) => navigator.clipboard.writeText(txt)}
                onRateResponse={(mid, rate) => updateMessageFeedbackInFirestore(currentUser.uid, activeChatId!, mid, rate)}
                onRetryResponse={(mid, prompt) => handleSendMessage(prompt)}
                onSaveEdit={(mid, txt) => updateMessageInFirestore(currentUser.uid, activeChatId!, mid, txt)}
              />
              <ChatInputBar onSendMessage={handleSendMessage} isLoading={isLoadingAiResponse} isChatAvailable={chatReady} isCentered={false} />
            </>
          )}
        </main>
      </div>

      <ConfirmationDialog
        isOpen={isDeleteConfirmationOpen} onClose={() => setIsDeleteConfirmationOpen(false)}
        title="Confirm Deletion" message={sessionToConfirmDelete ? `Delete "${sessionToConfirmDelete.title}"?` : ""}
        onConfirm={async () => {
            await deleteChatSessionFromFirestore(currentUser.uid, sessionToConfirmDelete!.id);
            setAllChatSessions(prev => prev.filter(s => s.id !== sessionToConfirmDelete!.id));
            if (activeChatId === sessionToConfirmDelete!.id) setActiveChatId(null);
            setIsDeleteConfirmationOpen(false);
        }}
        confirmButtonText="Delete"
      />
      <ConfirmationDialog
        isOpen={isLogoutConfirmationOpen} onClose={() => setIsLogoutConfirmationOpen(false)}
        title="Log Out" message={`Are you sure, ${DISPLAY_NAME}?`}
        onConfirm={handleLogout} confirmButtonText="Log Out"
      />
    </div>
  );
};

export default App;
