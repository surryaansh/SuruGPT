import React from 'react';
import { Message, SenderType } from '../types';

interface ChatMessageProps {
  message: Message;
  isCurrentlyLoading?: boolean; // Prop to indicate if this specific AI message should show loading dots
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isCurrentlyLoading }) => {
  const isUser = message.sender === SenderType.USER;

  return (
    <div className={`flex mb-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] sm:max-w-[75%]`}>
        {/* Conditional rendering for AI loading state OR actual message text */}
        {(!isUser && isCurrentlyLoading) ? (
          <div className="py-1 px-0"> {/* Style for loading dots */}
            <p className="text-sm"> {/* Loading dots kept at text-sm for subtlety */}
              <span className="animate-pulse text-[#FF8DC7]">●</span>
              <span className="animate-pulse delay-150 text-[#FF8DC7] ml-0.5">●</span>
              <span className="animate-pulse delay-300 text-[#FF8DC7] ml-0.5">●</span>
            </p>
          </div>
        ) : (
          <div
            className={`${
              isUser
                ? 'bg-[#35323C] rounded-2xl py-2 px-3' // User message bubble style
                : 'py-1 px-0' // AI message style (transparent background)
            }`}
          >
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-[#EAE6F0]">
              {message.text}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
