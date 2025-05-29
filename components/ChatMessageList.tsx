import React, { useRef, useEffect } from 'react';
import { Message, SenderType } from '../types';
import ChatMessage from './ChatMessage';

interface ChatMessageListProps {
  messages: Message[];
  isLoadingAiResponse: boolean;
  onCopyText: (text: string) => void; 
  onRateResponse: (messageId:string, rating: 'good' | 'bad') => void;
  onRetryResponse: (aiMessageId: string, userPromptText: string) => void;
  onSaveEdit: (messageId: string, newText: string) => void;
  scrollToMessageId: string | null; // For scrolling a specific user message to top
  onScrollToMessageComplete: () => void; // Callback after scroll-to-top is done
  chatLoadScrollKey: number | null; // For scrolling to bottom on chat load
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ 
  messages, 
  isLoadingAiResponse,
  onCopyText,
  onRateResponse,
  onRetryResponse,
  onSaveEdit,
  scrollToMessageId,
  onScrollToMessageComplete,
  chatLoadScrollKey
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Effect to scroll a specific user message to the top
  useEffect(() => {
    if (scrollToMessageId) {
      const element = document.getElementById(scrollToMessageId);
      if (element) {
        // console.log(`[ChatMessageList] Scrolling to message ID: ${scrollToMessageId}`);
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        // console.warn(`[ChatMessageList] Element with ID ${scrollToMessageId} not found for scrolling.`);
      }
      // Always call complete to reset the state in App.tsx, even if element not found, to prevent getting stuck
      onScrollToMessageComplete(); 
    }
  }, [scrollToMessageId, onScrollToMessageComplete, messages]); // Added messages to re-evaluate if element appears later

  // Effect to scroll to the bottom when a chat is loaded (signaled by chatLoadScrollKey)
  useEffect(() => {
    if (chatLoadScrollKey && messages.length > 0) { // Ensure key changed and there are messages
      // console.log(`[ChatMessageList] Chat loaded (key: ${chatLoadScrollKey}), scrolling to bottom.`);
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); // 'auto' for instant scroll
    }
  }, [chatLoadScrollKey, messages.length]); // Depend on key and messages.length

  return (
    <div 
      className="flex-grow px-6 py-11 overflow-y-auto chat-message-list-scroll-container"
      tabIndex={-1} // Allows focus for programmatic scrolling if needed, but main scrolling is via JS
    >
      <div className="max-w-2xl mx-auto space-y-9">
        {messages.map((msg, index) => {
          const isOverallLatestMessage = index === messages.length - 1;
          const isStreamingAiText =
            isLoadingAiResponse &&
            isOverallLatestMessage &&
            msg.sender === SenderType.AI;

          let previousUserMessageText: string | undefined = undefined;
          if (msg.sender === SenderType.AI && index > 0 && messages[index - 1]?.sender === SenderType.USER) {
            previousUserMessageText = messages[index - 1].text;
          }

          return (
            <ChatMessage
              key={msg.id} // Ensure key is on the ChatMessage itself
              message={msg}
              isStreamingAiText={isStreamingAiText}
              isOverallLatestMessage={isOverallLatestMessage}
              onCopyText={onCopyText}
              onRateResponse={onRateResponse}
              onRetryResponse={onRetryResponse}
              onSaveEdit={onSaveEdit}
              previousUserMessageText={previousUserMessageText}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatMessageList;
