
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
  setConversationContextFromAppMessages
} from './services/openAIService'; 
import {
  getChatSessions,
  getMessagesForSession,
  createChatSessionInFirestore,
  addMessageToFirestore,
  // updateChatSessionTitleInFirestore // Already imported for rename
  updateMessageInFirestore, // Added for editing messages
  deleteChatSessionFromFirestore // Re-add for delete function if it was removed
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


  useEffect(() => {
    const handleResizeAndUpdateInitialView = () => {
      const currentIsDesktop = window.innerWidth >= 768;
      setIsDesktopView(currentIsDesktop);
      if (!initialViewSetupDone.current) {
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

  const handleToggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleNewChat = () => { 
    setCurrentMessages([]); setActiveChatId(null);
    resetAiContextWithSystemPrompt(undefined, globalContextSummary); 
    setChatReady(checkChatAvailability()); 
    if (!isDesktopView) setIsSidebarOpen(false);
  };

  const handleSelectChat = useCallback(async (chatId: string) => { 
    if (activeChatId === chatId && currentMessages.length > 0) {
        if (!isDesktopView) setIsSidebarOpen(false); return;
    }
    setActiveChatId(chatId); setCurrentMessages([]); setIsMessagesLoading(true);
    if (!isDesktopView) setIsSidebarOpen(false); 
    try {
      const messages = await getMessagesForSession(chatId);
      setCurrentMessages(messages);
      setConversationContextFromAppMessages(messages.map(m => ({...m, timestamp: new Date(m.timestamp as Date)})), undefined, globalContextSummary);
    } catch (error) {
      console.error(`Failed to load messages for chat ${chatId}:`, error);
      setCurrentMessages([{ id: crypto.randomUUID(), text: "Error loading messages for this chat. Please try again.", sender: SenderType.AI, timestamp: new Date() }]);
      resetAiContextWithSystemPrompt(undefined, globalContextSummary);
    } finally { setIsMessagesLoading(false); }
  }, [activeChatId, currentMessages.length, globalContextSummary, isDesktopView]);

  const getAiResponse = useCallback(async (
    textForAi: string,
    currentSessionIdForAi: string | null
  ) => {
    setIsLoadingAiResponse(true);
    const tempAiMessageId = crypto.randomUUID();
    const aiPlaceholderMessageForUI: Message = { id: tempAiMessageId, text: '', sender: SenderType.AI, timestamp: new Date() };
    setCurrentMessages(prevMessages => [...prevMessages, aiPlaceholderMessageForUI]);
    
    let accumulatedAiText = '';
    try {
      // Ensure AI context is set based on current messages BEFORE sending
      setConversationContextFromAppMessages(
        currentMessages.map(m => ({...m, timestamp: new Date(m.timestamp as Date)})), // Ensure this is the up-to-date list
        undefined, 
        globalContextSummary
      );

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
    } catch (error) { 
      console.error('Error streaming response in App.tsx getAiResponse:', error);
      const errorText = typeof error === 'string' ? error : (error instanceof Error ? error.message : "SuruGPT encountered a little problem! Please try again. 🛠️");
      accumulatedAiText = errorText;
      setCurrentMessages(prevMessages => prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: errorText, timestamp: new Date() } : msg)));
      if (currentSessionIdForAi) await addMessageToFirestore(currentSessionIdForAi, { text: errorText, sender: SenderType.AI });
    } finally { setIsLoadingAiResponse(false); }
  }, [currentMessages, globalContextSummary]); // Added currentMessages


  const handleSendMessage = useCallback(async (text: string) => {
    if (!chatReady) {
      console.warn("Chat is not ready. Cannot send message.");
      setCurrentMessages(prev => [...prev, { id: crypto.randomUUID(), text: "Chat service is currently unavailable. Please try again later.", sender: SenderType.AI, timestamp: new Date() }]);
      return;
    }
    const tempUserMessageId = crypto.randomUUID();
    const userMessageForUI: Message = { id: tempUserMessageId, text, sender: SenderType.USER, timestamp: new Date() };
    
    let currentSessionId = activeChatId;
    let finalUserMessage: Message;

    // Store user message first
    if (!currentSessionId) {
      const title = await generateChatTitle(text); 
      const newSessionFromDb = await createChatSessionInFirestore(title, text);
      currentSessionId = newSessionFromDb.id;
      finalUserMessage = await addMessageToFirestore(currentSessionId, { text, sender: SenderType.USER });
      setAllChatSessions(prevSessions => [newSessionFromDb, ...prevSessions]);
      setActiveChatId(currentSessionId); 
      setCurrentMessages([finalUserMessage]); // Start with just the saved user message
    } else {
      finalUserMessage = await addMessageToFirestore(currentSessionId, { text, sender: SenderType.USER });
      setCurrentMessages(prevMessages => [...prevMessages.filter(m => m.id !== tempUserMessageId), finalUserMessage]);
    }
    
    // Then get AI response
    await getAiResponse(finalUserMessage.text, currentSessionId);

  }, [chatReady, activeChatId, globalContextSummary, getAiResponse]);


  const handleCopyText = useCallback(async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      // Feedback is handled in ChatMessage component
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Optionally show an error message to the user
    }
  }, []);

  const handleRateResponse = useCallback((messageId: string, rating: 'good' | 'bad') => {
    console.log(`Rated message ${messageId} as ${rating}`);
    // Placeholder for actual feedback submission logic
  }, []);
  
  const handleRetryAiResponse = useCallback(async (aiMessageToRetryId: string, userPromptText: string) => {
    if (!activeChatId || !userPromptText) return;

    // 1. Remove the AI message to be retried from currentMessages
    setCurrentMessages(prev => prev.filter(msg => msg.id !== aiMessageToRetryId));
    
    // 2. The AI context will be rebuilt by getAiResponse based on the modified currentMessages.
    //    (It's important that currentMessages is updated *before* calling getAiResponse)
    // Need to ensure state update completes before calling getAiResponse
    // Using a timeout or useEffect for this can be tricky. A direct call should be okay if getAiResponse
    // correctly uses the state *at the time of its execution*.
    // Let's make `getAiResponse` take `currentMessages` as an argument to ensure context.
    // No, getAiResponse uses currentMessages from its closure, so we need to ensure it's updated.
    // A slight delay or functional update for setCurrentMessages might be needed.
    // For now, we'll proceed, but this is a potential race condition if state update isn't immediate for getAiResponse.
    
    // To ensure `getAiResponse` uses the updated messages list for context:
    const updatedMessagesAfterRemoval = currentMessages.filter(msg => msg.id !== aiMessageToRetryId);
    // Rebuild context using this specific list *before* calling AI
     setConversationContextFromAppMessages(
        updatedMessagesAfterRemoval.map(m => ({...m, timestamp: new Date(m.timestamp as Date)})),
        undefined,
        globalContextSummary
      );

    await getAiResponse(userPromptText, activeChatId);

  }, [activeChatId, getAiResponse, currentMessages, globalContextSummary]);


  const handleSaveUserEdit = useCallback(async (messageId: string, newText: string) => {
    if (!activeChatId) return;

    const messageIndex = currentMessages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    // 1. Update the message in Firestore
    await updateMessageInFirestore(activeChatId, messageId, newText);

    // 2. Create the updated message for UI
    const updatedMessage: Message = { ...currentMessages[messageIndex], text: newText, timestamp: new Date() };

    // 3. Truncate messages array and update the specific message
    const messagesUpToEdit = currentMessages.slice(0, messageIndex);
    const newCurrentMessages = [...messagesUpToEdit, updatedMessage];
    setCurrentMessages(newCurrentMessages);
    
    // 4. The AI context will be rebuilt by getAiResponse based on the newCurrentMessages.
    // Rebuild context using this specific list *before* calling AI
     setConversationContextFromAppMessages(
        newCurrentMessages.map(m => ({...m, timestamp: new Date(m.timestamp as Date)})),
        undefined,
        globalContextSummary
      );

    await getAiResponse(newText, activeChatId);

  }, [activeChatId, currentMessages, getAiResponse, globalContextSummary]);


  const handleRequestDeleteConfirmation = (sessionId: string, sessionTitle: string) => {
    setSessionToConfirmDelete({id: sessionId, title: sessionTitle});
    setIsDeleteConfirmationOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!sessionToConfirmDelete) return;
    const sessionToDeleteId = sessionToConfirmDelete.id;
    setAllChatSessions(prevSessions => prevSessions.filter(session => session.id !== sessionToDeleteId));
    if (activeChatId === sessionToDeleteId) handleNewChat();
    setIsDeleteConfirmationOpen(false);
    setSessionToConfirmDelete(null);
    try {
      await deleteChatSessionFromFirestore(sessionToDeleteId); // Use direct Firebase call
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
      // Use direct Firebase call for rename if your API just wraps this
      // For now, assuming API handles it or you have updateChatSessionTitleInFirestore
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
