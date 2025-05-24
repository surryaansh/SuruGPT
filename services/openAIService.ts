// No longer importing OpenAI client-side
// import OpenAI from 'openai'; 

// Interface for the chunks we'll yield from the stream, consistent with App.tsx needs
export interface AdaptedStreamingChunk {
  text: string;
}

// Conversation history will be managed locally on the client
let conversationHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

const DEFAULT_SYSTEM_PROMPT = "You are SuruGPT, a helpful and friendly AI assistant. Keep your responses concise and delightful, like a sprinkle of magic! ✨";

// Initializes or resets the local conversation history with a system prompt.
export const initChatSession = (systemPrompt?: string): boolean => {
  conversationHistory = [{ role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT }];
  console.log("Local chat session initialized (history cleared with system prompt).");
  return true;
};

// Alias for initChatSession, as starting a new chat means resetting local history.
export const startNewOpenAIChatSession = (systemPrompt?: string): boolean => {
  return initChatSession(systemPrompt);
};

export const sendMessageStream = async (
  messageText: string
): Promise<AsyncIterable<AdaptedStreamingChunk> | null> => {
  // Add user's message to local history
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
      // Attempt to read error message from backend if available
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
        if (currentAssistantResponse.trim()) {
          conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
        } else {
          // If the stream was empty but successful, we might not add an empty assistant message,
          // or add a specific placeholder if needed. For now, only add if there's content.
          console.log("Stream ended without new content from AI.");
          // Optionally yield a message if nothing came
          // yield { text: "No response from AI."} 
        }
      } finally {
        // Ensure the final part of a chunk is decoded if the stream ended mid-character
        const lastChunk = decoder.decode(); // Get any remaining text
        if (lastChunk) {
            currentAssistantResponse += lastChunk;
            yield { text: lastChunk };
            // Update history with the very last bit if it completes the message
            const existingAssistantMsgIndex = conversationHistory.findIndex(msg => msg.role === 'assistant' && msg.content === currentAssistantResponse.slice(0, -lastChunk.length));
            if (existingAssistantMsgIndex > -1) {
                conversationHistory[existingAssistantMsgIndex].content = currentAssistantResponse;
            } else if (!conversationHistory.find(msg => msg.role === 'assistant' && msg.content === currentAssistantResponse) && currentAssistantResponse.trim()) {
                 // Avoid duplicates if already added
                 // conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
            }
        }
         if (currentAssistantResponse.trim() && !conversationHistory.find(msg => msg.role === 'assistant' && msg.content === currentAssistantResponse) ) {
           const lastMessage = conversationHistory[conversationHistory.length -1];
           if(lastMessage.role === 'assistant') { // if last message is already assistant, update it
            lastMessage.content = currentAssistantResponse;
           } else {
            conversationHistory.push({ role: 'assistant', content: currentAssistantResponse });
           }
        }
      }
    }
    return processStream();

  } catch (error: any) {
    console.error("Error sending message via /api/chat:", error);
    // Remove the last user message if API call failed
     if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length -1].role === 'user') {
        conversationHistory.pop();
    }
    async function* errorStream() {
      yield { text: `Client-side error: ${error.message}` };
    }
    return errorStream();
  }
};

// Chat is "available" if the backend route /api/chat is assumed to be up.
// The actual check for API key validity is now on the server.
export const isChatAvailable = (): boolean => {
  return true; 
};

// Initialize local chat history with default system prompt when service loads
initChatSession(DEFAULT_SYSTEM_PROMPT);