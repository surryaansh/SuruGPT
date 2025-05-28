
import { Message, SenderType } from '../types';

export interface AdaptedStreamingChunk {
  text: string;
}

let conversationHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

const DEFAULT_SYSTEM_PROMPT = "You are SuruGPT, a helpful and friendly AI assistant. Keep your responses concise and delightful, like a sprinkle of magic! ✨";

// Removed persistentMemoryString from parameters
const initializeBaseHistory = (systemPrompt?: string, globalSummary?: string): void => {
  let finalSystemContent = systemPrompt || DEFAULT_SYSTEM_PROMPT;
  if (globalSummary && globalSummary.trim().length > 0) {
    finalSystemContent += `\n\nFor your broader awareness, ${globalSummary}`;
  }
  // Logic for persistentMemoryString is removed.
  conversationHistory = [{ role: 'system', content: finalSystemContent }];
  console.log("Local chat session initialized. System Prompt (without direct persistent memory injection):", finalSystemContent);
};

// Removed persistentMemoryString from parameters
export const startNewOpenAIChatSession = (systemPrompt?: string, globalSummary?: string): boolean => {
  initializeBaseHistory(systemPrompt, globalSummary);
  return true;
};

export const setConversationContextFromAppMessages = (
  appMessages: Message[], 
  systemPrompt?: string, 
  globalSummary?: string
): boolean => {
  // No NEW persistent memory injection for loading old chats
  initializeBaseHistory(systemPrompt, globalSummary); 
  appMessages.forEach(msg => {
    conversationHistory.push({
      role: msg.sender === SenderType.USER ? 'user' : 'assistant',
      content: msg.text
    });
  });
  console.log("Conversation context set from app messages, incorporating global summary.");
  return true;
};


export const sendMessageStream = async (
  messageText: string
): Promise<AsyncIterable<AdaptedStreamingChunk> | null> => {
  conversationHistory.push({ role: 'user', content: messageText });

  try {
    const apiUrl = `${window.location.origin}/api/chat`;
    // The backend /api/chat will now handle fetching and injecting relevant semantic memory
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: conversationHistory }), 
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        // Not a JSON error
      }
      const errorMessage = errorData?.error || `Error from server: ${response.status} ${response.statusText}`;
      console.error("Error response from /api/chat:", errorMessage);
      if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length -1].role === 'user') {
          conversationHistory.pop();
      }
      async function* errorStream() {
        yield { text: errorMessage };
      }
      return errorStream();
    }

    if (!response.body) {
        throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let currentAssistantResponse = "";

    async function* processStream(): AsyncIterable<AdaptedStreamingChunk> {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const chunkText = decoder.decode(value, { stream: true });
          if (chunkText) {
            currentAssistantResponse += chunkText;
            yield { text: chunkText };
          }
        }
        
        if (currentAssistantResponse.trim()) {
            const lastMessageInHistory = conversationHistory[conversationHistory.length -1];
            if (lastMessageInHistory.role === 'user') {
                 conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
            } else if (lastMessageInHistory.role === 'assistant' && lastMessageInHistory.content !== currentAssistantResponse) {
                // This case might indicate an issue if AI responds multiple times without user input,
                // or if client retries add assistant message to history.
                // For now, let's assume it's a new segment of the assistant's response.
                conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
            }
        } else {
          console.log("Stream ended without new content from AI.");
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
                // If the last message is already assistant, update it if different (e.g. from final decode).
                // This ensures the very last piece of text is captured.
                if (lastMessage.content !== currentAssistantResponse) {
                    lastMessage.content = currentAssistantResponse; 
                }
            } else if (lastMessage && lastMessage.role === 'user') {
                // If last message was user, this is a new assistant response.
                conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
            } else if (!lastMessage || (conversationHistory.length === 1 && conversationHistory[0].role === 'system')) { 
                 // If history is empty or only system prompt, this is the first assistant response.
                 conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
            }
        }
      }
    }
    return processStream();

  } catch (error: any) {
    console.error("Error sending message via /api/chat:", error);
    if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length -1].role === 'user') {
        conversationHistory.pop();
    }
    async function* errorStream() {
      yield { text: `Client-side error: ${error.message}` };
    }
    return errorStream();
  }
};

export const triggerMemoryUpdateForSession = async (sessionId: string, messages: Message[]): Promise<void> => {
  console.log(`[openAIService] Requesting memory update for session ${sessionId}`);
  try {
    const response = await fetch(`${window.location.origin}/api/processSessionForMemory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, sessionMessages: messages }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error during memory update." }));
      console.error(`[openAIService] Error updating memory for session ${sessionId}: ${response.status}`, errorData);
      throw new Error(errorData.error || `Memory update failed with status ${response.status}`);
    }
    console.log(`[openAIService] Memory update for session ${sessionId} successfully processed by backend.`);
  } catch (error) {
    console.error(`[openAIService] Client-side error triggering memory update for session ${sessionId}:`, error);
  }
};


export const isChatAvailable = (): boolean => {
  return true; 
};

// Initialize with no persistent memory string from here.
initializeBaseHistory(DEFAULT_SYSTEM_PROMPT, "");
