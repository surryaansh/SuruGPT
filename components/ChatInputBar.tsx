
import React, { useState } from 'react';
import { IconHeart, IconSend } from '../constants'; // IconPlus removed, IconHeart added

interface ChatInputBarProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  isChatAvailable: boolean;
}

const ChatInputBar: React.FC<ChatInputBarProps> = ({ onSendMessage, isLoading, isChatAvailable }) => {
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    if (inputValue.trim() && !isLoading && isChatAvailable) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = inputValue.trim() !== '' && !isLoading && isChatAvailable;

  return (
    <div className="bg-[#393641] p-3 sm:p-4 border-t border-[#5A5666] sticky bottom-0 z-10">
      <div className="flex items-center bg-[#4A4754] rounded-xl p-1.5 shadow-sm">
        <button 
          className="p-2 text-[#A09CB0] hover:text-[#FF8DC7] disabled:opacity-50" 
          disabled={isLoading || !isChatAvailable}
          aria-label="More options" // Changed aria-label
        >
          <IconHeart className="w-6 h-6" /> {/* Replaced IconPlus with IconHeart */}
        </button>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isChatAvailable ? "Chat with SuruGPT..." : "Chat unavailable (API key missing)"}
          className="flex-grow bg-transparent text-[#EAE6F0] placeholder-[#A09CB0] focus:outline-none px-3 py-2.5 text-base" // Changed text-sm sm:text-base to text-base
          disabled={isLoading || !isChatAvailable}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`p-2.5 rounded-lg transition-colors ${
            canSend ? 'bg-[#FF8DC7] hover:bg-opacity-80 text-white' : 'bg-transparent text-[#A09CB0]'
          }`}
          aria-label="Send message"
        >
          <IconSend className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ChatInputBar;