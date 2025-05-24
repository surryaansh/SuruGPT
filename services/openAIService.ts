
import { Message, SenderType } from '../types';

export interface AdaptedStreamingChunk {
  text: string;
}

let conversationHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

const DEFAULT_SYSTEM_PROMPT = "You are SuruGPT, a helpful and friendly AI assistant. Keep your responses concise and delightful, like a sprinkle of magic! ✨";

const initializeBaseHistory = (systemPrompt?: string, globalSummary?: string): void => {
  let finalSystemContent = systemPrompt || DEFAULT_SYSTEM_PROMPT;
  if (globalSummary && globalSummary.trim().length > 0) {
    finalSystemContent += `\n\nFor your broader awareness, ${globalSummary}`;
  }
  conversationHistory = [{ role: 'system', content: finalSystemContent }];
  console.log("Local chat session initialized with system prompt and global summary (if provided).");
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
  initializeBaseHistory(systemPrompt, globalSummary); // This sets the system prompt including global summary
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
    if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length -1].role === 'user') {
        conversationHistory.pop();
    }
    async function* errorStream() {
      yield { text: `Client-side error: ${error.message}` };
    }
    return errorStream();
  }
};

export const isChatAvailable = (): boolean => {
  return true; 
};

// Initialize with default system prompt and no global summary initially.
// App.tsx will call resetAiContextWithSystemPrompt with an updated summary once sessions are loaded.
initializeBaseHistory(DEFAULT_SYSTEM_PROMPT, "");
