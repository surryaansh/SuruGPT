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
    if (scrollToMessageId && messages.find(m => m.id === scrollToMessageId)) { // Ensure message exists in current list
      const element = document.getElementById(scrollToMessageId);
      if (element) {
        console.log(`[ChatMessageList] Scrolling to user message ID: ${scrollToMessageId}`);
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        console.warn(`[ChatMessageList] User message Element with ID ${scrollToMessageId} not found for scrolling, though present in messages prop.`);
      }
      // Always call complete to reset the state in App.tsx,
      // to prevent getting stuck if element is somehow not found despite being in messages.
      onScrollToMessageComplete(); 
    } else if (scrollToMessageId) {
      // This case means scrollToMessageId is set, but the message isn't in the list yet.
      // The effect will re-run when 'messages' updates.
      // console.log(`[ChatMessageList] scrollToMessageId ${scrollToMessageId} is set, but message not yet in 'messages' prop. Waiting for messages update.`);
    }
  }, [scrollToMessageId, onScrollToMessageComplete, messages]); // Added messages back to dependency array

  // Effect to scroll to the bottom when a chat is loaded (signaled by chatLoadScrollKey)
  useEffect(() => {
    if (chatLoadScrollKey && messages.length > 0) { 
      console.log(`[ChatMessageList] Chat loaded (key: ${chatLoadScrollKey}), scrolling to bottom.`);
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); 
    }
  }, [chatLoadScrollKey, messages.length]); 

  return (
    <div 
      className="flex-grow px-6 pt-11 overflow-y-auto chat-message-list-scroll-container" 
      tabIndex={-1} 
    >
      <div className="max-w-2xl mx-auto space-y-9 pb-11"> 
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
              key={msg.id} 
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
      </div>
      <div ref={messagesEndRef} style={{ height: '1px' }} /> 
    </div>
  );
};

export default ChatMessageList;
