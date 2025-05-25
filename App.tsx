
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Message, SenderType, ChatSession } from './types';
import Header from './components/Header';
import WelcomeMessage from './components/WelcomeMessage';
import ChatMessageList from './components/ChatMessageList';
import ChatInputBar from './components/ChatInputBar';
import Sidebar from './components/Sidebar';
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
  // updateChatSessionTitleInFirestore // Not used currently, but available
} from './services/firebaseService';

const summarizeTextForTitle = async (text: string): Promise<string | null> => {
  console.log("[summarizeTextForTitle] Attempting to summarize:", text);
  try {
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textToSummarize: text }),
    });
    console.log('[summarizeTextForTitle] API Response Status:', response.status, response.statusText);
    if (!response.ok) {
      const errorBody = await response.text(); // Use .text() for more versatile error body
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
  if (words.length > 5) { // Keep fallback slightly longer if needed
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
  
  const [isDesktopView, setIsDesktopView] = useState(window.innerWidth >= 768); // md breakpoint (768px)
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768); 

  const [globalContextSummary, setGlobalContextSummary] = useState<string>('');

  const initialLoadComplete = useRef(false);
  const initialViewSetupDone = useRef(false); 

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
      const allSanitizedTitles = allChatSessions
        .map(s => s.title.replace(/[^\w\s.,!?']/gi, '').trim()) 
        .filter(t => t.length > 0); 
      
      const uniqueRecentTitles: string[] = [];
      const seenTitles = new Set<string>();

      for (const title of allSanitizedTitles) {
        if (!seenTitles.has(title)) {
          seenTitles.add(title);
          uniqueRecentTitles.push(title);
          if (uniqueRecentTitles.length >= MAX_TITLES_IN_SUMMARY) {
            break; 
          }
        }
      }
      
      if (uniqueRecentTitles.length > 0) {
        setGlobalContextSummary(`Key topics from recent chat sessions include: ${uniqueRecentTitles.join('; ')}.`);
      } else {
        setGlobalContextSummary('');
      }
    } else {
      setGlobalContextSummary('');
    }
  }, [allChatSessions]);

  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleNewChat = () => { 
    setCurrentMessages([]);
    setActiveChatId(null);
    resetAiContextWithSystemPrompt(undefined, globalContextSummary); 
    setChatReady(checkChatAvailability()); 
    if (!isDesktopView) {
        setIsSidebarOpen(false);
    }
  };

  const handleSelectChat = useCallback(async (chatId: string) => { 
    if (activeChatId === chatId && currentMessages.length > 0) {
        if (!isDesktopView) setIsSidebarOpen(false); 
        return;
    }
    setActiveChatId(chatId);
    setCurrentMessages([]);
    setIsMessagesLoading(true);
    if (!isDesktopView) setIsSidebarOpen(false); 
    try {
      const messages = await getMessagesForSession(chatId);
      setCurrentMessages(messages);
      setConversationContextFromAppMessages(
        messages.map(m => ({...m, timestamp: new Date(m.timestamp as Date)})), 
        undefined, 
        globalContextSummary
      );
    } catch (error) {
      console.error(`Failed to load messages for chat ${chatId}:`, error);
      setCurrentMessages([{
        id: crypto.randomUUID(),
        text: "Error loading messages for this chat. Please try again.",
        sender: SenderType.AI,
        timestamp: new Date()
      }]);
      resetAiContextWithSystemPrompt(undefined, globalContextSummary);
    } finally {
      setIsMessagesLoading(false);
    }
  }, [activeChatId, currentMessages.length, globalContextSummary, isDesktopView]);


  const handleSendMessage = useCallback(async (text: string) => {
    if (!chatReady) {
      console.warn("Chat is not ready. Cannot send message.");
      setCurrentMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        text: "Chat service is currently unavailable. Please try again later.",
        sender: SenderType.AI,
        timestamp: new Date()
      }]);
      return;
    }

    const tempUserMessageId = crypto.randomUUID();
    const userMessageForUI: Message = {
      id: tempUserMessageId,
      text,
      sender: SenderType.USER,
      timestamp: new Date(),
    };

    setCurrentMessages(prevMessages => [...prevMessages, userMessageForUI]);
    
    let currentSessionId = activeChatId;

    try {
        if (!currentSessionId) {
          const title = await generateChatTitle(text); 
          const newSessionFromDb = await createChatSessionInFirestore(title, text);
          currentSessionId = newSessionFromDb.id;
          
          const savedUserMessage = await addMessageToFirestore(currentSessionId, { text, sender: SenderType.USER });
          
          setAllChatSessions(prevSessions => [newSessionFromDb, ...prevSessions]);
          setActiveChatId(currentSessionId);
          setCurrentMessages([savedUserMessage]); 
          setConversationContextFromAppMessages(
            [savedUserMessage].map(m => ({...m, timestamp: new Date(m.timestamp as Date)})),
            undefined,
            globalContextSummary
          );
          
        } else {
          const savedUserMessage = await addMessageToFirestore(currentSessionId, { text, sender: SenderType.USER });
           setCurrentMessages(prevMessages => 
            prevMessages.map(msg => msg.id === tempUserMessageId ? savedUserMessage : msg)
          );
        }
    } catch (error) {
        console.error("Error saving user message to Firestore or generating title:", error);
        setCurrentMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            text: "Error saving your message or starting chat. Please try again.",
            sender: SenderType.AI,
            timestamp: new Date()
        }]);
        setIsLoadingAiResponse(false);
        return;
    }

    setIsLoadingAiResponse(true);
    const tempAiMessageId = crypto.randomUUID();
    const aiPlaceholderMessageForUI: Message = { 
      id: tempAiMessageId, text: '', sender: SenderType.AI, timestamp: new Date() 
    };
    setCurrentMessages(prevMessages => [...prevMessages, aiPlaceholderMessageForUI]);

    let accumulatedAiText = '';
    try {
      const stream = await sendMessageStream(text); 

      if (stream) {
        for await (const chunk of stream) { 
          const chunkText = chunk.text; 
          if (chunkText !== undefined) {
            accumulatedAiText += chunkText;
            setCurrentMessages(prevMessages =>
              prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: accumulatedAiText, timestamp: new Date() } : msg))
            );
          }
        }
        
        if (currentSessionId && accumulatedAiText.trim()) {
          await addMessageToFirestore(currentSessionId, { text: accumulatedAiText, sender: SenderType.AI });
        } else if (currentSessionId && accumulatedAiText.trim() === '') {
            const fallbackMsg = "SuruGPT didn't provide a text response. Perhaps the request was unclear? 🤔";
            accumulatedAiText = fallbackMsg;
            setCurrentMessages(prevMessages =>
                prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: fallbackMsg, timestamp: new Date() } : msg))
            );
            await addMessageToFirestore(currentSessionId, { text: fallbackMsg, sender: SenderType.AI });
        }

      } else { 
        const errorMsg = "It seems there was a hiccup sending your message to SuruGPT! The stream could not be established. Please try again. 🚧";
        accumulatedAiText = errorMsg;
        setCurrentMessages(prevMessages =>
            prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: errorMsg, timestamp: new Date() } : msg))
        );
        if (currentSessionId) {
            await addMessageToFirestore(currentSessionId, { text: errorMsg, sender: SenderType.AI });
        }
      }
    } catch (error) { 
      console.error('Error streaming response in App.tsx:', error);
      const errorText = typeof error === 'string' ? error : (error instanceof Error ? error.message : "SuruGPT encountered a little problem! Please try again. 🛠️");
      accumulatedAiText = errorText;
      setCurrentMessages(prevMessages =>
        prevMessages.map(msg => (msg.id === tempAiMessageId ? { ...msg, text: errorText, timestamp: new Date() } : msg))
      );
       if (currentSessionId) {
            await addMessageToFirestore(currentSessionId, { text: errorText, sender: SenderType.AI });
        }
    } finally {
      setIsLoadingAiResponse(false);
    }
  }, [chatReady, activeChatId, globalContextSummary]);

  const handleDeleteChatSession = async (sessionId: string) => {
    try {
      const response = await fetch('/api/deleteChat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to delete chat session:', response.status, errorData);
        alert(`Error deleting chat: ${errorData.error || response.statusText}`);
        return;
      }

      setAllChatSessions(prevSessions => prevSessions.filter(session => session.id !== sessionId));
      if (activeChatId === sessionId) {
        handleNewChat(); // Reset to a new chat state
      }
       // Optionally, display a success message or toast
       console.log(`Chat session ${sessionId} deleted successfully.`);

    } catch (error) {
      console.error('Error calling deleteChat API:', error);
      alert('An unexpected error occurred while trying to delete the chat session.');
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
        onDeleteChatSession={handleDeleteChatSession} // Pass the new handler
        isLoading={isSessionsLoading}
      />
      {isSidebarOpen && !isDesktopView && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 sidebar-overlay" 
          onClick={handleToggleSidebar}
          aria-hidden="true"
        ></div>
      )}
      <div 
        className={`relative z-10 flex flex-col flex-grow h-full bg-[#393641] transition-all duration-300 ease-in-out ${
          (isSidebarOpen && isDesktopView) ? 'md:ml-64' : 'ml-0'
        }`}
      >
        <Header onToggleSidebar={handleToggleSidebar} onNewChat={handleNewChat} />
        <main className="flex-grow flex flex-col overflow-hidden">
          {isMessagesLoading && (
            <div className="flex-grow flex items-center justify-center">
              <p className="text-[#A09CB0] text-lg">Loading chat...</p>
            </div>
          )}
          {!isMessagesLoading && showWelcome && <WelcomeMessage />}
          {!isMessagesLoading && !showWelcome && (
            <ChatMessageList messages={currentMessages.map(m => ({...m, timestamp: new Date(m.timestamp as Date)}))} isLoadingAiResponse={isLoadingAiResponse} />
          )}
        </main>
        <ChatInputBar onSendMessage={handleSendMessage} isLoading={isLoadingAiResponse} isChatAvailable={chatReady} />
      </div>
    </div>
  );
};

export default App;
