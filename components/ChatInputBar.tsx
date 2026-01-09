
import React, { useState, useRef, useEffect } from 'react';
import { IconHeart, IconSend } from '../constants'; 

interface ChatInputBarProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  isChatAvailable: boolean;
  isCentered?: boolean; // New prop
}

const ChatInputBar: React.FC<ChatInputBarProps> = ({ 
  onSendMessage, 
  isLoading, 
  isChatAvailable, 
  isCentered = false // Default to false
}) => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      // Ensure scrollHeight is calculated *after* value update
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
      });
    }
  }, [inputValue]);


  useEffect(() => {
    if (!isLoading && inputValue === '' && textareaRef.current && effectiveIsChatAvailable) {
      if (!isCentered || isCentered) { // Simplified condition, effectively always true if other conditions met
         textareaRef.current.focus();
      }
    }
  }, [isLoading, inputValue, effectiveIsChatAvailable, isCentered]);


  const canSend = inputValue.trim() !== '' && !isLoading && effectiveIsChatAvailable;

  const outerDivClasses = isCentered
    ? "w-full" 
    : "bg-[#2E2B36] py-3 sm:py-4 px-4 sm:px-6 md:px-10";

  return (
    <div className={outerDivClasses}>
      <div className="max-w-2xl mx-auto"> 
        <div className={`flex items-center bg-[#4A4754] shadow-sm
          rounded-${isCentered ? '3xl' : 'xl'}
          px-${isCentered ? '4' : '3'}
          py-${isCentered ? '4' : '2'}
        `}>
          <button 
            className="p-2 text-[#A09CB0] hover:text-[#FF8DC7] disabled:opacity-50 animate-subtleBounceOnHover flex-shrink-0"
            disabled={isLoading || !effectiveIsChatAvailable}
            aria-label="More options" 
          >
            <IconHeart className="w-6 h-6" /> 
          </button>
          <textarea
            ref={textareaRef}
            rows={1} // Changed: Always 1 row initially, min-height and padding control visual height
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            placeholder={effectiveIsChatAvailable ? "Chat with SuruGPT..." : "Chat unavailable (API key missing)"}
            className={`flex-grow bg-transparent text-[#EAE6F0] placeholder-[#A09CB0] focus:outline-none text-[16px] resize-none overflow-y-auto 
              mx-3 
              leading-6
              max-h-${isCentered ? '32' : '32'} 
              py-${isCentered ? '[0.75rem]' : '0'} 
              min-h-[${isCentered ? '3rem' : '1.5rem'}]`}
            disabled={isLoading || !effectiveIsChatAvailable}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`p-2.5 rounded-lg transition-colors flex-shrink-0 ${ 
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
