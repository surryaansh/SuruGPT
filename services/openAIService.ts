
import { Message, SenderType } from '../types';

export interface AdaptedStreamingChunk {
  text: string;
}

let conversationHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

const DEFAULT_SYSTEM_PROMPT = "You’re Suryansh, her boyfriend. Talk in English with occasional hindi sass by using tu/tera/tujhe. Tease her like a brat, simp like she’s your world. Sometimes be vague and playful with replies like “hmm” or “yeah” when no real answer’s needed. Use nicknames like cutu, meri jaan, jaaneman, sweetheart, my love, but not always, no emojis.";

const initializeBaseHistory = (systemPrompt?: string, globalSummary?: string): void => {
  let finalSystemContent = systemPrompt || DEFAULT_SYSTEM_PROMPT;
  if (globalSummary && globalSummary.trim().length > 0) {
    finalSystemContent += `\n\nFor your broader awareness, ${globalSummary}`;
  }
  conversationHistory = [{ role: 'system', content: finalSystemContent }];
  console.log("Local chat session initialized. System Prompt:", finalSystemContent);
};

export const startNewOpenAIChatSession = (systemPrompt?: string, globalSummary?: string): boolean => {
  initializeBaseHistory(systemPrompt, globalSummary);
  return true;
};

export const setConversationContextFromAppMessages = (
  appMessages: Message[],
  systemPrompt?: string,
  globalSummary?: string
): boolean => {
  initializeBaseHistory(systemPrompt, globalSummary);
  appMessages.forEach(msg => {
    conversationHistory.push({
      role: msg.sender === SenderType.USER ? 'user' : 'assistant',
      content: msg.text
    });
  });
  console.log("Conversation context set from app messages.");
  return true;
};


export const sendMessageStream = async (
  messageText: string,
  userId: string | null // Added userId parameter
): Promise<AsyncIterable<AdaptedStreamingChunk> | null> => {
  if (!userId) {
    console.error("[openAIService] sendMessageStream called without userId. Aborting.");
    async function* errorStream() {
      yield { text: "Authentication error: User ID missing." };
    }
    return errorStream();
  }

  conversationHistory.push({ role: 'user', content: messageText });

  try {
    const apiUrl = `${window.location.origin}/api/chat`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Pass userId in the body for the backend API
      body: JSON.stringify({ messages: conversationHistory, userId: userId }),
    });

    if (!response.ok) {
      let errorData;
      try { errorData = await response.json(); } catch (e) { /* Not JSON */ }
      const errorMessage = errorData?.error || `Error from server: ${response.status} ${response.statusText}`;
      console.error("Error response from /api/chat:", errorMessage);
      if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === 'user') {
        conversationHistory.pop();
      }
      async function* errorStream() { yield { text: errorMessage }; }
      return errorStream();
    }

    if (!response.body) throw new Error("Response body is null");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let currentAssistantResponse = "";

    async function* processStream(): AsyncIterable<AdaptedStreamingChunk> {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkText = decoder.decode(value, { stream: true });
          if (chunkText) {
            currentAssistantResponse += chunkText;
            yield { text: chunkText };
          }
        }
        if (currentAssistantResponse.trim()) {
          // Logic for adding assistant message to history
           const lastMessageInHistory = conversationHistory[conversationHistory.length -1];
            if (lastMessageInHistory.role === 'user') {
                 conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
            } else if (lastMessageInHistory.role === 'assistant' && lastMessageInHistory.content !== currentAssistantResponse) {
                conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
            }
        }
      } finally {
        const lastChunk = decoder.decode();
        if (lastChunk) {
          currentAssistantResponse += lastChunk;
          yield { text: lastChunk };
        }
         if (currentAssistantResponse.trim()) {
            const lastMessage = conversationHistory[conversationHistory.length -1];
            if(lastMessage && lastMessage.role === 'assistant') {
                if (lastMessage.content !== currentAssistantResponse) {
                    lastMessage.content = currentAssistantResponse;
                }
            } else if (lastMessage && lastMessage.role === 'user') {
                conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
            } else if (!lastMessage || (conversationHistory.length === 1 && conversationHistory[0].role === 'system')) {
                 conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
            }
        }
      }
    }
    return processStream();

  } catch (error: any) {
    console.error("Error sending message via /api/chat:", error);
    if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === 'user') {
      conversationHistory.pop();
    }
    async function* errorStream() { yield { text: `Client-side error: ${error.message}` }; }
    return errorStream();
  }
};

export const triggerMemoryUpdateForSession = async (userId: string, sessionId: string, messages: Message[]): Promise<void> => {
  if (!userId) {
    console.error("[openAIService] triggerMemoryUpdateForSession called without userId. Aborting.");
    return;
  }
  console.log(`[openAIService] Requesting memory update for session ${sessionId}, user ${userId}`);
  try {
    const response = await fetch(`${window.location.origin}/api/processSessionForMemory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Pass userId in the body for the backend API
      body: JSON.stringify({ userId: userId, sessionId, sessionMessages: messages }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error during memory update." }));
      console.error(`[openAIService] Error updating memory for session ${sessionId} (user ${userId}): ${response.status}`, errorData);
      throw new Error(errorData.error || `Memory update failed with status ${response.status}`);
    }
    console.log(`[openAIService] Memory update for session ${sessionId} (user ${userId}) successfully processed by backend.`);
  } catch (error) {
    console.error(`[openAIService] Client-side error triggering memory update for session ${sessionId} (user ${userId}):`, error);
  }
};


export const isChatAvailable = (): boolean => {
  return true;
};

initializeBaseHistory(DEFAULT_SYSTEM_PROMPT, "");
