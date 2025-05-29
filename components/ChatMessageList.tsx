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
  const scrollContainerRef = useRef<HTMLDivElement>(null); // Ref for the scrollable container

  // Effect to scroll a specific user message to the top
  useEffect(() => {
    if (scrollToMessageId) {
      const messageExistsInData = messages.some(m => m.id === scrollToMessageId);
      if (messageExistsInData) {
        const element = document.getElementById(scrollToMessageId);
        const container = scrollContainerRef.current;

        if (element && container) {
          console.log(`[ChatMessageList] Attempting to scroll message ${scrollToMessageId} to top using scrollTop.`);
          const timer = setTimeout(() => {
            // Calculate the scroll position: element.offsetTop is relative to its offsetParent.
            // The offsetParent is the <div className="max-w-2xl mx-auto ..."> which is the direct child of the scroll container content area (after pt-11).
            // So, element.offsetTop is the desired scrollTop value for the container.
            container.scrollTo({ top: element.offsetTop, behavior: 'smooth' });
            onScrollToMessageComplete(); // Reset the trigger
            console.log(`[ChatMessageList] Scroll initiated for ${scrollToMessageId}, onScrollToMessageComplete called.`);
          }, 50); // Small delay for DOM readiness
          return () => clearTimeout(timer);
        } else {
          if (!element) console.warn(`[ChatMessageList] Element ${scrollToMessageId} not found for scrolling to top.`);
          if (!container) console.warn(`[ChatMessageList] Scroll container ref not found for scrolling ${scrollToMessageId}.`);
          // Call complete anyway to avoid getting stuck if element never found
          const errorClearTimer = setTimeout(onScrollToMessageComplete, 100);
          return () => clearTimeout(errorClearTimer);
        }
      }
      // If message doesn't exist in data yet, effect will re-run when `messages` updates.
    }
  }, [scrollToMessageId, messages, onScrollToMessageComplete]);

  // Effect to scroll to the bottom when a chat is loaded (signaled by chatLoadScrollKey)
  useEffect(() => {
    if (chatLoadScrollKey && messages.length > 0) { 
      console.log(`[ChatMessageList] Chat loaded (key: ${chatLoadScrollKey}), attempting to scroll to bottom.`);
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); 
        console.log(`[ChatMessageList] Scrolled to bottom for key: ${chatLoadScrollKey}.`);
      }, 50); // Small delay to ensure DOM is fully rendered
      return () => clearTimeout(timer);
    }
  }, [chatLoadScrollKey, messages]); // Depend on `messages` to ensure it re-evaluates if messages load slightly after key change

  return (
    <div 
      ref={scrollContainerRef} // Assign ref to the scrollable container
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
