
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
import LoadingScreen from './components/LoadingScreen';
import AuthScreen from './components/AuthScreen';

import { generateChatTitle, generateFallbackTitle } from './services/chatTitleService';
import {
  sendMessageStream,
  isChatAvailable as checkChatAvailability,
  setConversationContextFromAppMessages,
  triggerMemoryUpdateForSession,
  startNewOpenAIChatSession
} from './services/openAIService';
import {
  getChatSessions,
  getMessagesForSession,
  createChatSessionInFirestore,
  addMessageToFirestore,
  updateMessageInFirestore,
  deleteChatSessionFromFirestore,
  updateMessageFeedbackInFirestore,
  updateChatSessionTitleInFirestore,
} from './services/firebaseService';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const DESIGNATED_OWNER_EMAIL = "mehtamanvi29oct@gmail.com";
const LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY = 'surugpt_activeChatId_owner';

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
  const previousActiveSessionIdToProcessOnNewChatRef = useRef<string | null>(null);

  // Determine Display Name
  const userDisplayName = currentUser?.email === DESIGNATED_OWNER_EMAIL 
    ? "Minnie" 
    : (currentUser?.displayName || "Friend");

  // --- Auth & Lifecycle ---

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        const storedId = localStorage.getItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${user.uid}`);
        previousActiveSessionIdToProcessOnNewChatRef.current = storedId;
        setIsSessionsLoading(true);
      } else {
        setCurrentUser(null);
        setAllChatSessions([]);
        setActiveChatId(null);
        setCurrentMessages([]);
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
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setIsMessagesLoading(false);
    }
  }, [currentUser, activeChatId, currentMessages, globalContextSummary, isDesktopView, processMemory]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!currentUser) return;
    
    // Process memory for the previous session if we were just starting a new chat but switched
    if (!activeChatId && previousActiveSessionIdToProcessOnNewChatRef.current) {
        const oldId = previousActiveSessionIdToProcessOnNewChatRef.current;
        const oldMsgs = await getMessagesForSession(currentUser.uid, oldId);
        processMemory(currentUser.uid, oldId, oldMsgs);
        previousActiveSessionIdToProcessOnNewChatRef.current = null;
    }

    if (!activeChatId) {
      // --- STARTING A NEW CHAT ---
      const tempMsgId = crypto.randomUUID();
      // 1. Immediately show user message in UI with a temporary pending ID
      const tempId = `PENDING_${crypto.randomUUID()}`;
      setActiveChatId(tempId);
      setCurrentMessages([{ id: tempMsgId, text, sender: SenderType.USER, timestamp: new Date() }]);
      setIsLoadingAiResponse(true);

      try {
        // 2. Initialize AI history for a fresh start
        startNewOpenAIChatSession(undefined, globalContextSummary);

        // 3. Create the session in Firestore quickly with a fallback title
        const fallbackTitle = generateFallbackTitle(text);
        const newSession = await createChatSessionInFirestore(currentUser.uid, fallbackTitle, text);
        
        // 4. Update state with real session ID
        setActiveChatId(newSession.id);
        setAllChatSessions(prev => [newSession, ...prev]);
        localStorage.setItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${currentUser.uid}`, newSession.id);
        
        // 5. Replace temp user message with Firestore message (or just keep it and add AI response)
        const finalUserMsg = await addMessageToFirestore(currentUser.uid, newSession.id, { text, sender: SenderType.USER });
        setCurrentMessages([finalUserMsg]);

        // 6. Start AI Response
        await streamAiResponse(text, newSession.id);

        // 7. Background: Improve the title if possible
        generateChatTitle(text, currentUser.uid).then(betterTitle => {
            if (betterTitle !== fallbackTitle) {
                updateChatSessionTitleInFirestore(currentUser.uid, newSession.id, betterTitle);
                setAllChatSessions(prev => prev.map(s => s.id === newSession.id ? { ...s, title: betterTitle } : s));
            }
        });

      } catch (error) {
        console.error("Failed to start new chat:", error);
        setIsLoadingAiResponse(false);
        setActiveChatId(null);
        setCurrentMessages([]);
      }
    } else {
      // --- CONTINUING EXISTING CHAT ---
      try {
        const finalMsg = await addMessageToFirestore(currentUser.uid, activeChatId, { text, sender: SenderType.USER });
        setCurrentMessages(prev => [...prev, finalMsg]);
        await streamAiResponse(text, activeChatId);
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    }
  }, [currentUser, activeChatId, globalContextSummary, processMemory]);

  const streamAiResponse = async (text: string, sessionId: string) => {
    if (!currentUser) return;
    setIsLoadingAiResponse(true);
    const aiId = crypto.randomUUID();
    
    // Add empty AI message placeholder
    setCurrentMessages(prev => [...prev, { id: aiId, text: '', sender: SenderType.AI, timestamp: new Date(), feedback: null }]);

    let accumulated = '';
    try {
      const stream = await sendMessageStream(text, currentUser.uid);
      if (stream) {
        for await (const chunk of stream) {
          accumulated += chunk.text || '';
          setCurrentMessages(prev => prev.map(m => m.id === aiId ? { ...m, text: accumulated } : m));
        }
        
        if (accumulated.trim()) {
          await addMessageToFirestore(currentUser.uid, sessionId, { text: accumulated, sender: SenderType.AI });
        } else {
          setCurrentMessages(prev => prev.map(m => m.id === aiId ? { ...m, text: "I'm sorry, I couldn't think of anything to say. Try again? ✨" } : m));
        }
      }
    } catch (error) {
      console.error("AI Response Error:", error);
      setCurrentMessages(prev => prev.map(m => m.id === aiId ? { ...m, text: "Wait, I had a little hiccup! Can you try sending that again?" } : m));
    } finally {
      setIsLoadingAiResponse(false);
    }
  };

  const handleLogout = async () => {
    if (currentUser && activeChatId) {
        processMemory(currentUser.uid, activeChatId, currentMessages);
    }
    await signOut(auth);
    setIsLogoutConfirmationOpen(false);
  };

  const handleNewChat = () => {
    if (currentUser && activeChatId) processMemory(currentUser.uid, activeChatId, currentMessages);
    // Reset AI service context for the new chat
    startNewOpenAIChatSession(undefined, globalContextSummary);
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
            if (currentUser?.email === DESIGNATED_OWNER_EMAIL) {
               heart.style.color = '#FF8DC7';
            } else {
               heart.style.color = '#FFD1DC';
            }
            container.appendChild(heart);
        }
        return () => { container.innerHTML = ''; };
    }
  }, [activeChatId, currentMessages, currentUser]);

  if (isLoadingAuth) return <LoadingScreen />;
  if (!currentUser) return <AuthScreen designatedOwnerEmail={DESIGNATED_OWNER_EMAIL} onAuthSuccess={() => {}} />;

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
        onRenameChatSession={async (id, title) => {
          await updateChatSessionTitleInFirestore(currentUser.uid, id, title);
          setAllChatSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
        }}
        onLogout={() => setIsLogoutConfirmationOpen(true)}
        userName={userDisplayName}
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
        title="Log Out" message={`Are you sure you want to log out, ${userDisplayName}?`}
        onConfirm={handleLogout} confirmButtonText="Log Out"
      />
    </div>
  );
};

export default App;
