
import React, { useRef, useEffect } from 'react';
import { Message, SenderType } from '../types';
import ChatMessage from './ChatMessage';

interface ChatMessageListProps {
  messages: Message[];
  isLoadingAiResponse: boolean;
  onCopyText: (text: string, buttonId: string) => void;
  onRateResponse: (messageId:string, rating: 'good' | 'bad') => void;
  onRetryResponse: (aiMessageId: string, userPromptText: string) => void;
  onSaveEdit: (messageId: string, newText: string) => void;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ 
  messages, 
  isLoadingAiResponse,
  onCopyText,
  onRateResponse,
  onRetryResponse,
  onSaveEdit
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
          const isLastMessage = index === messages.length - 1;
          const isStreamingAiText =
            isLoadingAiResponse &&
            isLastMessage &&
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
