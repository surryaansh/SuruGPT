import React, { useState, useEffect, useRef } from 'react';
import { Message, SenderType } from '../types';

interface ChatMessageProps {
  message: Message;
  isStreamingAiText?: boolean; // True if AI is actively streaming for this message
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isStreamingAiText }) => {
  const isUser = message.sender === SenderType.USER;
  const [displayedText, setDisplayedText] = useState(isUser ? message.text : '');
  const [showTypingCursor, setShowTypingCursor] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingSpeed = 35; // Milliseconds per character - slower for sophistication

  useEffect(() => {
    if (isUser) {
      setDisplayedText(message.text); // Ensure user messages display immediately
      setShowTypingCursor(false);
      return;
    }

    // AI Message Typing Animation
    if (isStreamingAiText && message.text) {
      // If the incoming message.text is different from what's fully typed, restart/continue typing
      if (displayedText !== message.text) {
        
        const startTypingFromIndex = displayedText.length;
        let currentTypedLength = displayedText.length;

        // If message.text is shorter than displayedText, it implies a new stream/message, reset.
        if (message.text.length < displayedText.length || !message.text.startsWith(displayedText)) {
             setDisplayedText('');
             currentTypedLength = 0;
        }

        const type = () => {
          if (currentTypedLength < message.text.length) {
            setDisplayedText(message.text.substring(0, currentTypedLength + 1));
            currentTypedLength++;
            setShowTypingCursor(true);
            typingTimeoutRef.current = setTimeout(type, typingSpeed);
          } else {
            setShowTypingCursor(false); // Typing complete for this stream segment
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          }
        };
        
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(type, 0); // Start typing current segment
      }
    } else if (!isStreamingAiText && message.text) {
      // If streaming stops, ensure full text is displayed and no cursor
      setDisplayedText(message.text);
      setShowTypingCursor(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    } else if (isStreamingAiText && !message.text) {
        // AI is preparing but no text yet, clear display
        setDisplayedText('');
        setShowTypingCursor(false); // No cursor if no text to type yet
    }


    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [message.text, message.sender, isStreamingAiText, isUser]); // Removed displayedText from deps

  const showInitialLoadingDots = message.sender === SenderType.AI && isStreamingAiText && !message.text && !displayedText;

  return (
    <div className={`flex mb-3 animate-fadeInSlideUp ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] sm:max-w-[75%]`}>
        {showInitialLoadingDots ? (
          <div className="py-1 px-0">
            <p className="text-sm">
              <span className="animate-pulse text-[#FF8DC7]">●</span>
              <span className="animate-pulse delay-150 text-[#FF8DC7] ml-0.5">●</span>
              <span className="animate-pulse delay-300 text-[#FF8DC7] ml-0.5">●</span>
            </p>
          </div>
        ) : (
          <div
            className={`${
              isUser
                ? 'bg-[#35323C] rounded-2xl py-2 px-3'
                : 'py-1 px-0' 
            }`}
          >
            <p className="text-lg leading-relaxed whitespace-pre-wrap text-[#EAE6F0]">
              {displayedText}
              {showTypingCursor && <span className="blinking-cursor" aria-hidden="true"></span>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
