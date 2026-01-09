import React, { useState, useEffect, useRef } from 'react';
import { getAuth, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { firebaseConfig } from './services/firebaseConfig';

import Header from './components/Header';
import WelcomeMessage from './components/WelcomeMessage';
import ChatMessageList from './components/ChatMessageList';
import ChatInputBar from './components/ChatInputBar';
import Sidebar from './components/Sidebar';
import ConfirmationDialog from './components/ConfirmationDialog';
import LoadingScreen from './components/LoadingScreen';
import AuthScreen from './components/AuthScreen';

import { useChat } from './hooks/useChat';
import { isChatAvailable } from './services/openAIService';
import {
  deleteChatSessionFromFirestore,
  updateMessageFeedbackInFirestore,
  updateMessageInFirestore,
  updateChatSessionTitleInFirestore,
} from './services/firebaseService';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [sessionToConfirmDelete, setSessionToConfirmDelete] = useState<{ id: string, title: string } | null>(null);
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false);

  const {
    currentMessages, setCurrentMessages,
    allChatSessions, setAllChatSessions,
    activeChatId, setActiveChatId,
    isLoadingAiResponse,
    isSessionsLoading,
    sendMessage,
    startNewChat,
    selectChat,
    processMemory
  } = useChat(currentUser);

  const heartsContainerRef = useRef<HTMLDivElement>(null);
  const userDisplayName = currentUser?.displayName || "Friend";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (currentUser && activeChatId) processMemory(currentUser.uid, activeChatId, currentMessages);
    await signOut(auth);
    setIsLogoutConfirmationOpen(false);
  };

  useEffect(() => {
    if (!activeChatId && currentMessages.length === 0 && heartsContainerRef.current) {
        const container = heartsContainerRef.current;
        container.innerHTML = '';
        for (let i = 0; i < 15; i++) {
            const heart = document.createElement('span');
            heart.className = 'heart-float';
            heart.textContent = '❤︎';
            heart.style.left = `${Math.random() * 100}%`;
            heart.style.animationDuration = `${5 + Math.random() * 5}s`;
            heart.style.animationDelay = `${Math.random() * 5}s`;
            heart.style.color = '#FF8DC7';
            container.appendChild(heart);
        }
    }
  }, [activeChatId, currentMessages]);

  if (isLoadingAuth) return <LoadingScreen />;
  if (!currentUser) return <AuthScreen onAuthSuccess={() => {}} />;

  return (
    <div className="flex flex-col h-full bg-[#2E2B36] overflow-hidden animate-fadeInUpSlightly">
      <Sidebar
        isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}
        onNewChat={() => { startNewChat(); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
        chatSessions={allChatSessions} activeChatId={activeChatId}
        onSelectChat={(id) => { selectChat(id); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
        onRequestDeleteConfirmation={(id, title) => { setSessionToConfirmDelete({ id, title }); setIsDeleteConfirmationOpen(true); }}
        onRenameChatSession={async (id, title) => {
          await updateChatSessionTitleInFirestore(currentUser.uid, id, title);
          setAllChatSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
        }}
        onLogout={() => setIsLogoutConfirmationOpen(true)}
        userName={userDisplayName} ownerUID={currentUser.uid}
      />
      <div className={`relative z-10 flex flex-col flex-grow h-full bg-[#2E2B36] transition-all duration-300 ${(isSidebarOpen && window.innerWidth >= 768) ? 'md:ml-60' : 'ml-0'}`}>
        <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} onNewChat={startNewChat} isSidebarOpen={isSidebarOpen} />
        <main className="flex-grow flex flex-col overflow-hidden bg-[#2E2B36]">
          {!activeChatId && currentMessages.length === 0 ? (
            <div className="flex-grow flex flex-col justify-center items-center p-4 relative animate-fadeInContent">
              <div ref={heartsContainerRef} className="absolute inset-0 overflow-hidden pointer-events-none" />
              <div className="relative w-full max-w-2xl">
                <div className="absolute bottom-[calc(100%+1rem)] left-1/2 -translate-x-1/2 w-full"><WelcomeMessage /></div>
                <ChatInputBar onSendMessage={sendMessage} isLoading={isLoadingAiResponse} isChatAvailable={isChatAvailable()} isCentered={true} />
              </div>
            </div>
          ) : (
            <>
              <ChatMessageList
                messages={currentMessages} isLoadingAiResponse={isLoadingAiResponse}
                onCopyText={(txt) => navigator.clipboard.writeText(txt)}
                onRateResponse={(mid, rate) => updateMessageFeedbackInFirestore(currentUser.uid, activeChatId!, mid, rate)}
                onRetryResponse={(mid, prompt) => sendMessage(prompt)}
                onSaveEdit={(mid, txt) => updateMessageInFirestore(currentUser.uid, activeChatId!, mid, txt)}
              />
              <ChatInputBar onSendMessage={sendMessage} isLoading={isLoadingAiResponse} isChatAvailable={isChatAvailable()} isCentered={false} />
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