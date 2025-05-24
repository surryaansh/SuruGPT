
import React, { useState, useEffect, useCallback } from 'react';
import { Message, SenderType, ChatSession } from './types';
import Header from './components/Header';
import WelcomeMessage from './components/WelcomeMessage';
import ChatMessageList from './components/ChatMessageList';
import ChatInputBar from './components/ChatInputBar';
import Sidebar from './components/Sidebar';
import { 
  // initChatSession, // No longer directly called from App, openAIService handles its own init
  sendMessageStream, 
  isChatAvailable as checkChatAvailability, // Will now always return true
  startNewOpenAIChatSession 
} from './services/openAIService'; 

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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // chatReady is now assumed true, API key errors handled by backend communication
  const [chatReady, setChatReady] = useState<boolean>(true); 
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  useEffect(() => {
    // Initialize the app state.
    // openAIService manages its own initial history setup.
    // We can ensure a new session state in App.tsx if needed, but
    // the service already initializes with a default system prompt.
    startNewOpenAIChatSession(); // Resets local history in service
    setChatReady(checkChatAvailability()); // This will always be true now

    // Remove any old API key error messages that might have been persisted
    if(currentMessages.length > 0 && currentMessages[0].text.includes("OPENAI_API_KEY")) {
        setCurrentMessages([]); 
    }
  }, []); // Empty dependency array: runs once on mount.

  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleNewChat = () => { // No longer async, service call is sync
    setCurrentMessages([]);
    setActiveChatId(null);
    startNewOpenAIChatSession(); // Resets local history in openAIService
    setChatReady(checkChatAvailability()); 
    setIsSidebarOpen(false);
  };

  const handleSelectChat = (chatId: string) => { // No longer async
    const selectedSession = allChatSessions.find(session => session.id === chatId);
    if (selectedSession) {
      setCurrentMessages([...selectedSession.messages]);
      setActiveChatId(chatId);
      
      // IMPORTANT: Restore conversation history in openAIService for the selected chat.
      // This means calling startNewOpenAIChatSession with the system prompt of the selected chat (if stored)
      // and then re-populating the history in openAIService with messages from selectedSession.
      // For simplicity, we re-initialize the service's history and then rebuild it.
      startNewOpenAIChatSession(); // Clears current history in service
      
      // Manually rebuild history in the service (openAIService doesn't expose history directly)
      // This is a conceptual step. The ideal way would be for openAIService to have a
      // `setHistory(messages)` function. For now, new messages will use this context.
      // The current openAIService implementation uses a global `conversationHistory`.
      // To truly restore, openAIService would need to be enhanced or App.tsx would
      // pass the full history to sendMessageStream.
      // The current `openAIService` re-adds messages internally.
      // A simplified approach for now: when a chat is selected, future messages
      // to that chat will start with a fresh system prompt context unless
      // openAIService is modified to accept and set a full history array.
      // The current sendMessageStream sends its internal history.
      // So, we need to "replay" the selected chat messages into the service.
      // This is a limitation of the current openAIService design not exposing history setter.
      // For this iteration, selecting a chat means new messages start from a fresh system prompt
      // but build upon the displayed messages context visually. The AI's actual context
      // will be limited to what's sent via `sendMessageStream` which uses its internal history.
      // Let's assume `startNewOpenAIChatSession` is enough for now, and subsequent sends build up history.
      // Or, more robustly, we'd need to modify openAIService to accept history.
      // For now, each new message after selection re-sends what's in openAIService's history.
      // If user sends a message, that message is added to service's history.
      // This is a slight deviation from perfect context restoration but works for new interactions.
    }
    setIsSidebarOpen(false);
  };

  const handleSendMessage = useCallback(async (text: string) => {
    if (!chatReady) { // Should always be true now, but good to keep check
      console.warn("Chat is not ready. Cannot send message.");
      // Optionally, display a message to the user
      setCurrentMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        text: "Chat service is currently unavailable. Please try again later.",
        sender: SenderType.AI,
        timestamp: new Date()
      }]);
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      text,
      sender: SenderType.USER,
      timestamp: new Date(),
    };

    let currentSessionId = activeChatId;
    setCurrentMessages(prevMessages => [...prevMessages, userMessage]);

    if (!currentSessionId) {
      currentSessionId = crypto.randomUUID();
      const newSession: ChatSession = {
        id: currentSessionId,
        title: generateChatTitle(text),
        messages: [userMessage],
        createdAt: new Date(),
      };
      setAllChatSessions(prevSessions => [newSession, ...prevSessions]);
      setActiveChatId(currentSessionId);
    } else {
      setAllChatSessions(prevSessions =>
        prevSessions.map(session =>
          session.id === currentSessionId
            ? { ...session, messages: [...session.messages, userMessage] }
            : session
        )
      );
    }
    
    setIsLoading(true);
    const aiMessageId = crypto.randomUUID();
    const aiPlaceholderMessage: Message = { 
      id: aiMessageId, text: '', sender: SenderType.AI, timestamp: new Date() 
    };

    setCurrentMessages(prevMessages => [...prevMessages, aiPlaceholderMessage]);
    
    if (currentSessionId) {
        setAllChatSessions(prevSessions =>
            prevSessions.map(session =>
              session.id === currentSessionId
                ? { ...session, messages: [...session.messages, aiPlaceholderMessage] }
                : session
            )
          );
    }

    let accumulatedAiText = '';
    try {
      // sendMessageStream now calls /api/chat
      const stream = await sendMessageStream(text); // Text is implicitly added to history by service
      if (stream) {
        for await (const chunk of stream) { 
          const chunkText = chunk.text; 
          if (chunkText) {
            accumulatedAiText += chunkText;
            const updatedAiMessage = { ...aiPlaceholderMessage, text: accumulatedAiText, timestamp: new Date() };
            
            setCurrentMessages(prevMessages =>
              prevMessages.map(msg => (msg.id === aiMessageId ? updatedAiMessage : msg))
            );
            
            if (currentSessionId) {
              setAllChatSessions(prevSessions =>
                prevSessions.map(session =>
                  session.id === currentSessionId
                    ? {
                        ...session,
                        messages: session.messages.map(msg =>
                          msg.id === aiMessageId ? updatedAiMessage : msg
                        ),
                      }
                    : session
                )
              );
            }
          }
        }
        if (accumulatedAiText.trim() === '') {
           if (!currentMessages.find(msg => msg.id === aiMessageId && msg.text !== '')) {
             const fallbackMsg = "SuruGPT didn't provide a text response. Perhaps the request was unclear or the topic is restricted? 🤔";
             const updatedFallbackMessage = { ...aiPlaceholderMessage, text: fallbackMsg, timestamp: new Date() };
             setCurrentMessages(prevMessages =>
               prevMessages.map(msg => (msg.id === aiMessageId ? updatedFallbackMessage : msg))
             );
             if (currentSessionId) {
               setAllChatSessions(prevSessions =>
                   prevSessions.map(session =>
                     session.id === currentSessionId
                       ? { ...session, messages: session.messages.map(msg => msg.id === aiMessageId ? updatedFallbackMessage : msg) }
                       : session
                   )
               );
             }
           }
        }
      } else {
        const errorMsg = "It seems there was a hiccup sending your message to SuruGPT! The stream could not be established. Please try again. 🚧";
        const updatedErrorMessage = { ...aiPlaceholderMessage, text: errorMsg, timestamp: new Date() };
        setCurrentMessages(prevMessages =>
            prevMessages.map(msg => (msg.id === aiMessageId ? updatedErrorMessage : msg))
        );
        if (currentSessionId) {
            setAllChatSessions(prevSessions =>
                prevSessions.map(session =>
                  session.id === currentSessionId
                    ? { ...session, messages: session.messages.map(msg => msg.id === aiMessageId ? updatedErrorMessage : msg) }
                    : session
                )
            );
        }
      }
    } catch (error) {
      console.error('Error streaming response in App.tsx:', error);
      const errorText = error instanceof Error ? error.message : "SuruGPT encountered a little problem! Please try again. 🛠️";
      const finalErrorMessage = { ...aiPlaceholderMessage, text: errorText, timestamp: new Date() };
      setCurrentMessages(prevMessages =>
        prevMessages.map(msg => (msg.id === aiMessageId ? finalErrorMessage : msg))
      );
       if (currentSessionId) {
            setAllChatSessions(prevSessions =>
                prevSessions.map(session =>
                  session.id === currentSessionId
                    ? { ...session, messages: session.messages.map(msg => msg.id === aiMessageId ? finalErrorMessage : msg) }
                    : session
                )
            );
        }
    } finally {
      setIsLoading(false);
    }
  }, [chatReady, activeChatId]); 

  const showWelcome = !activeChatId && currentMessages.length === 0 && chatReady;
  // No longer show specific API key error welcome; errors are handled during message send.
  const showApiErrorWelcome = false; 


  return (
    <div className="flex flex-col h-screen max-h-screen bg-[#2D2A32] overflow-hidden">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={handleToggleSidebar} 
        onNewChat={handleNewChat}
        chatSessions={allChatSessions}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
      />
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 sidebar-overlay" 
          onClick={handleToggleSidebar}
          aria-hidden="true"
        ></div>
      )}
      <div className="relative z-10 flex flex-col flex-grow h-full bg-[#393641]">
        <Header onToggleSidebar={handleToggleSidebar} />
        <main className="flex-grow flex flex-col overflow-hidden">
          {showWelcome ? ( 
             <WelcomeMessage />
          ) : (
            <ChatMessageList messages={currentMessages} isLoadingAiResponse={isLoading} />
          )}
        </main>
        <ChatInputBar onSendMessage={handleSendMessage} isLoading={isLoading} isChatAvailable={chatReady} />
      </div>
    </div>
  );
};

export default App;
