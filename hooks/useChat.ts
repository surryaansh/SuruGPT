import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import { Message, SenderType, ChatSession } from '../types';
import { generateId } from '../utils/helpers';
import { generateChatTitle, generateFallbackTitle } from '../services/chatTitleService';
import { 
  sendMessageStream, 
  setConversationContextFromAppMessages, 
  triggerMemoryUpdateForSession, 
  startNewOpenAIChatSession 
} from '../services/openAIService';
import {
  getChatSessions,
  getMessagesForSession,
  createChatSessionInFirestore,
  addMessageToFirestore,
  updateChatSessionTitleInFirestore
} from '../services/firebaseService';

const LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY = 'surugpt_activeChatId_owner';

export function useChat(currentUser: User | null) {
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [allChatSessions, setAllChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isLoadingAiResponse, setIsLoadingAiResponse] = useState(false);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const previousActiveSessionIdToProcessOnNewChatRef = useRef<string | null>(null);

  // Sync sessions on auth
  useEffect(() => {
    if (currentUser) {
      const storedId = localStorage.getItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${currentUser.uid}`);
      previousActiveSessionIdToProcessOnNewChatRef.current = storedId;
      setIsSessionsLoading(true);
      getChatSessions(currentUser.uid).then(sessions => {
        setAllChatSessions(sessions);
        setIsSessionsLoading(false);
      });
    } else {
      setAllChatSessions([]);
      setActiveChatId(null);
      setCurrentMessages([]);
    }
  }, [currentUser]);

  const processMemory = useCallback(async (uid: string, sid: string, msgs: Message[]) => {
    if (!sid || sid.startsWith("PENDING_") || msgs.length === 0) return;
    try {
      await triggerMemoryUpdateForSession(uid, sid, msgs);
    } catch (e) { console.error("Memory error:", e); }
  }, []);

  const selectChat = useCallback(async (chatId: string) => {
    if (!currentUser || activeChatId === chatId) return;
    if (activeChatId && currentMessages.length > 0) {
      processMemory(currentUser.uid, activeChatId, currentMessages);
    }
    setActiveChatId(chatId);
    try {
      const messages = await getMessagesForSession(currentUser.uid, chatId);
      setCurrentMessages(messages);
      setConversationContextFromAppMessages(messages);
    } catch (e) { console.error("Load messages error:", e); }
  }, [currentUser, activeChatId, currentMessages, processMemory]);

  const streamAiResponse = async (text: string, sessionId: string, uid: string) => {
    setIsLoadingAiResponse(true);
    const aiId = generateId();
    setCurrentMessages(prev => [...prev, { id: aiId, text: '', sender: SenderType.AI, timestamp: new Date(), feedback: null }]);
    let accumulated = '';
    try {
      const stream = await sendMessageStream(text, uid);
      if (stream) {
        for await (const chunk of stream) {
          accumulated += chunk.text || '';
          setCurrentMessages(prev => prev.map(m => m.id === aiId ? { ...m, text: accumulated } : m));
        }
        if (accumulated.trim()) {
          await addMessageToFirestore(uid, sessionId, { text: accumulated, sender: SenderType.AI });
        }
      }
    } catch (e) {
      setCurrentMessages(prev => prev.map(m => m.id === aiId ? { ...m, text: "Trouble thinking... ✨" } : m));
    } finally {
      setIsLoadingAiResponse(false);
    }
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!currentUser || !text.trim()) return;

    if (!activeChatId && previousActiveSessionIdToProcessOnNewChatRef.current) {
        const oldId = previousActiveSessionIdToProcessOnNewChatRef.current;
        const oldMsgs = await getMessagesForSession(currentUser.uid, oldId);
        processMemory(currentUser.uid, oldId, oldMsgs);
        previousActiveSessionIdToProcessOnNewChatRef.current = null;
    }

    const userMessage: Message = { id: generateId(), text, sender: SenderType.USER, timestamp: new Date() };

    if (!activeChatId || activeChatId.startsWith("PENDING_")) {
      if (!activeChatId) setActiveChatId(`PENDING_${generateId()}`);
      setCurrentMessages([userMessage]);
      setIsLoadingAiResponse(true);

      try {
        startNewOpenAIChatSession();
        const fallbackTitle = generateFallbackTitle(text);
        const newSession = await createChatSessionInFirestore(currentUser.uid, fallbackTitle, text);
        setActiveChatId(newSession.id);
        setAllChatSessions(prev => [newSession, ...prev]);
        localStorage.setItem(`${LOCAL_STORAGE_ACTIVE_CHAT_ID_KEY}_${currentUser.uid}`, newSession.id);
        const finalUserMsg = await addMessageToFirestore(currentUser.uid, newSession.id, { text, sender: SenderType.USER });
        setCurrentMessages([finalUserMsg]);
        await streamAiResponse(text, newSession.id, currentUser.uid);

        generateChatTitle(text, currentUser.uid).then(betterTitle => {
          if (betterTitle && betterTitle !== fallbackTitle) {
            updateChatSessionTitleInFirestore(currentUser.uid, newSession.id, betterTitle);
            setAllChatSessions(prev => prev.map(s => s.id === newSession.id ? { ...s, title: betterTitle } : s));
          }
        });
      } catch (e) { setIsLoadingAiResponse(false); }
    } else {
      const finalMsg = await addMessageToFirestore(currentUser.uid, activeChatId, { text, sender: SenderType.USER });
      setCurrentMessages(prev => [...prev, finalMsg]);
      await streamAiResponse(text, activeChatId, currentUser.uid);
    }
  }, [currentUser, activeChatId, processMemory]);

  const startNewChat = useCallback(() => {
    if (currentUser && activeChatId) processMemory(currentUser.uid, activeChatId, currentMessages);
    startNewOpenAIChatSession();
    setActiveChatId(null);
    setCurrentMessages([]);
  }, [currentUser, activeChatId, currentMessages, processMemory]);

  return {
    currentMessages, setCurrentMessages,
    allChatSessions, setAllChatSessions,
    activeChatId, setActiveChatId,
    isLoadingAiResponse,
    isSessionsLoading,
    sendMessage,
    startNewChat,
    selectChat,
    processMemory
  };
}