import React, { useRef, useEffect } from 'react';
import { Message, SenderType } from '../types';
import ChatMessage from './ChatMessage';

interface ChatMessageListProps {
  messages: Message[];
  isLoadingAiResponse: boolean;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages, isLoadingAiResponse }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingAiResponse]);

  return (
    <div className="flex-grow p-4 space-y-1 overflow-y-auto">
      {messages.map((msg, index) => {
        // Determine if this specific message should show the loading indicator
        const isLastMessage = index === messages.length - 1;
        const shouldShowLoadingIndicator =
          isLoadingAiResponse &&
          isLastMessage &&
          msg.sender === SenderType.AI &&
          msg.text === ''; // Only show dots if the AI message text is still empty

        return (
          <ChatMessage
            key={msg.id}
            message={msg}
            isCurrentlyLoading={shouldShowLoadingIndicator}
          />
        );
      })}
      {/* The old separate loading indicator block has been removed as it's now integrated into ChatMessage */}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessageList;