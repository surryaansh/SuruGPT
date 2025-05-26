
import React, { useState, useEffect, useRef } from 'react';
import { Message, SenderType } from '../types';
import { IconClipboardDocumentList, IconPencil, IconThumbUp, IconThumbDown, IconArrowPath } from '../constants';

interface ChatMessageProps {
  message: Message;
  isStreamingAiText?: boolean;
  isOverallLatestMessage: boolean; // New prop
  onCopyText: (text: string, buttonId: string) => void;
  onRateResponse: (messageId: string, rating: 'good' | 'bad')
    => void;
  onRetryResponse: (aiMessageId: string, userPromptText: string) => void;
  onSaveEdit: (messageId: string, newText: string) => void;
  previousUserMessageText?: string; // For AI retry
}

const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  isStreamingAiText,
  isOverallLatestMessage, // New prop
  onCopyText,
  onRateResponse,
  onRetryResponse,
  onSaveEdit,
  previousUserMessageText
}) => {
  const isUser = message.sender === SenderType.USER;
  const [displayedText, setDisplayedText] = useState(isUser ? message.text : '');
  const [showTypingCursor, setShowTypingCursor] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingSpeed = 35;

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const [showCopiedFeedbackFor, setShowCopiedFeedbackFor] = useState<string | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);

  const [actionButtonsReady, setActionButtonsReady] = useState(isUser); // User buttons ready immediately
  const actionButtonReadyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (isUser) {
      setActionButtonsReady(true); // User buttons are always ready
      return;
    }
    // For AI messages, set ready after a delay once streaming is done and text is present
    if (!isUser && !isStreamingAiText && message.text && message.text.trim() !== '') {
      if (actionButtonReadyTimeoutRef.current) clearTimeout(actionButtonReadyTimeoutRef.current);
      actionButtonReadyTimeoutRef.current = window.setTimeout(() => {
        setActionButtonsReady(true);
      }, 150); // Short delay for smoother appearance
    } else if (isStreamingAiText || !message.text || message.text.trim() === '') {
      // If AI starts streaming or message is empty, reset readiness
      setActionButtonsReady(false); 
    }
    return () => {
      if (actionButtonReadyTimeoutRef.current) clearTimeout(actionButtonReadyTimeoutRef.current);
    };
  }, [isUser, isStreamingAiText, message.text]);


  useEffect(() => {
    if (isUser) {
      setDisplayedText(message.text);
      setShowTypingCursor(false);
      if (isEditing) setEditText(message.text); 
      return;
    }

    if (isStreamingAiText && message.text) {
      if (displayedText !== message.text) {
        // const startTypingFromIndex = displayedText.length; // Not directly used
        let currentTypedLength = displayedText.length;
        if (message.text.length < displayedText.length || !message.text.startsWith(displayedText)) {
             setDisplayedText('');
             currentTypedLength = 0;
        }
        const type = () => {
          if (currentTypedLength < message.text.length) {
            setDisplayedText(message.text.substring(0, currentTypedLength + 1));
            currentTypedLength++;
            setShowTypingCursor(true);
            typingTimeoutRef.current = window.setTimeout(type, typingSpeed);
          } else {
            setShowTypingCursor(false);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            // Action buttons readiness is handled by the other useEffect
          }
        };
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = window.setTimeout(type, 0);
      }
    } else if (!isStreamingAiText && message.text) {
      setDisplayedText(message.text);
      setShowTypingCursor(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    } else if (isStreamingAiText && !message.text) {
        setDisplayedText('');
        setShowTypingCursor(false);
    }

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [message.text, message.sender, isStreamingAiText, isUser, displayedText]);

  const showInitialLoadingDots = message.sender === SenderType.AI && isStreamingAiText && !message.text && !displayedText;

  const handleCopy = (buttonIdSuffix: string) => {
    const textToCopy = isEditing ? editText : message.text;
    onCopyText(textToCopy, `${message.id}-${buttonIdSuffix}`);
    setShowCopiedFeedbackFor(`${message.id}-${buttonIdSuffix}`);
    if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
    copyFeedbackTimeoutRef.current = window.setTimeout(() => setShowCopiedFeedbackFor(null), 1500);
  };
  
  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
    };
  }, []);

  const handleEdit = () => {
    setIsEditing(true);
    setEditText(message.text);
  };

  const handleSave = () => {
    if (editText.trim()) {
      onSaveEdit(message.id, editText.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(message.text); 
  };

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.style.height = 'auto';
      editInputRef.current.style.height = `${editInputRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };
  
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const actionButtonClass = "p-1.5 text-[#A09CB0] hover:text-[#FF8DC7] disabled:opacity-50 disabled:hover:text-[#A09CB0] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#FF8DC7] focus-visible:ring-offset-1 focus-visible:ring-offset-[#35323C]";
  
  const shouldShowActionButtons = actionButtonsReady && !showInitialLoadingDots && (isUser || (!isUser && message.text && message.text.trim() !== ''));
  const isLatestAiMessageVisible = message.sender === SenderType.AI && isOverallLatestMessage && !isStreamingAiText && actionButtonsReady;

  return (
    <div className={`group flex flex-col animate-fadeInSlideUp ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[85%] sm:max-w-[75%]`}>
        {showInitialLoadingDots ? (
          <div className="py-1 px-0 text-base leading-relaxed">
            <span className="pulsating-white-dot" aria-hidden="true"></span>
          </div>
        ) : (
          <div
            className={`${
              isUser
                ? 'bg-[#35323C] rounded-2xl py-2 px-3'
                : 'py-1 px-0' 
            }`}
          >
            {isEditing && isUser ? (
              <textarea
                ref={editInputRef}
                value={editText}
                onChange={handleTextareaChange}
                onKeyDown={handleTextareaKeyDown}
                onBlur={handleSave} 
                className="w-full bg-transparent text-[#EAE6F0] text-base leading-relaxed focus:outline-none resize-none border-none p-0"
                rows={1}
              />
            ) : (
              <p className="text-base leading-relaxed whitespace-pre-wrap text-[#EAE6F0]">
                {displayedText}
                {showTypingCursor && <span className="blinking-cursor" aria-hidden="true"></span>}
              </p>
            )}
          </div>
        )}
      </div>
      {shouldShowActionButtons && (
        <div className={`mt-1.5 flex items-center space-x-2 transition-opacity duration-300 ease-in-out 
          ${isLatestAiMessageVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}
        `}>
          {isUser ? (
            <>
              <button onClick={() => handleCopy('user-copy')} className={actionButtonClass} aria-label="Copy my message">
                {showCopiedFeedbackFor === `${message.id}-user-copy` ? <span className="text-xs text-[#FF8DC7] copied-feedback" aria-live="polite">Copied!</span> : <IconClipboardDocumentList />}
              </button>
              {isEditing ? (
                <>
                  <button onClick={handleSave} className={`${actionButtonClass} text-[#86E8B3] hover:text-[#A0F0C8]`} aria-label="Save changes">Save</button>
                  <button onClick={handleCancelEdit} className={`${actionButtonClass} text-[#FF8585] hover:text-[#FFAAAA]`} aria-label="Cancel edit">Cancel</button>
                </>
              ) : (
                <button onClick={handleEdit} className={actionButtonClass} aria-label="Edit my message">
                  <IconPencil className="w-4 h-4" />
                </button>
              )}
            </>
          ) : ( // AI message actions
            <>
              <button onClick={() => handleCopy('ai-copy')} className={actionButtonClass} aria-label="Copy AI's response">
                 {showCopiedFeedbackFor === `${message.id}-ai-copy` ? <span className="text-xs text-[#FF8DC7] copied-feedback" aria-live="polite">Copied!</span> : <IconClipboardDocumentList />}
              </button>
              <button onClick={() => onRateResponse(message.id, 'good')} className={actionButtonClass} aria-label="Good response">
                <IconThumbUp />
              </button>
              <button onClick={() => onRateResponse(message.id, 'bad')} className={actionButtonClass} aria-label="Bad response">
                <IconThumbDown />
              </button>
              {previousUserMessageText && (
                <button onClick={() => onRetryResponse(message.id, previousUserMessageText)} className={actionButtonClass} aria-label="Retry response">
                  <IconArrowPath />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
