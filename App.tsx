
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  // getUserMemory // No longer needed for direct injection
} from './services/firebaseService';

const summarizeTextForTitle = async (text: string): Promise<string | null> => {
  console.log("[summarizeTextForTitle] Attempting to summarize:", text);
  try {
    const response = await fetch(`${window.location.origin}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textToSummarize: text }),
    });
    console.log('[summarizeTextForTitle] API Response Status:', response.status, response.statusText);
    if (!response.ok) {
      const errorBody = await response.text(); 
      console.error('[summarizeTextForTitle] Summarization API error. Status:', response.status, 'Body:', errorBody);
      return null;
    }
    const data = await response.json();
    console.log('[summarizeTextForTitle] API Response Data:', data);
    if (data && data.summary && typeof data.summary === 'string' && data.summary.trim() !== "") {
      return data.summary.trim();
    }
    console.warn('[summarizeTextForTitle] Summary was null, empty, or not a string. Data received:', data);
    return null;
  } catch (error) {
    console.error('[summarizeTextForTitle] Failed to fetch summary due to network or parsing error:', error);
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

const generateChatTitle = async (firstMessageText: string): Promise<string> => {
  const timestampTitle = `Chat @ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (!firstMessageText || firstMessageText.trim() === "") {
    console.log("[generateChatTitle] No first message text, using timestamp title.");
    return timestampTitle;
  }
  console.log("[generateChatTitle] Attempting to generate title for:", `"${firstMessageText}"`);
  const summary = await summarizeTextForTitle(firstMessageText);
  if (summary) { 
    console.log("[generateChatTitle] Using summarized title:", `"${summary}"`);
    return summary;
  }
  const fallback = generateFallbackTitle(firstMessageText);
  console.log("[generateChatTitle] Summarization failed or returned empty, using fallback title:", `"${fallback}"`);
  return fallback;
};

// const DEFAULT_USER_ID = "default_user"; // Still used by processSessionForMemory, but not directly in App.tsx for fetching

const App: React.FC = () => {
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

  const initialLoadComplete = useRef(false);
  const initialViewSetupDone = useRef(false); 

  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [sessionToConfirmDelete, setSessionToConfirmDelete] = useState<{id: string, title: string} | null>(null);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

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

  useEffect(() => {
    if (initialLoadComplete.current) return;
    initialLoadComplete.current = true;
    setChatReady(checkChatAvailability()); 
    // Initial reset. Persistent memory is no longer injected here.
    // It will be handled dynamically by the backend if needed.
    resetAiContextWithSystemPrompt(undefined, globalContextSummary); 
    const loadSessions = async () => {
      setIsSessionsLoading(true);
      try {
        const sessions = await getChatSessions();
        setAllChatSessions(sessions);
      } catch (error) {
        console.error("Failed to load chat sessions:", error);
      } finally {
        setIsSessionsLoading(false);
      }
    };
    loadSessions();
  }, [globalContextSummary]); 

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

  const processEndedSessionForMemory = useCallback(async (endedSessionId: string, endedSessionMessages: Message[]) => {
    if (endedSessionId && endedSessionMessages.length > 0) {
      console.log(`[App] Triggering memory update for concluded session: ${endedSessionId}`);
      try {
        await triggerMemoryUpdateForSession(endedSessionId, endedSessionMessages);
        console.log(`[App] Memory update request for session ${endedSessionId} processed by backend (or queued).`);
      } catch (error) {
        console.error(`[App] Failed to initiate memory update for session ${endedSessionId}:`, error);
      }
    }
  }, []); 


  const handleNewChat = useCallback(async () => { 
    const endedSessionId = activeChatId;
    const endedSessionMessages = [...currentMessages]; 

    setCurrentMessages([]); 
    setActiveChatId(null);
    setChatReady(checkChatAvailability()); 
    if (!isDesktopView) setIsSidebarOpen(false);

    if (endedSessionId && endedSessionMessages.length > 0) {
      processEndedSessionForMemory(endedSessionId, endedSessionMessages)
        .catch(err => console.error("[App] Background memory processing for ended session failed (handleNewChat):", err));
    }
    
    // Persistent memory is no longer fetched and injected from App.tsx
    // The backend will handle dynamic context retrieval based on semantic search.
    resetAiContextWithSystemPrompt(undefined, globalContextSummary); 
  }, [activeChatId, currentMessages, globalContextSummary, isDesktopView, processEndedSessionForMemory]);

  const handleSelectChat = useCallback(async (chatId: string) => { 
    const endedSessionId = activeChatId;
    const endedSessionMessages = [...currentMessages]; 

    if (endedSessionId === chatId && currentMessages.length > 0) {
        if (!isDesktopView) setIsSidebarOpen(false); return;
    }
    
    setActiveChatId(chatId); 
    setCurrentMessages([]); 
    setIsMessagesLoading(true);
    if (!isDesktopView) setIsSidebarOpen(false); 

    if (endedSessionId && endedSessionId !== chatId && endedSessionMessages.length > 0) {
      processEndedSessionForMemory(endedSessionId, endedSessionMessages)
        .catch(err => console.error("[App] Background memory processing for ended session failed (handleSelectChat):", err));
    }
    
    try {
      const messages = await getMessagesForSession(chatId);
      setCurrentMessages(messages);
      // For old chats, set context without injecting new persistent memory.
      setConversationContextFromAppMessages(messages.map(m => ({...m, timestamp: new Date(m.timestamp as Date)})), undefined, globalContextSummary);
    } catch (error) {
      console.error(`Failed to load messages for chat ${chatId}:`, error);
      setCurrentMessages([{ id: crypto.randomUUID(), text: "Error loading messages for this chat. Please try again.", sender: SenderType.AI, timestamp: new Date(), feedback: null }]);
      resetAiContextWithSystemPrompt(undefined, globalContextSummary); // Reset without persistent memory on error
    } finally { setIsMessagesLoading(false); }
  }, [activeChatId, currentMessages, globalContextSummary, isDesktopView, processEndedSessionForMemory]);

  const getAiResponse = useCallback(async (
    textForAi: string,
    currentSessionIdForAi: string | null
  ) => {
    setIsLoadingAiResponse(true);
    const tempAiMessageId = crypto.randomUUID();
    const aiPlaceholderMessageForUI: Message = { id: tempAiMessageId, text: '', sender: SenderType.AI, timestamp: new Date(), feedback: null };
    
    setCurrentMessages(prevMessages => {
      const updatedMessages = [...prevMessages, aiPlaceholderMessageForUI];
      return updatedMessages;
    });
    
    let accumulatedAiText = '';
    try {
      // sendMessageStream now implicitly uses the context set by resetAiContext or setConversationContext
      // The backend /api/chat will handle dynamic memory fetching.
      const stream = await sendMessageStream(textForAi); 
      if (stream) {
        for await (const chunk of stream) { 
          const chunkText = chunk.text; 
          if (chunkText !== undefined) {
            accumulatedAiText += chunkText;
            setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: accumulatedAiText, timestamp: new Date() } : msg)));
          }
        }
        if (currentSessionIdForAi && accumulatedAiText.trim()) {
          await addMessageToFirestore(currentSessionIdForAi, { text: accumulatedAiText, sender: SenderType.AI });
        } else if (currentSessionIdForAi && accumulatedAiText.trim() === '') {
            const fallbackMsg = "SuruGPT didn't provide a text response. Perhaps the request was unclear? 🤔";
            accumulatedAiText = fallbackMsg;
            setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: fallbackMsg, timestamp: new Date() } : msg)));
            await addMessageToFirestore(currentSessionIdForAi, { text: fallbackMsg, sender: SenderType.AI });
        }
      } else { 
        const errorMsg = "It seems there was a hiccup sending your message to SuruGPT! The stream could not be established. Please try again. 🚧";
        accumulatedAiText = errorMsg;
        setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: errorMsg, timestamp: new Date() } : msg)));
        if (currentSessionIdForAi) await addMessageToFirestore(currentSessionIdForAi, { text: errorMsg, sender: SenderType.AI });
      }
    } catch (error: any) { 
      console.error('Error streaming response in App.tsx getAiResponse:', error);
      const errorText = typeof error === 'string' ? error : (error instanceof Error ? error.message : "SuruGPT encountered a little problem! Please try again. 🛠️");
      accumulatedAiText = errorText;
      setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: errorText, timestamp: new Date() } : msg)));
      if (currentSessionIdForAi) await addMessageToFirestore(currentSessionIdForAi, { text: errorText, sender: SenderType.AI });
    } finally { 
      setIsLoadingAiResponse(false); 
      setCurrentMessages(prev => {
        const finalMessages = prev.map(msg => 
          msg.id === tempAiMessageId && msg.text.trim() === '' && accumulatedAiText.trim() === '' 
          ? { ...msg, text: "AI response was empty.", timestamp: new Date() } 
          : msg
        );
         setConversationContextFromAppMessages(
           finalMessages.map(m => ({...m, timestamp: new Date(m.timestamp as Date)})),
           undefined,
           globalContextSummary
         );
        return finalMessages;
      });
    }
  }, [globalContextSummary]); 


  const handleSendMessage = useCallback(async (text: string) => {
    if (!chatReady) {
      console.warn("Chat is not ready. Cannot send message.");
      setCurrentMessages(prev => [...prev, { id: crypto.randomUUID(), text: "Chat service is currently unavailable. Please try again later.", sender: SenderType.AI, timestamp: new Date(), feedback: null }]);
      return;
    }
    
    let currentSessionId = activeChatId;
    let finalUserMessage: Message;

    if (!currentSessionId) { // First message of a new session
      // Persistent memory is no longer fetched and injected directly here.
      // resetAiContextWithSystemPrompt will set up basic context.
      // The backend will handle dynamic memory.
      resetAiContextWithSystemPrompt(undefined, globalContextSummary);

      const title = await generateChatTitle(text); 
      const newSessionFromDb = await createChatSessionInFirestore(title, text);
      currentSessionId = newSessionFromDb.id;
      finalUserMessage = await addMessageToFirestore(currentSessionId, { text, sender: SenderType.USER });
      setAllChatSessions(prevSessions => [newSessionFromDb, ...prevSessions]);
      setActiveChatId(currentSessionId); 
      setCurrentMessages([finalUserMessage]); 
      await getAiResponse(finalUserMessage.text, currentSessionId);

    } else { // Existing active session
      finalUserMessage = await addMessageToFirestore(currentSessionId, { text, sender: SenderType.USER });
      setCurrentMessages(prevMessages => [...prevMessages, finalUserMessage]);
      await getAiResponse(finalUserMessage.text, currentSessionId);
    }
    
  }, [chatReady, activeChatId, globalContextSummary, getAiResponse]);


  const handleCopyText = useCallback(async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }, []);

  const handleRateResponse = useCallback(async (messageId: string, rating: 'good' | 'bad') => {
    if (!activeChatId) return;

    setCurrentMessages(prevMessages =>
      prevMessages.map(msg => {
        if (msg.id === messageId) {
          const newFeedback = msg.feedback === rating ? null : rating;
          updateMessageFeedbackInFirestore(activeChatId, messageId, newFeedback).catch(error => {
            console.error("Failed to update feedback in Firestore:", error);
          });
          return { ...msg, feedback: newFeedback };
        }
        return msg;
      })
    );
  }, [activeChatId]);
  
  const handleRetryAiResponse = useCallback(async (aiMessageToRetryId: string, userPromptText: string) => {
    if (!activeChatId || !userPromptText) return;

    setCurrentMessages(prev => {
      const updatedMessagesAfterRemoval = prev.filter(msg => msg.id !== aiMessageToRetryId);
      setConversationContextFromAppMessages(
          updatedMessagesAfterRemoval.map(m => ({...m, timestamp: new Date(m.timestamp as Date)})),
          undefined,
          globalContextSummary
      );
      return updatedMessagesAfterRemoval;
    });
    
    await getAiResponse(userPromptText, activeChatId);

  }, [activeChatId, getAiResponse, globalContextSummary]);


  const handleSaveUserEdit = useCallback(async (messageId: string, newText: string) => {
    if (!activeChatId) return;

    setCurrentMessages(prevMessages => {
        const messageIndex = prevMessages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) return prevMessages; 

        const updatedMessage = { ...prevMessages[messageIndex], text: newText, timestamp: new Date() };
        
        const messagesForContextAndDisplay = [
            ...prevMessages.slice(0, messageIndex),
            updatedMessage
        ];
        
        setConversationContextFromAppMessages(
            messagesForContextAndDisplay.map(m => ({...m, timestamp: new Date(m.timestamp as Date)})),
            undefined,
            globalContextSummary
        );
        return messagesForContextAndDisplay; 
    });
    
    await updateMessageInFirestore(activeChatId, messageId, newText); 
    await getAiResponse(newText, activeChatId);

  }, [activeChatId, getAiResponse, globalContextSummary]);


  const handleRequestDeleteConfirmation = (sessionId: string, sessionTitle: string) => {
    setSessionToConfirmDelete({id: sessionId, title: sessionTitle});
    setIsDeleteConfirmationOpen(true);
  };

  const handleConfirmDelete = async () => { 
    if (!sessionToConfirmDelete) return;
    const sessionToDeleteId = sessionToConfirmDelete.id;
    const endedSessionMessages = (activeChatId === sessionToDeleteId) ? [...currentMessages] : [];
    
    setAllChatSessions(prevSessions => prevSessions.filter(session => session.id !== sessionToDeleteId));
    if (activeChatId === sessionToDeleteId) {
      setCurrentMessages([]);
      setActiveChatId(null);
      resetAiContextWithSystemPrompt(undefined, globalContextSummary); 
    }
    
    setIsDeleteConfirmationOpen(false);
    setSessionToConfirmDelete(null);

    if (endedSessionMessages.length > 0) {
        processEndedSessionForMemory(sessionToDeleteId, endedSessionMessages)
            .catch(err => console.error("[App] Background memory processing for deleted session failed (handleConfirmDelete):", err));
    }
    
    try {
      // The deleteChatSessionFromFirestore in firebaseService now also handles deleting summaries.
      await deleteChatSessionFromFirestore(sessionToDeleteId); 
      console.log(`Chat session ${sessionToDeleteId} successfully deleted from Firestore.`);
    } catch (error: any) {
      console.error('Error deleting chat session from Firestore:', error);
      alert(`Error deleting chat: ${error.message}. The chat was removed from your view, but may still exist on the server. Please refresh or try again later.`);
    }
  };

  const handleCancelDelete = () => {
    setIsDeleteConfirmationOpen(false);
    setSessionToConfirmDelete(null);
  };

  const handleRenameChatSession = async (sessionId: string, newTitle: string): Promise<void> => {
    const originalSession = allChatSessions.find(s => s.id === sessionId);
    const originalTitle = originalSession ? originalSession.title : '';
    setAllChatSessions(prevSessions =>
      prevSessions.map(session =>
        session.id === sessionId ? { ...session, title: newTitle } : session
      )
    );
    try {
      const response = await fetch(`${window.location.origin}/api/renameChat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, newTitle }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to rename chat: ${response.statusText}`);
      }
      console.log(`Chat session ${sessionId} renamed to "${newTitle}" successfully on server.`);
    } catch (error: any) {
      console.error('Error calling renameChat API:', error);
      setAllChatSessions(prevSessions =>
        prevSessions.map(session =>
          session.id === sessionId ? { ...session, title: originalTitle } : session
        )
      );
      alert(`Error renaming chat: ${error.message}. Reverted to original title.`);
    }
  };

  const showWelcome = !activeChatId && currentMessages.length === 0 && chatReady && !isSessionsLoading && !isMessagesLoading;

  return (
    <div className="flex flex-col h-full bg-[#2D2A32] overflow-hidden">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={handleToggleSidebar} 
        onNewChat={handleNewChat}
        chatSessions={allChatSessions}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onRequestDeleteConfirmation={handleRequestDeleteConfirmation}
        onRenameChatSession={handleRenameChatSession}
        isLoading={isSessionsLoading}
      />
      {isSidebarOpen && !isDesktopView && (
        <div className="fixed inset-0 bg-black/50 z-30 sidebar-overlay" onClick={handleToggleSidebar} aria-hidden="true"></div>
      )}
      <div className={`relative z-10 flex flex-col flex-grow h-full bg-[#393641] transition-all duration-300 ease-in-out ${(isSidebarOpen && isDesktopView) ? 'md:ml-64' : 'ml-0'}`}>
        <Header onToggleSidebar={handleToggleSidebar} onNewChat={handleNewChat} />
        <main className="flex-grow flex flex-col overflow-hidden">
          {isMessagesLoading && <div className="flex-grow flex items-center justify-center"><p className="text-[#A09CB0] text-lg animate-pulse">Loading chat...</p></div>}
          {!isMessagesLoading && showWelcome && <WelcomeMessage />}
          {!isMessagesLoading && !showWelcome && 
            <ChatMessageList 
              messages={currentMessages.map(m => ({...m, timestamp: new Date(m.timestamp as Date)}))} 
              isLoadingAiResponse={isLoadingAiResponse}
              onCopyText={handleCopyText}
              onRateResponse={handleRateResponse}
              onRetryResponse={handleRetryAiResponse}
              onSaveEdit={handleSaveUserEdit}
            />}
        </main>
        <ChatInputBar onSendMessage={handleSendMessage} isLoading={isLoadingAiResponse} isChatAvailable={chatReady} />
      </div>
      <ConfirmationDialog
        isOpen={isDeleteConfirmationOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Confirm Deletion"
        message={
            sessionToConfirmDelete ? 
            <>Are you sure you want to delete the chat "<strong>{sessionToConfirmDelete.title}</strong>"?<br/>This action cannot be undone.</>
            : "Are you sure you want to delete this chat? This action cannot be undone."
        }
      />
    </div>
  );
};

export default App;
