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
    <div className="flex-grow px-10 py-4 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-1">
        {messages.map((msg, index) => {
          const isLastMessage = index === messages.length - 1;
          // AI is considered streaming for the last message if it's an AI message and global loading is true
          const isStreamingAiText =
            isLoadingAiResponse &&
            isLastMessage &&
            msg.sender === SenderType.AI;

          return (
            <ChatMessage
              key={msg.id}
              message={msg}
              isStreamingAiText={isStreamingAiText}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatMessageList;
