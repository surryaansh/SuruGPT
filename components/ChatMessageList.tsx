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
    <div className="flex-grow px-10 py-4 overflow-y-auto"> {/* Outer container: keeps horizontal padding, vertical padding, flex-grow, and overflow */}
      <div className="max-w-2xl mx-auto space-y-1"> {/* New inner container: centered, max-width, handles message spacing */}
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
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatMessageList;
