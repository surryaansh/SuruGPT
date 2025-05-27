
import React, { useState, useRef, useEffect } from 'react';
import { IconHeart, IconSend } from '../constants'; 

interface ChatInputBarProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  isChatAvailable: boolean;
}

const ChatInputBar: React.FC<ChatInputBarProps> = ({ onSendMessage, isLoading, isChatAvailable }) => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Stricter check for chat availability
  const effectiveIsChatAvailable = isChatAvailable === true;

  const handleSend = () => {
    if (inputValue.trim() && !isLoading && effectiveIsChatAvailable) {
      onSendMessage(inputValue.trim());
      setInputValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'; // Reset height
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto'; 
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  // Effect to refocus textarea after AI response if input is clear
  useEffect(() => {
    if (!isLoading && inputValue === '' && textareaRef.current && effectiveIsChatAvailable) {
      textareaRef.current.focus();
    }
  }, [isLoading, inputValue, effectiveIsChatAvailable]);


  const canSend = inputValue.trim() !== '' && !isLoading && effectiveIsChatAvailable;

  return (
    <div className="bg-[#393641] py-3 sm:py-4 px-10 border-t border-[#5A5666] sticky bottom-0 z-10">
      <div className="max-w-2xl mx-auto"> 
        <div className="flex items-center bg-[#4A4754] rounded-xl p-1.5 shadow-sm">
          <button 
            className="p-2 text-[#A09CB0] hover:text-[#FF8DC7] disabled:opacity-50 animate-subtleBounceOnHover"
            disabled={isLoading || !effectiveIsChatAvailable}
            aria-label="More options" 
          >
            <IconHeart className="w-6 h-6" /> 
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            placeholder={effectiveIsChatAvailable ? "Chat with SuruGPT..." : "Chat unavailable (API key missing)"}
            className="flex-grow bg-transparent text-[#EAE6F0] placeholder-[#A09CB0] focus:outline-none px-3 py-2.5 text-[16px] resize-none overflow-y-auto max-h-32"
            disabled={isLoading || !effectiveIsChatAvailable}
            style={{ minHeight: '2.75rem' }}
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
    </div>
  );
};

export default ChatInputBar;
