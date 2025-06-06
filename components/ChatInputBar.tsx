
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
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  useEffect(() => {
    if (!isLoading && inputValue === '' && textareaRef.current && effectiveIsChatAvailable) {
      // Only focus if not centered, or if centered and explicitly allowed (for now, always focus if available)
      if (!isCentered || (isCentered /* && some_other_condition_if_needed */)) {
         textareaRef.current.focus();
      }
    }
  }, [isLoading, inputValue, effectiveIsChatAvailable, isCentered]);


  const canSend = inputValue.trim() !== '' && !isLoading && effectiveIsChatAvailable;

  const outerDivClasses = isCentered
    ? "w-full" // Container for max-w-2xl child, allows App.tsx to center it
    : "bg-[#2E2B36] py-3 sm:py-4 px-4 sm:px-6 md:px-10"; // Styles for the bottom bar

  return (
    <div className={outerDivClasses}>
      <div className="max-w-2xl mx-auto"> 
        <div className={`flex items-center bg-[#4A4754] shadow-sm
          rounded-${isCentered ? '3xl' : 'xl'}
          px-${isCentered ? '4' : '1.5'}
          py-${isCentered ? '6' : '1.5'}
        `}>
          <button 
            className="p-2 text-[#A09CB0] hover:text-[#FF8DC7] disabled:opacity-50 animate-subtleBounceOnHover"
            disabled={isLoading || !effectiveIsChatAvailable}
            aria-label="More options" 
          >
            <IconHeart className="w-6 h-6" /> 
          </button>
          <textarea
            ref={textareaRef}
            rows={isCentered ? 3 : 1}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            placeholder={effectiveIsChatAvailable ? "Chat with SuruGPT..." : "Chat unavailable (API key missing)"}
            className={`flex-grow bg-transparent text-[#EAE6F0] placeholder-[#A09CB0] focus:outline-none px-3 py-2.5 text-[16px] resize-none overflow-y-auto 
              max-h-${isCentered ? '40' : '32'}`} // max-h-40 (10rem), max-h-32 (8rem)
            disabled={isLoading || !effectiveIsChatAvailable}
            style={{ minHeight: isCentered ? '4.5rem' : '2.75rem' }} // approx 3 lines vs 1 line base
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
