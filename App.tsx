
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
  updateChatSessionTitleInFirestore
} from './services/firebaseService';
import { IS_FIREBASE_CONFIG_PLACEHOLDER } from './services/firebaseConfig'; // Import the check
import { IconSuru } from './constants'; // For the error message

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
  const [isSessionsLoading, setIsSessionsLoading] = useState<boolean>(true); // Default to true
  const [isMessagesLoading, setIsMessagesLoading] = useState<boolean>(false);
  
  const [chatReady, setChatReady] = useState<boolean>(true); 
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [globalContextSummary, setGlobalContextSummary] = useState<string>('');

  const [firebaseConfigValid] = useState<boolean>(!IS_FIREBASE_CONFIG_PLACEHOLDER); // Check config validity

  const initialLoadComplete = useRef(false);

  useEffect(() => {
    if (!firebaseConfigValid) {
      // If Firebase config is not valid, don't attempt to load sessions or initialize chat further.
      // The main component will render an error message.
      setIsSessionsLoading(false); // Ensure loading states are off
      setChatReady(false); // Indicate chat (especially history) isn't ready
      console.warn("Firebase configuration is invalid. Please update services/firebaseConfig.ts.");
      return;
    }

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
        console.error("Failed to load chat sessions (ensure Firebase config is correct and Firestore is enabled):", error);
        // Optionally, set an error state to display to the user within the main UI if needed
      } finally {
        setIsSessionsLoading(false);
      }
    };
    loadSessions();
  }, [firebaseConfigValid, globalContextSummary]); // Add firebaseConfigValid to dependencies

  // Effect to generate global context summary from all chat sessions
  useEffect(() => {
    if (!firebaseConfigValid || allChatSessions.length === 0) {
      setGlobalContextSummary('');
      return;
    }
    // ... (rest of the globalContextSummary effect remains the same)
      const MAX_TITLES_IN_SUMMARY = 3; 
      const allSanitizedTitles = allChatSessions
        .map(s => s.title.replace(/[^\w\\s.,!?']/gi, '').trim()) 
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
  }, [allChatSessions, firebaseConfigValid]);

  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleNewChat = () => { 
    if (!firebaseConfigValid) return; // Prevent new chat if config is bad
    setCurrentMessages([]);
    setActiveChatId(null);
    resetAiContextWithSystemPrompt(undefined, globalContextSummary); 
    setChatReady(checkChatAvailability()); 
    setIsSidebarOpen(false);
  };

  const handleSelectChat = useCallback(async (chatId: string) => { 
    if (!firebaseConfigValid) return; // Prevent selecting chat if config is bad

    if (activeChatId === chatId && currentMessages.length > 0) {
        setIsSidebarOpen(false);
        return;
    }
    setActiveChatId(chatId);
    setCurrentMessages([]);
    setIsMessagesLoading(true);
    setIsSidebarOpen(false);
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
  }, [activeChatId, currentMessages.length, globalContextSummary, firebaseConfigValid]);


  const handleSendMessage = useCallback(async (text: string) => {
    if (!firebaseConfigValid) {
      console.warn("Firebase is not configured. Message not sent to Firestore.");
      setCurrentMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        text: "Message not saved: Firebase is not configured. Please update services/firebaseConfig.ts.",
        sender: SenderType.AI,
        timestamp: new Date()
      }]);
      // Allow AI interaction even if not saving? For now, this message informs user.
      // If we want to completely block, we can return early.
      // Let's proceed with AI call but acknowledge saving will fail or skip.
      // The UI error is more prominent.
    }
    
    if (!chatReady && firebaseConfigValid) { // Modified condition: if firebase is valid but chat (OpenAI) isn't ready
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

    if (firebaseConfigValid) { // Only interact with Firestore if config is valid
      try {
          if (!currentSessionId) {
            const title = generateChatTitle(text);
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
          console.error("Error saving user message to Firestore:", error);
          setCurrentMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              text: "Error saving your message. Please try again.",
              sender: SenderType.AI,
              timestamp: new Date()
          }]);
          setIsLoadingAiResponse(false); // Ensure loading stops on Firestore error before AI call
          return; // Stop if saving user message fails
      }
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
        
        if (firebaseConfigValid && currentSessionId && accumulatedAiText.trim()) {
          await addMessageToFirestore(currentSessionId, { text: accumulatedAiText, sender: SenderType.AI });
        } else if (firebaseConfigValid && currentSessionId && accumulatedAiText.trim() === '') {
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
        if (firebaseConfigValid && currentSessionId) {
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
       if (firebaseConfigValid && currentSessionId) {
            await addMessageToFirestore(currentSessionId, { text: errorText, sender: SenderType.AI });
        }
    } finally {
      setIsLoadingAiResponse(false);
    }
  }, [chatReady, activeChatId, globalContextSummary, firebaseConfigValid]);

  if (!firebaseConfigValid) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-[#2D2A32] text-[#EAE6F0] p-8 text-center overflow-auto">
        <IconSuru className="w-20 h-20 sm:w-24 sm:h-24 text-[#FF8DC7] mb-6" />
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">Firebase Configuration Required</h1>
        <p className="text-lg mb-2">
          The application cannot connect to Firebase because the configuration is missing or uses placeholder values.
        </p>
        <p className="text-md mb-6 max-w-xl">
          Please update the <code className="bg-[#393641] px-1.5 py-1 rounded text-[#FF8DC7] text-sm">services/firebaseConfig.ts</code> file 
          with your actual Firebase project credentials.
        </p>
        <div className="bg-[#393641] p-4 rounded-lg text-left text-xs sm:text-sm max-w-xl w-full">
          <p className="font-semibold mb-2">Where to find your Firebase config:</p>
          <ol className="list-decimal list-inside space-y-1 text-[#C0BCCF]">
            <li>Go to the <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-[#FF8DC7] underline hover:text-opacity-80">Firebase Console</a>.</li>
            <li>Select your project.</li>
            <li>Click the gear icon (Project settings) near "Project Overview".</li>
            <li>In the "General" tab, scroll to "Your apps".</li>
            <li>Select your web app (or add one if it doesn't exist).</li>
            <li>Under "SDK setup and configuration", choose "Config".</li>
            <li>Copy the configuration object and paste its values into <code className="bg-[#2D2A32] px-1 py-0.5 rounded text-[#FF8DC7]">services/firebaseConfig.ts</code>.</li>
          </ol>
        </div>
         <p className="text-xs text-[#A09CB0] mt-6">
            After updating the configuration, please refresh this page.
          </p>
      </div>
    );
  }

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
        isLoading={isSessionsLoading}
      />
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 sidebar-overlay" 
          onClick={handleToggleSidebar}
          aria-hidden="true"
        ></div>
      )}
      <div className="relative z-10 flex flex-col flex-grow h-full w-full bg-[#393641]"> {/* Changed from #2D2A32 to #393641 to match inner components */}
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
