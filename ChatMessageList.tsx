
import React, { useRef, useEffect } from 'react';
import { Message, SenderType } from '../types';
import ChatMessage from './ChatMessage';

interface ChatMessageListProps {
  messages: Message[];
  isLoadingAiResponse: boolean; // Global loading flag
  onCopyText: (text: string) => void;
  onRateResponse: (messageId:string, rating: 'good' | 'bad') => void;
  onRetryResponse: (aiMessageId: string, userPromptText: string) => void;
  onSaveEdit: (messageId: string, newText: string) => void;
  onNavigateAiResponse: (messageId: string, direction: 'prev' | 'next') => void;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ 
  messages, 
  isLoadingAiResponse, 
  onCopyText,
  onRateResponse,
  onRetryResponse,
  onSaveEdit,
  onNavigateAiResponse,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isLoadingAiResponse]);

  return (
    <div 
      className="flex-grow px-6 py-11 overflow-y-auto chat-message-list-scroll-container"
      tabIndex={-1}
    >
      <div className="max-w-2xl mx-auto space-y-9">
        {messages.map((msg, index) => {
          const isOverallLatestMessage = index === messages.length - 1;
          // msg.isStreamingThisResponse (part of the Message object) now dictates streaming state for that specific message/response variant.
          // The global isLoadingAiResponse is still useful for disabling the main chat input bar.

          return (
            <ChatMessage
              key={msg.id}
              message={msg}
              isOverallLatestMessage={isOverallLatestMessage} 
              onCopyText={onCopyText}
              onRateResponse={onRateResponse}
              onRetryResponse={onRetryResponse}
              onSaveEdit={onSaveEdit}
              onNavigateAiResponse={onNavigateAiResponse}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatMessageList;
