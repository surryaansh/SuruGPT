
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
} from './services/firebaseService';

const summarizeTextForTitle = async (text: string): Promise<string | null> => {
  console.log("[App][summarizeTextForTitle] Attempting to summarize:", text);
  try {
    const response = await fetch(`${window.location.origin}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textToSummarize: text }),
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

const generateChatTitle = async (firstMessageText: string): Promise<string> => {
  const timestampTitle = `Chat @ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (!firstMessageText || firstMessageText.trim() === "") {
    console.log("[App][generateChatTitle] No first message text, using timestamp title.");
    return timestampTitle;
  }
  console.log("[App][generateChatTitle] Attempting to generate title for:", `"${firstMessageText}"`);
  const summary = await summarizeTextForTitle(firstMessageText);
  if (summary) { 
    console.log("[App][generateChatTitle] Using summarized title:", `"${summary}"`);
    return summary;
  }
  const fallback = generateFallbackTitle(firstMessageText);
  console.log("[App][generateChatTitle] Summarization failed or returned empty, using fallback title:", `"${fallback}"`);
  return fallback;
};

const INACTIVITY_TIMEOUT_DURATION_MS = 2 * 60 * 1000; // 2 minutes

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

  const inactivityTimerRef = useRef<number | null>(null);
  const activeChatIdForTimerRef = useRef<string | null>(null);
  const currentMessagesForTimerRef = useRef<Message[]>([]);
  const hasUnsavedChangesRef = useRef(false); // Ref to track if memory processing is pending

  // Effect to keep refs updated for timers and beacon
  useEffect(() => {
    activeChatIdForTimerRef.current = activeChatId;
    currentMessagesForTimerRef.current = currentMessages;
    // If there's an active chat with messages, mark that changes might need saving
    hasUnsavedChangesRef.current = !!(activeChatId && currentMessages.length > 0 && !activeChatId.startsWith("PENDING_"));
  }, [activeChatId, currentMessages]);

  const processEndedSessionForMemory = useCallback(async (endedSessionId: string, endedSessionMessages: Message[]) => {
    if (endedSessionId && endedSessionMessages.length > 0 && !endedSessionId.startsWith("PENDING_")) {
      console.log(`[App] Triggering memory update for concluded session: ${endedSessionId}`);
      hasUnsavedChangesRef.current = false; // Reset flag as processing is initiated
      try {
        // Fire-and-forget for UI responsiveness
        triggerMemoryUpdateForSession(endedSessionId, endedSessionMessages)
          .then(() => console.log(`[App] Memory update request for session ${endedSessionId} successfully sent to backend.`))
          .catch(err => console.error(`[App] Error in fire-and-forget memory update for session ${endedSessionId}:`, err));
      } catch (error) { 
        console.error(`[App] Immediate error trying to initiate memory update for session ${endedSessionId}:`, error);
      }
    } else if (endedSessionId.startsWith("PENDING_")) {
        console.log(`[App] Skipped memory update for pending session ID: ${endedSessionId}`);
    }
  }, []); 

  // Inactivity Timer Logic (for open-but-idle tab)
  useEffect(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    if (activeChatId && currentMessages.length > 0 && !activeChatId.startsWith("PENDING_")) {
      const sessionTrackedByThisTimer = activeChatId; 
      console.log(`[App] Setting/Resetting inactivity timer for session: ${sessionTrackedByThisTimer}`);
      
      inactivityTimerRef.current = window.setTimeout(() => {
        if (activeChatIdForTimerRef.current && 
            activeChatIdForTimerRef.current === sessionTrackedByThisTimer &&
            activeChatId === sessionTrackedByThisTimer && 
            currentMessagesForTimerRef.current && currentMessagesForTimerRef.current.length > 0) {
          
          console.log(`[App] Inactivity timer fired for session: ${activeChatIdForTimerRef.current}. Processing for memory.`);
          processEndedSessionForMemory(activeChatIdForTimerRef.current, currentMessagesForTimerRef.current);
        } else {
          console.log(`[App] Inactivity timer fired, but its target session ${sessionTrackedByThisTimer} is no longer relevant or conditions changed.`);
        }
      }, INACTIVITY_TIMEOUT_DURATION_MS);
    }

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [activeChatId, currentMessages, processEndedSessionForMemory]);

  // navigator.sendBeacon for tab close
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current && activeChatIdForTimerRef.current && currentMessagesForTimerRef.current.length > 0 && !activeChatIdForTimerRef.current.startsWith("PENDING_")) {
        const payload = {
          sessionId: activeChatIdForTimerRef.current,
          sessionMessages: currentMessagesForTimerRef.current,
        };
        try {
          const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
          if (navigator.sendBeacon('/api/handleTabCloseMemory', blob)) {
            console.log('[App] Sent session data via sendBeacon for memory processing on tab close.');
            hasUnsavedChangesRef.current = false; // Attempted to save
          } else {
            console.warn('[App] sendBeacon call to /api/handleTabCloseMemory failed or was not queued.');
            // Fallback or logging for synchronous attempt if beacon fails (not recommended as it blocks unload)
            // For critical data, a synchronous XHR might be considered but is disruptive.
          }
        } catch (e) {
            console.error('[App] Error during sendBeacon preparation or call:', e);
        }
        // Note: Do not set event.returnValue to anything to prevent user confirmation dialog
        // unless absolutely necessary and data loss is critical. sendBeacon is fire-and-forget.
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []); // Empty dependency array: runs once on mount, cleans up on unmount


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

  const clearExistingInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
      console.log("[App] Inactivity timer explicitly cleared.");
    }
  }, []);

  const handleNewChat = useCallback(async () => { 
    clearExistingInactivityTimer();
    const endedSessionId = activeChatIdForTimerRef.current; 
    const endedSessionMessages = endedSessionId ? [...currentMessagesForTimerRef.current] : [];

    setCurrentMessages([]); 
    setActiveChatId(null); 
    setChatReady(checkChatAvailability()); 
    if (!isDesktopView) setIsSidebarOpen(false);

    if (endedSessionId && endedSessionMessages.length > 0) {
      processEndedSessionForMemory(endedSessionId, endedSessionMessages);
    }
    resetAiContextWithSystemPrompt(undefined, globalContextSummary); 
  }, [globalContextSummary, isDesktopView, processEndedSessionForMemory, clearExistingInactivityTimer]);

  const handleSelectChat = useCallback(async (chatId: string) => { 
    clearExistingInactivityTimer();
    const endedSessionId = activeChatIdForTimerRef.current; 
    const endedSessionMessages = endedSessionId ? [...currentMessagesForTimerRef.current] : [];

    if (endedSessionId === chatId && currentMessages.length > 0) {
        if (!isDesktopView) setIsSidebarOpen(false); return;
    }
    
    setActiveChatId(chatId); 
    setCurrentMessages([]); 
    setIsMessagesLoading(true);
    if (!isDesktopView) setIsSidebarOpen(false); 

    if (endedSessionId && endedSessionId !== chatId && endedSessionMessages.length > 0) {
      processEndedSessionForMemory(endedSessionId, endedSessionMessages);
    }
    
    try {
      const messages = await getMessagesForSession(chatId);
      setCurrentMessages(messages);
      setConversationContextFromAppMessages(messages.map(m => ({...m, timestamp: new Date(m.timestamp as Date)})), undefined, globalContextSummary);
    } catch (error) {
      console.error(`Failed to load messages for chat ${chatId}:`, error);
      setCurrentMessages([{ id: crypto.randomUUID(), text: "Error loading messages for this chat. Please try again.", sender: SenderType.AI, timestamp: new Date(), feedback: null }]);
      resetAiContextWithSystemPrompt(undefined, globalContextSummary);
    } finally { setIsMessagesLoading(false); }
  }, [currentMessages.length, globalContextSummary, isDesktopView, processEndedSessionForMemory, clearExistingInactivityTimer]);

  const getAiResponse = useCallback(async (
    textForAi: string,
    currentSessionIdForAi: string | null
  ) => {
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
      const stream = await sendMessageStream(textForAi); 
      if (stream) {
        for await (const chunk of stream) { 
          const chunkText = chunk.text; 
          if (chunkText !== undefined) {
            accumulatedAiText += chunkText;
            setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: accumulatedAiText, timestamp: new Date() } : msg)));
          }
        }
        if (accumulatedAiText.trim()) {
          await addMessageToFirestore(currentSessionIdForAi, { text: accumulatedAiText, sender: SenderType.AI });
        } else if (accumulatedAiText.trim() === '') {
            const fallbackMsg = "SuruGPT didn't provide a text response. Perhaps the request was unclear? 🤔";
            accumulatedAiText = fallbackMsg;
            setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: fallbackMsg, timestamp: new Date() } : msg)));
            await addMessageToFirestore(currentSessionIdForAi, { text: fallbackMsg, sender: SenderType.AI });
        }
      } else { 
        const errorMsg = "It seems there was a hiccup sending your message to SuruGPT! The stream could not be established. Please try again. 🚧";
        accumulatedAiText = errorMsg;
        setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: errorMsg, timestamp: new Date() } : msg)));
        await addMessageToFirestore(currentSessionIdForAi, { text: errorMsg, sender: SenderType.AI });
      }
    } catch (error: any) { 
      console.error('Error streaming response in App.tsx getAiResponse:', error);
      const errorText = typeof error === 'string' ? error : (error instanceof Error ? error.message : "SuruGPT encountered a little problem! Please try again. 🛠️");
      accumulatedAiText = errorText;
      setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: errorText, timestamp: new Date() } : msg)));
      await addMessageToFirestore(currentSessionIdForAi, { text: errorText, sender: SenderType.AI });
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
    
    if (!activeChatId) { 
      const tempUserMessageId = crypto.randomUUID();
      const tempSessionId = `PENDING_${crypto.randomUUID()}`;

      const optimisticUserMessage: Message = {
        id: tempUserMessageId,
        text,
        sender: SenderType.USER,
        timestamp: new Date(),
      };
      const optimisticSession: ChatSession = {
        id: tempSessionId,
        title: text.substring(0, 30) + (text.length > 30 ? "..." : "") || "New Chat...",
        createdAt: new Date(),
        firstMessageTextForTitle: text,
      };

      setCurrentMessages([optimisticUserMessage]);
      setAllChatSessions(prevSessions => [optimisticSession, ...prevSessions]);
      setActiveChatId(tempSessionId); 
      resetAiContextWithSystemPrompt(undefined, globalContextSummary);

      (async () => {
        try {
          const title = await generateChatTitle(text);
          const newSessionFromDb = await createChatSessionInFirestore(title, text);
          const actualSessionId = newSessionFromDb.id;
          
          setActiveChatId(actualSessionId); 
          setAllChatSessions(prevSessions => 
            prevSessions.map(s => s.id === tempSessionId ? newSessionFromDb : s)
          );
          
          const finalUserMessage = await addMessageToFirestore(actualSessionId, { text, sender: SenderType.USER });
          setCurrentMessages(prevMsgs => 
            prevMsgs.map(m => m.id === tempUserMessageId ? finalUserMessage : m)
          ); 
          
          await getAiResponse(finalUserMessage.text, actualSessionId);
        } catch (err) {
          console.error("Error during new chat creation or first message send:", err);
          setCurrentMessages(prev => prev.filter(m => m.id !== tempUserMessageId));
          setAllChatSessions(prev => prev.filter(s => s.id !== tempSessionId));
          if (activeChatId === tempSessionId) setActiveChatId(null); 
          setCurrentMessages(prev => [...prev, { 
            id: crypto.randomUUID(), 
            text: "Failed to start new chat. Please try again.", 
            sender: SenderType.AI, 
            timestamp: new Date(), 
            feedback: null 
          }]);
        }
      })();

    } else { 
      const finalUserMessage = await addMessageToFirestore(activeChatId, { text, sender: SenderType.USER });
      setCurrentMessages(prevMessages => [...prevMessages, finalUserMessage]);
      await getAiResponse(finalUserMessage.text, activeChatId);
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
    const currentActiveChatId = activeChatIdForTimerRef.current; 
    if (!currentActiveChatId || currentActiveChatId.startsWith("PENDING_")) return;

    setCurrentMessages(prevMessages =>
      prevMessages.map(msg => {
        if (msg.id === messageId) {
          const newFeedback = msg.feedback === rating ? null : rating;
          updateMessageFeedbackInFirestore(currentActiveChatId, messageId, newFeedback).catch(error => {
            console.error("Failed to update feedback in Firestore:", error);
          });
          return { ...msg, feedback: newFeedback };
        }
        return msg;
      })
    );
  }, []); 
  
  const handleRetryAiResponse = useCallback(async (aiMessageToRetryId: string, userPromptText: string) => {
    const currentActiveChatId = activeChatIdForTimerRef.current; 
    if (!currentActiveChatId || currentActiveChatId.startsWith("PENDING_") || !userPromptText) return;

    setCurrentMessages(prev => {
      const updatedMessagesAfterRemoval = prev.filter(msg => msg.id !== aiMessageToRetryId);
      setConversationContextFromAppMessages(
          updatedMessagesAfterRemoval.map(m => ({...m, timestamp: new Date(m.timestamp as Date)})),
          undefined,
          globalContextSummary
      );
      return updatedMessagesAfterRemoval;
    }); 
    
    await getAiResponse(userPromptText, currentActiveChatId);

  }, [getAiResponse, globalContextSummary]); 

  const handleSaveUserEdit = useCallback(async (messageId: string, newText: string) => {
    const currentActiveChatId = activeChatIdForTimerRef.current; 
    if (!currentActiveChatId || currentActiveChatId.startsWith("PENDING_")) return;

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
    
    await updateMessageInFirestore(currentActiveChatId, messageId, newText); 
    await getAiResponse(newText, currentActiveChatId);

  }, [getAiResponse, globalContextSummary]); 

  const handleRequestDeleteConfirmation = (sessionId: string, sessionTitle: string) => {
    setSessionToConfirmDelete({id: sessionId, title: sessionTitle});
    setIsDeleteConfirmationOpen(true);
  };

  const handleConfirmDelete = async () => { 
    if (!sessionToConfirmDelete) return;
    clearExistingInactivityTimer();

    const sessionToDeleteId = sessionToConfirmDelete.id;
    const currentActiveChatIdVal = activeChatIdForTimerRef.current; 
    const currentActiveMessagesVal = [...currentMessagesForTimerRef.current];
    
    setAllChatSessions(prevSessions => prevSessions.filter(session => session.id !== sessionToDeleteId));
    if (currentActiveChatIdVal === sessionToDeleteId) {
      setCurrentMessages([]);
      setActiveChatId(null); 
      resetAiContextWithSystemPrompt(undefined, globalContextSummary); 
    }
    
    setIsDeleteConfirmationOpen(false);
    setSessionToConfirmDelete(null);

    if (currentActiveChatIdVal === sessionToDeleteId && currentActiveMessagesVal.length > 0) { 
        processEndedSessionForMemory(sessionToDeleteId, currentActiveMessagesVal);
    }
    
    try {
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
      <div className={`relative z-10 flex flex-col flex-grow h-full bg-[#393641] transition-all duration-300 ease-in-out ${(isSidebarOpen && isDesktopView) ? 'md:ml-60' : 'ml-0'}`}>
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
