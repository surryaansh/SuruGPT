
import React, { useState, useRef, useEffect } from 'react';
import { IconHeart, IconSend } from '../constants'; 

interface ChatInputBarProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  isChatAvailable: boolean;
}

const ChatInputBar: React.FC<ChatInputBarProps> = ({ onSendMessage, isLoading, isChatAvailable }) => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null); // Changed from inputRef

  const handleSend = () => {
    if (inputValue.trim() && !isLoading && isChatAvailable) {
      onSendMessage(inputValue.trim());
      setInputValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'; // Reset height
        textareaRef.current.focus(); 
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // Auto-resize logic
    e.target.style.height = 'auto'; 
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { // Changed from HTMLInputElement
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  // Effect to resize initially if there's pre-filled text (e.g. from browser autocomplete)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);


  const canSend = inputValue.trim() !== '' && !isLoading && isChatAvailable;

  return (
    <div className="bg-[#393641] py-3 sm:py-4 px-10 border-t border-[#5A5666] sticky bottom-0 z-10">
      <div className="max-w-2xl mx-auto"> 
        <div className="flex items-center bg-[#4A4754] rounded-xl p-1.5 shadow-sm"> {/* Changed items-start to items-center */}
          <button 
            className="p-2 text-[#A09CB0] hover:text-[#FF8DC7] disabled:opacity-50 animate-subtleBounceOnHover"
            disabled={isLoading || !isChatAvailable}
            aria-label="More options" 
          >
            <IconHeart className="w-6 h-6" /> 
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress} // Changed from onKeyPress to onKeyDown for consistency
            placeholder={isChatAvailable ? "Chat with SuruGPT..." : "Chat unavailable (API key missing)"}
            className="flex-grow bg-transparent text-[#EAE6F0] placeholder-[#A09CB0] focus:outline-none px-3 py-2.5 text-[16px] resize-none overflow-y-auto max-h-32" // max-h-32 for ~5 lines
            disabled={isLoading || !isChatAvailable}
            style={{ minHeight: '2.75rem' }} // Ensures it starts at a decent height matching py-2.5
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
