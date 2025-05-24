
// Interface for the chunks we'll yield from the stream, consistent with App.tsx needs
import { Message, SenderType } from '../types'; // Import Message and SenderType

export interface AdaptedStreamingChunk {
  text: string;
}

// Conversation history will be managed locally on the client
let conversationHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

const DEFAULT_SYSTEM_PROMPT = "You are SuruGPT, a helpful and friendly AI assistant. Keep your responses concise and delightful, like a sprinkle of magic! ✨";

// Initializes or resets the local conversation history with only a system prompt.
const initializeBaseHistory = (systemPrompt?: string): void => {
  conversationHistory = [{ role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT }];
  console.log("Local chat session initialized (history cleared with system prompt).");
};

// Public function to start a new chat session (resets history)
export const startNewOpenAIChatSession = (systemPrompt?: string): boolean => {
  initializeBaseHistory(systemPrompt);
  return true;
};

// New function to set the conversation context from an array of app messages
export const setConversationContextFromAppMessages = (appMessages: Message[], systemPrompt?: string): boolean => {
  conversationHistory = [{ role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT }];
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
  messageText: string // This is the new user message text
): Promise<AsyncIterable<AdaptedStreamingChunk> | null> => {
  // Add current user's message to local history right before sending
  // This assumes the history up to this point (including system prompt and previous messages)
  // has already been set by startNewOpenAIChatSession or setConversationContextFromAppMessages
  conversationHistory.push({ role: 'user', content: messageText });

  try {
    const apiUrl = `${window.location.origin}/api/chat`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Send the entire current conversationHistory
      body: JSON.stringify({ messages: conversationHistory }),
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        // Not a JSON error, or failed to parse
      }
      const errorMessage = errorData?.error || `Error from server: ${response.status} ${response.statusText}`;
      console.error("Error response from /api/chat:", errorMessage);
      // Remove the last user message if backend call failed, to allow retry without duplicate
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
        
        // After the stream is finished, add the AI's full response to the local history
        // This ensures the history is complete for the next turn.
        if (currentAssistantResponse.trim()) {
            const lastMessageInHistory = conversationHistory[conversationHistory.length -1];
            // If the last message was the user's message we just added, append the assistant's response.
            // Otherwise, if an assistant message was somehow already there (e.g. error in stream handling),
            // this logic might need adjustment, but usually it's user -> assistant.
            if (lastMessageInHistory.role === 'user') {
                 conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
            } else if (lastMessageInHistory.role === 'assistant') {
                // This case might happen if there was partial stream and then completion.
                // For simplicity, let's assume full replacement or ensure it's a new message.
                // Given the stream completes fully, we are adding the complete response.
                // To avoid duplicate assistant messages if stream yields multiple 'done' states (unlikely with fetch),
                // we'd check if the last message is already this full response.
                // For now, just push, assuming clean stream completion.
                if(lastMessageInHistory.content !== currentAssistantResponse) { // Avoid exact duplicates
                    conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
                }
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
        // Ensure the complete assistant message is in history if it wasn't empty
        if (currentAssistantResponse.trim()) {
            const lastMessage = conversationHistory[conversationHistory.length -1];
            if(lastMessage && lastMessage.role === 'assistant') { 
                if (lastMessage.content !== currentAssistantResponse) { // If it's different, update or add
                    // This logic can get complex if we need to merge. For now, if it exists and is different,
                    // let's assume it's a new turn or a corrected final version.
                    // A robust solution might be to find an assistant message with a temporary ID and update it.
                    // Simpler: if last is assistant, update its content. Otherwise push.
                    lastMessage.content = currentAssistantResponse; // Update content if already an assistant message
                }
            } else if (lastMessage && lastMessage.role === 'user') { // If last was user, this is the AI response
                conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
            } else if (!lastMessage) { // History was empty (only system prompt)
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

// Initialize local chat history with default system prompt when service loads
initializeBaseHistory(DEFAULT_SYSTEM_PROMPT);
