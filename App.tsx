
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Message, SenderType, ChatSession, AIResponse } from './types';
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
  updateUserMessageTextInFirestore, 
  deleteChatSessionFromFirestore,
  updateMessageFeedbackInFirestore,
  addResponseToAIMessageInFirestore,
  updateAIMessageResponseNavigationInFirestore,
  updateChatSessionTitleInFirestore,
} from './services/firebaseService';
import { Timestamp } from 'firebase/firestore';

const summarizeTextForTitle = async (text: string): Promise<string | null> => {
  try {
    const response = await fetch(`${window.location.origin}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textToSummarize: text }),
    });
    if (!response.ok) {
      const errorBody = await response.text(); 
      console.error('[summarizeTextForTitle] Summarization API error. Status:', response.status, 'Body:', errorBody);
      return null;
    }
    const data = await response.json();
    if (data && data.summary && typeof data.summary === 'string' && data.summary.trim() !== "") {
      return data.summary.trim();
    }
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
    return timestampTitle;
  }
  const summary = await summarizeTextForTitle(firstMessageText);
  if (summary) { 
    return summary;
  }
  return generateFallbackTitle(firstMessageText);
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
      const messagesFromDb = await getMessagesForSession(chatId);
      setCurrentMessages(messagesFromDb);
      setConversationContextFromAppMessages(messagesFromDb, undefined, globalContextSummary);
    } catch (error) {
      console.error(`Failed to load messages for chat ${chatId}:`, error);
      setCurrentMessages([{ id: crypto.randomUUID(), text: "Error loading messages for this chat. Please try again.", sender: SenderType.AI, timestamp: new Date(), feedback: null, responses: [{text: "Error loading messages", feedback: null, timestamp: new Date()}], currentResponseIndex: 0 }]);
      resetAiContextWithSystemPrompt(undefined, globalContextSummary);
    } finally { setIsMessagesLoading(false); }
  }, [activeChatId, currentMessages.length, globalContextSummary, isDesktopView]);

  const streamAndProcessAiResponse = async (
    textForAi: string,
    onChunk: (chunkText: string) => void,
    onComplete: (fullText: string) => void,
    onError: (errorText: string) => void
  ) => {
    let accumulatedText = "";
    try {
      // Context is set before calling this function, typically in handleSendMessage or handleRetry
      const stream = await sendMessageStream(textForAi);
      if (stream) {
        for await (const chunk of stream) {
          const chunkText = chunk.text;
          if (chunkText !== undefined) {
            accumulatedText += chunkText;
            onChunk(chunkText);
          }
        }
        onComplete(accumulatedText);
      } else {
        onError("Stream could not be established.");
      }
    } catch (error: any) {
      console.error('Error streaming response:', error);
      const errorText = error.message || "AI streaming error.";
      onError(errorText);
    }
  };

  const handleSendMessage = useCallback(async (text: string) => {
    if (!chatReady) { 
        setCurrentMessages(prev => [...prev, { id: crypto.randomUUID(), text: "Chat is not available. Please check API key.", sender: SenderType.AI, timestamp: new Date(), feedback: null, responses: [{text: "Chat not available", feedback: null, timestamp: new Date()}], currentResponseIndex: 0 }]);
        return;
    }
    
    const userMessageData: Message = {
      id: crypto.randomUUID(), 
      text,
      sender: SenderType.USER,
      timestamp: new Date(),
    };
    
    let currentSessionId = activeChatId;
    let messagesForContext = [...currentMessages, userMessageData];

    if (!currentSessionId) {
      const title = await generateChatTitle(text); 
      const newSessionFromDb = await createChatSessionInFirestore(title, text);
      currentSessionId = newSessionFromDb.id;
      setAllChatSessions(prevSessions => [newSessionFromDb, ...prevSessions.filter(s => s.id !== newSessionFromDb.id)]);
      setActiveChatId(currentSessionId); 
      
      const finalUserMessage = await addMessageToFirestore(currentSessionId, { text, sender: SenderType.USER });
      setCurrentMessages([finalUserMessage]); // Start with just the saved user message
      messagesForContext = [finalUserMessage]; // Context now only has this one message
    } else {
      const finalUserMessage = await addMessageToFirestore(currentSessionId, { text, sender: SenderType.USER });
      setCurrentMessages(prevMessages => [...prevMessages, finalUserMessage]);
      messagesForContext = [...currentMessages, finalUserMessage];
    }
    if (!currentSessionId) return;

    setIsLoadingAiResponse(true);
    const tempAiMessageId = crypto.randomUUID();
    const aiPlaceholderMessage: Message = {
      id: tempAiMessageId,
      sender: SenderType.AI,
      text: '', // Initially empty, will be filled by streaming
      timestamp: new Date(), // Placeholder, will be updated
      feedback: null,
      promptText: text, // Store the prompt
      responses: [{ text: '', feedback: null, timestamp: new Date() }], // Initial empty response
      currentResponseIndex: 0,
      isStreamingThisResponse: true, // Mark as streaming
    };
    setCurrentMessages(prev => [...prev, aiPlaceholderMessage]);
    setConversationContextFromAppMessages(messagesForContext, undefined, globalContextSummary);

    await streamAndProcessAiResponse(
      text,
      (chunkText) => { 
        setCurrentMessages(prevMessages => prevMessages.map(msg => {
          if (msg.id === tempAiMessageId && msg.sender === SenderType.AI && msg.responses && msg.currentResponseIndex === 0 && msg.isStreamingThisResponse) {
            const newText = (msg.responses[0].text || '') + chunkText;
            const updatedResponses: AIResponse[] = [{ ...msg.responses[0], text: newText, timestamp: new Date() /* Update timestamp during stream */ }];
            return { ...msg, text: newText, responses: updatedResponses, timestamp: updatedResponses[0].timestamp };
          }
          return msg;
        }));
      },
      async (fullText) => { 
        if (!currentSessionId) return;
        // Save the completed AI message to Firestore
        const finalAiMessageData = await addMessageToFirestore(currentSessionId, {
          sender: SenderType.AI,
          text: fullText, // This text is for the first response
          promptText: text,
          // Firestore service will handle responses array creation correctly for a new message
        });
        setCurrentMessages(prevMessages => prevMessages.map(msg => msg.id === tempAiMessageId ? { ...finalAiMessageData, isStreamingThisResponse: false } : msg ));
        setIsLoadingAiResponse(false);
      },
      async (errorText) => { 
        if (!currentSessionId) return;
        const errorAiMessageData = await addMessageToFirestore(currentSessionId, {
            sender: SenderType.AI,
            text: errorText,
            promptText: text,
        });
        setCurrentMessages(prevMessages => prevMessages.map(msg => msg.id === tempAiMessageId ? { ...errorAiMessageData, isStreamingThisResponse: false } : msg ));
        setIsLoadingAiResponse(false);
      }
    );

  }, [chatReady, activeChatId, globalContextSummary, currentMessages]);


  const handleCopyText = useCallback(async (textToCopy: string) => {
    try { await navigator.clipboard.writeText(textToCopy); } 
    catch (err) { console.error('Failed to copy text: ', err); }
  }, []);

  const handleRateResponse = useCallback(async (messageId: string, rating: 'good' | 'bad') => {
    if (!activeChatId) return;
    
    const messageToUpdate = currentMessages.find(msg => msg.id === messageId);
    if (!messageToUpdate || messageToUpdate.sender !== SenderType.AI || !messageToUpdate.responses || typeof messageToUpdate.currentResponseIndex !== 'number') return;

    const currentFeedback = messageToUpdate.responses[messageToUpdate.currentResponseIndex].feedback;
    const newFeedbackValue = currentFeedback === rating ? null : rating;

    // Optimistic UI Update
    setCurrentMessages(prevMessages =>
      prevMessages.map(msg => {
        if (msg.id === messageId) {
          const updatedResponses = msg.responses!.map((resp, index) => 
            index === msg.currentResponseIndex ? { ...resp, feedback: newFeedbackValue } : resp
          );
          return { ...msg, responses: updatedResponses, feedback: newFeedbackValue }; // Sync top-level feedback too
        }
        return msg;
      })
    );
    try {
      const updatedMessageFromDb = await updateMessageFeedbackInFirestore(activeChatId, messageId, newFeedbackValue);
      // Update state with the source of truth from DB
      setCurrentMessages(prevMessages => prevMessages.map(msg => msg.id === messageId ? updatedMessageFromDb : msg));
    } catch (error) {
      console.error("Failed to update feedback:", error);
      // Revert optimistic update on error by re-fetching or using original state
      // For simplicity, we might just log error and let optimistic stay, or re-fetch:
      const messagesFromDb = await getMessagesForSession(activeChatId); // Example re-fetch
      setCurrentMessages(messagesFromDb);
    }
  }, [activeChatId, currentMessages]);
  
  const handleRetryAiResponse = useCallback(async (aiMessageId: string, userPromptText: string) => {
    if (!activeChatId || !userPromptText) return;
    
    const baseMessagesForContext = currentMessages.filter(m => m.id !== aiMessageId);
    setConversationContextFromAppMessages(baseMessagesForContext, undefined, globalContextSummary);

    setIsLoadingAiResponse(true);

    setCurrentMessages(prevMessages =>
      prevMessages.map(msg => {
        if (msg.id === aiMessageId && msg.sender === SenderType.AI) {
          const newResponseShell: AIResponse = { text: '', feedback: null, timestamp: new Date() };
          const newResponses = [...(msg.responses || []), newResponseShell];
          const newIndex = newResponses.length - 1;
          return {
            ...msg,
            responses: newResponses,
            currentResponseIndex: newIndex,
            text: '', 
            feedback: null,
            timestamp: new Date(),
            isStreamingThisResponse: true,
          };
        }
        return msg;
      })
    );
    
    await streamAndProcessAiResponse(
      userPromptText,
      (chunkText) => { 
        setCurrentMessages(prevMessages => prevMessages.map(msg => {
          if (msg.id === aiMessageId && msg.sender === SenderType.AI && msg.responses && typeof msg.currentResponseIndex === 'number' && msg.isStreamingThisResponse) {
            const currentIndex = msg.currentResponseIndex;
            const currentResponse = msg.responses[currentIndex];
            if (currentResponse) { // Ensure currentResponse exists
                const newText = (currentResponse.text || '') + chunkText;
                const updatedResponses = msg.responses.map((r, i) => i === currentIndex ? {...r, text: newText, timestamp: new Date()} : r);
                return { ...msg, text: newText, responses: updatedResponses, timestamp: updatedResponses[currentIndex].timestamp };
            }
          }
          return msg;
        }));
      },
      async (fullText) => { 
        if (!activeChatId) return;
        const updatedMessageFromDb = await addResponseToAIMessageInFirestore(activeChatId, aiMessageId, fullText);
        setCurrentMessages(prevMessages => prevMessages.map(msg => msg.id === aiMessageId ? { ...updatedMessageFromDb, isStreamingThisResponse: false } : msg ));
        setIsLoadingAiResponse(false);
      },
      async (errorText) => { 
         if (!activeChatId) return;
        const updatedMessageFromDb = await addResponseToAIMessageInFirestore(activeChatId, aiMessageId, errorText);
        setCurrentMessages(prevMessages => prevMessages.map(msg => msg.id === aiMessageId ? { ...updatedMessageFromDb, isStreamingThisResponse: false } : msg ));
        setIsLoadingAiResponse(false);
      }
    );
  }, [activeChatId, currentMessages, globalContextSummary]);

  const handleNavigateAiResponse = useCallback(async (messageId: string, direction: 'prev' | 'next') => {
    if (!activeChatId) return;
    
    const messageIndex = currentMessages.findIndex(m => m.id === messageId && m.sender === SenderType.AI);
    if (messageIndex === -1) return;

    const messageToUpdate = currentMessages[messageIndex];
    if (!messageToUpdate.responses || typeof messageToUpdate.currentResponseIndex !== 'number') return;

    let newIndex = messageToUpdate.currentResponseIndex;
    if (direction === 'prev' && newIndex > 0) newIndex--;
    if (direction === 'next' && newIndex < messageToUpdate.responses.length - 1) newIndex++;

    if (newIndex === messageToUpdate.currentResponseIndex) return; 

    // Optimistic UI update
    const newCurrentResponse = messageToUpdate.responses[newIndex];
    const optimisticallyUpdatedMessage: Message = {
      ...messageToUpdate,
      currentResponseIndex: newIndex,
      text: newCurrentResponse.text,
      feedback: newCurrentResponse.feedback,
      timestamp: newCurrentResponse.timestamp,
      isStreamingThisResponse: false, // Navigation implies content is loaded
    };
    const updatedMessages = [...currentMessages];
    updatedMessages[messageIndex] = optimisticallyUpdatedMessage;
    setCurrentMessages(updatedMessages);
    
    try {
      const finalUpdatedMessage = await updateAIMessageResponseNavigationInFirestore(activeChatId, messageId, newIndex);
      setCurrentMessages(prev => prev.map(m => m.id === messageId ? finalUpdatedMessage : m));
    } catch (error) {
      console.error("Failed to navigate AI response:", error);
      // Revert optimistic update by re-fetching or using original state.
      // For simplicity, we might re-fetch or restore the specific message.
      const messagesFromDb = await getMessagesForSession(activeChatId); 
      setCurrentMessages(messagesFromDb);
    }
  }, [activeChatId, currentMessages]);

  const handleSaveUserEdit = useCallback(async (messageId: string, newText: string) => {
    if (!activeChatId) return;
    
    const originalMessages = [...currentMessages];
    const messageIndex = currentMessages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    const updatedMessageForUI: Message = { 
        ...currentMessages[messageIndex], 
        text: newText, 
        timestamp: new Date() // Use current client time for UI, Firestore uses serverTimestamp
    };
    
    const newCurrentMessages = [...currentMessages];
    newCurrentMessages[messageIndex] = updatedMessageForUI;
    setCurrentMessages(newCurrentMessages);

    try {
      await updateUserMessageTextInFirestore(activeChatId, messageId, newText);
      // Optionally re-fetch or confirm the update if necessary, but often optimistic is enough.
      // To ensure full consistency, re-fetch:
      const messagesFromDb = await getMessagesForSession(activeChatId);
      setCurrentMessages(messagesFromDb);

    } catch (error) {
        console.error("Failed to save user edit:", error);
        setCurrentMessages(originalMessages); // Revert on error
    }
  }, [activeChatId, currentMessages]);

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteChatSessionFromFirestore(sessionId);
      setAllChatSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeChatId === sessionId) {
        handleNewChat(); // Go to new chat state if active one is deleted
      }
    } catch (error) {
      console.error("Error deleting session from App:", error);
      // Potentially show user error
    }
  };

  const handleConfirmDelete = () => {
    if (sessionToConfirmDelete) {
      handleDeleteSession(sessionToConfirmDelete.id);
    }
    setIsDeleteConfirmationOpen(false);
    setSessionToConfirmDelete(null);
  };

  const handleRequestDeleteConfirmation = (sessionId: string, sessionTitle: string) => {
    setSessionToConfirmDelete({ id: sessionId, title: sessionTitle });
    setIsDeleteConfirmationOpen(true);
  };
  
  const handleRenameChatSession = async (sessionId: string, newTitle: string) => {
    try {
      await updateChatSessionTitleInFirestore(sessionId, newTitle);
      setAllChatSessions(prevSessions =>
        prevSessions.map(session =>
          session.id === sessionId ? { ...session, title: newTitle } : session
        )
      );
    } catch (error) {
      console.error("Failed to rename chat session in App:", error);
      // Potentially show user error and revert optimistic update if any
      throw error; // Re-throw to allow Sidebar to handle its local state if needed
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#2D2A32] overflow-hidden">
      <Header onToggleSidebar={handleToggleSidebar} onNewChat={handleNewChat} />
      <div className="flex flex-1 overflow-hidden">
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
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Sidebar Overlay for mobile */}
          {isSidebarOpen && !isDesktopView && (
            <div 
              onClick={handleToggleSidebar} 
              className="sidebar-overlay fixed inset-0 bg-black/50 z-30" 
              aria-hidden="true"
            />
          )}
          {currentMessages.length === 0 && !isMessagesLoading ? (
            <WelcomeMessage />
          ) : (
            <ChatMessageList
              messages={currentMessages}
              isLoadingAiResponse={isLoadingAiResponse}
              onCopyText={handleCopyText}
              onRateResponse={handleRateResponse}
              onRetryResponse={handleRetryAiResponse}
              onSaveEdit={handleSaveUserEdit}
              onNavigateAiResponse={handleNavigateAiResponse}
            />
          )}
          <ChatInputBar onSendMessage={handleSendMessage} isLoading={isLoadingAiResponse} isChatAvailable={chatReady} />
        </main>
      </div>
      <ConfirmationDialog
        isOpen={isDeleteConfirmationOpen}
        onClose={() => setIsDeleteConfirmationOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Chat Session"
        message={
          <>
            Are you sure you want to delete the chat session titled "<strong>{sessionToConfirmDelete?.title || 'this session'}</strong>"? This action cannot be undone.
          </>
        }
      />
    </div>
  );
};

export default App;
