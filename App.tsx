
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
  startNewOpenAIChatSession as resetAiContextWithSystemPrompt, // Renamed for clarity
  setConversationContextFromAppMessages // Existing function to set AI context
} from './services/openAIService'; 
import {
  getChatSessions,
  getMessagesForSession,
  createChatSessionInFirestore,
  addMessageToFirestore,
  updateChatSessionTitleInFirestore // Optional for later
} from './services/firebaseService'; // Import Firebase service functions

const generateChatTitle = (firstMessageText: string): string => {
  if (!firstMessageText) return `Chat @ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const words = firstMessageText.split(' ');
  if (words.length > 4) {
    return words.slice(0, 4).join(' ') + '...';
  }
  return firstMessageText;
};

const App: React.FC = () => {
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [allChatSessions, setAllChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  
  const [isLoadingAiResponse, setIsLoadingAiResponse] = useState<boolean>(false);
  const [isSessionsLoading, setIsSessionsLoading] = useState<boolean>(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState<boolean>(false);
  
  const [chatReady, setChatReady] = useState<boolean>(true); 
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Ref to ensure initial load effects run only once
  const initialLoadComplete = useRef(false);

  // Load chat sessions from Firestore on initial mount
  useEffect(() => {
    if (initialLoadComplete.current) return;
    initialLoadComplete.current = true;

    setChatReady(checkChatAvailability()); 
    resetAiContextWithSystemPrompt(); // Reset AI context on app load before any chat is selected

    const loadSessions = async () => {
      setIsSessionsLoading(true);
      try {
        const sessions = await getChatSessions();
        setAllChatSessions(sessions);
      } catch (error) {
        console.error("Failed to load chat sessions:", error);
        // Optionally set an error state to display to the user
      } finally {
        setIsSessionsLoading(false);
      }
    };
    loadSessions();
  }, []);

  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleNewChat = () => { 
    setCurrentMessages([]);
    setActiveChatId(null);
    resetAiContextWithSystemPrompt(); // Reset AI context for a new chat
    setChatReady(checkChatAvailability()); 
    setIsSidebarOpen(false);
  };

  const handleSelectChat = useCallback(async (chatId: string) => { 
    if (activeChatId === chatId && currentMessages.length > 0) {
        setIsSidebarOpen(false); // Just close sidebar if already active and has messages
        return;
    }
    setActiveChatId(chatId);
    setCurrentMessages([]); // Clear current messages while new ones load
    setIsMessagesLoading(true);
    setIsSidebarOpen(false);
    try {
      const messages = await getMessagesForSession(chatId);
      setCurrentMessages(messages);
      // Restore conversation history in openAIService for the selected chat.
      setConversationContextFromAppMessages(messages.map(m => ({...m, timestamp: new Date(m.timestamp as Date)}))); // Ensure JS Date
    } catch (error) {
      console.error(`Failed to load messages for chat ${chatId}:`, error);
      setCurrentMessages([{
        id: crypto.randomUUID(),
        text: "Error loading messages for this chat. Please try again.",
        sender: SenderType.AI,
        timestamp: new Date()
      }]);
      resetAiContextWithSystemPrompt(); // Reset to default if messages fail to load
    } finally {
      setIsMessagesLoading(false);
    }
  }, [activeChatId, currentMessages.length]);


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
      id: tempUserMessageId, // Temporary ID for UI
      text,
      sender: SenderType.USER,
      timestamp: new Date(),
    };

    setCurrentMessages(prevMessages => [...prevMessages, userMessageForUI]);
    
    let currentSessionId = activeChatId;
    // let sessionTitleNeedsUpdate = false; // Not currently used, but keep for potential future logic

    try {
        if (!currentSessionId) {
          // Create new session in Firestore
          const title = generateChatTitle(text);
          const newSessionFromDb = await createChatSessionInFirestore(title, text);
          currentSessionId = newSessionFromDb.id;
          
          // Save the first user message to this new session
          const savedUserMessage = await addMessageToFirestore(currentSessionId, { text, sender: SenderType.USER });
          
          // Update UI with new session and replace temp user message with saved one
          setAllChatSessions(prevSessions => [newSessionFromDb, ...prevSessions]);
          setActiveChatId(currentSessionId);
          setCurrentMessages([savedUserMessage]); // Start with the saved user message
          setConversationContextFromAppMessages([savedUserMessage].map(m => ({...m, timestamp: new Date(m.timestamp as Date)}))); // Set context with first message
          
        } else {
          // Add user message to existing session in Firestore
          const savedUserMessage = await addMessageToFirestore(currentSessionId, { text, sender: SenderType.USER });
          // Update UI: replace temp message with saved one
           setCurrentMessages(prevMessages => 
            prevMessages.map(msg => msg.id === tempUserMessageId ? savedUserMessage : msg)
          );
        }
    } catch (error) {
        console.error("Error saving user message to Firestore:", error);
        setCurrentMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            text: "Error saving your message. Please try again.",
            sender: SenderType.AI,
            timestamp: new Date()
        }]);
        setIsLoadingAiResponse(false); // Stop AI loading if user message failed to save
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
      // The openAIService's conversationHistory should have been set by handleSelectChat or with the first user message.
      // Now, we add the current user's message to that history before calling the AI.
      // This is now handled inside openAIService.sendMessageStream
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
          // No need to update currentMessages again here if streaming update was fine
        } else if (currentSessionId && accumulatedAiText.trim() === '') {
            // AI responded with empty string
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
  }, [chatReady, activeChatId]); // Removed currentMessages from dependency to avoid issues with optimistic updates

  const showWelcome = !activeChatId && currentMessages.length === 0 && chatReady && !isSessionsLoading && !isMessagesLoading;

  return (
    <div className="flex flex-col h-full bg-[#2D2A32] overflow-hidden"> {/* Changed h-screen max-h-screen to h-full */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={handleToggleSidebar} 
        onNewChat={handleNewChat}
        chatSessions={allChatSessions}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        isLoading={isSessionsLoading}
      />
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 sidebar-overlay" 
          onClick={handleToggleSidebar}
          aria-hidden="true"
        ></div>
      )}
      <div className="relative z-10 flex flex-col flex-grow h-full w-full bg-[#393641]"> {/* Added w-full */}
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
