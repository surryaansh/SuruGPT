
import React, { useState, useEffect, useRef } from 'react';
import { Message, SenderType } from '../types';
import { IconClipboardDocumentList, IconPencil, IconThumbUp, IconThumbDown, IconArrowRepeat, IconThumbUpSolid, IconThumbDownSolid, IconCheck, IconChevronLeft, IconChevronRight } from '../constants';

interface ChatMessageProps {
  message: Message;
  isOverallLatestMessage: boolean; 
  onCopyText: (text: string) => void;
  onRateResponse: (messageId: string, rating: 'good' | 'bad') => void;
  onRetryResponse: (aiMessageId: string, userPromptText: string) => void;
  onSaveEdit: (messageId: string, newText: string) => void;
  onNavigateAiResponse: (messageId: string, direction: 'prev' | 'next') => void;
}

const ActionButtonWithTooltip: React.FC<{
  onClick?: () => void;
  label: string;
  tooltipText: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}> = ({ onClick, label, tooltipText, children, className, disabled }) => (
  <div className="relative group"> {/* 'group' class on the parent div */}
    <button
      onClick={onClick}
      className={`${className || ''} focus:outline-none focus-visible:ring-1 focus-visible:ring-[#FF8DC7] focus-visible:ring-offset-1 focus-visible:ring-offset-[#35323C] disabled:cursor-not-allowed disabled:opacity-40`}
      aria-label={label}
      disabled={disabled}
    >
      {children}
    </button>
    <span
      className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 bg-[#201F23] text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-in-out pointer-events-none z-30 whitespace-nowrap"
      role="tooltip"
    >
      {tooltipText}
    </span>
  </div>
);


const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  isOverallLatestMessage, 
  onCopyText,
  onRateResponse,
  onRetryResponse,
  onSaveEdit,
  onNavigateAiResponse,
}) => {
  const isUser = message.sender === SenderType.USER;
  const displayedText = message.text; 

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const [showCopiedFeedbackFor, setShowCopiedFeedbackFor] = useState<string | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);

  const actionButtonsReady = isUser || (message.sender === SenderType.AI && !message.isStreamingThisResponse && message.text && message.text.trim() !== '');

  useEffect(() => {
    if (isUser && isEditing) setEditText(message.text);
  }, [message.text, isUser, isEditing]); 

  const showInitialLoadingDots = message.sender === SenderType.AI && message.isStreamingThisResponse && (!message.text || message.text.trim() === '');
  const showTypingCursor = message.sender === SenderType.AI && message.isStreamingThisResponse && message.text && message.text.trim() !== '';


  const handleCopy = (buttonIdSuffix: string) => {
    const textToCopy = isUser && isEditing ? editText : displayedText; 
    onCopyText(textToCopy); 
    
    const copyButtonId = `${message.id}-${buttonIdSuffix}`;
    setShowCopiedFeedbackFor(copyButtonId);
    
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
      e.preventDefault(); 
      handleCancelEdit();
    }
  };

  const actionButtonClass = "p-1.5 text-[#A09CB0] hover:text-[#FF8DC7] disabled:opacity-50 disabled:hover:text-[#A09CB0] transition-colors";
  
  const shouldShowActionButtons = actionButtonsReady && !showInitialLoadingDots;
  
  // AI message action buttons are visible if the AI message itself is stable (not streaming its current response variant)
  const aiMessageActionsVisible = message.sender === SenderType.AI && !message.isStreamingThisResponse && actionButtonsReady;
  // User message action buttons are hover-to-show
  const userMessageActionsHoverToShow = isUser;


  const canNavigatePrev = message.sender === SenderType.AI && message.responses && typeof message.currentResponseIndex === 'number' && message.currentResponseIndex > 0;
  const canNavigateNext = message.sender === SenderType.AI && message.responses && typeof message.currentResponseIndex === 'number' && message.currentResponseIndex < message.responses.length - 1;

  return (
    <div className={`group/message-item flex flex-col animate-fadeInSlideUp ${isUser ? 'items-end' : 'items-start'}`}>
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
                className="w-full bg-transparent text-[#EAE6F0] text-base leading-relaxed focus:outline-none resize-none border-none p-0 overflow-y-auto max-h-40" 
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
        <div className={`mt-1.5 flex items-center space-x-1.5 transition-opacity duration-300 ease-in-out 
          ${aiMessageActionsVisible ? 'opacity-100' : 
            (userMessageActionsHoverToShow ? 'opacity-0 group-hover/message-item:opacity-100 focus-within:opacity-100' : 'opacity-0') // User actions on hover, others hidden if not AI stable
          }
        `}>
          {isUser ? (
            <>
              <ActionButtonWithTooltip
                onClick={() => handleCopy('user-copy')}
                label="Copy my message"
                tooltipText="Copy"
                className={actionButtonClass}
              >
                {showCopiedFeedbackFor === `${message.id}-user-copy` ? <IconCheck className="w-4 h-4 text-[#FF8DC7]" /> : <IconClipboardDocumentList className="w-4 h-4" />}
              </ActionButtonWithTooltip>
              {isEditing ? (
                <>
                  <ActionButtonWithTooltip
                    onClick={handleSave}
                    label="Save changes"
                    tooltipText="Save"
                    className={`${actionButtonClass} text-[#86E8B3] hover:text-[#A0F0C8]`}
                  >
                    Save
                  </ActionButtonWithTooltip>
                  <ActionButtonWithTooltip
                    onClick={handleCancelEdit}
                    label="Cancel edit"
                    tooltipText="Cancel"
                    className={`${actionButtonClass} text-[#FF8585] hover:text-[#FFAAAA]`}
                  >
                    Cancel
                  </ActionButtonWithTooltip>
                </>
              ) : (
                <ActionButtonWithTooltip
                  onClick={handleEdit}
                  label="Edit my message"
                  tooltipText="Edit"
                  className={actionButtonClass}
                >
                  <IconPencil className="w-4 h-4" />
                </ActionButtonWithTooltip>
              )}
            </>
          ) : ( // AI Message Actions
            <>
              {message.responses && message.responses.length > 1 && typeof message.currentResponseIndex === 'number' && (
                <>
                  <ActionButtonWithTooltip
                    onClick={() => onNavigateAiResponse(message.id, 'prev')}
                    label="Previous response"
                    tooltipText="Previous response"
                    className={actionButtonClass}
                    disabled={!canNavigatePrev || message.isStreamingThisResponse}
                  >
                    <IconChevronLeft className="w-4 h-4" />
                  </ActionButtonWithTooltip>
                  <span className="text-xs text-[#A09CB0] select-none px-0.5">
                    {message.currentResponseIndex + 1}/{message.responses.length}
                  </span>
                  <ActionButtonWithTooltip
                    onClick={() => onNavigateAiResponse(message.id, 'next')}
                    label="Next response"
                    tooltipText="Next response"
                    className={actionButtonClass}
                    disabled={!canNavigateNext || message.isStreamingThisResponse}
                  >
                    <IconChevronRight className="w-4 h-4" />
                  </ActionButtonWithTooltip>
                </>
              )}

              <ActionButtonWithTooltip
                onClick={() => handleCopy('ai-copy')}
                label="Copy AI's response"
                tooltipText="Copy"
                className={actionButtonClass}
                disabled={message.isStreamingThisResponse}
              >
                 {showCopiedFeedbackFor === `${message.id}-ai-copy` ? <IconCheck className="w-4 h-4 text-[#FF8DC7]" /> : <IconClipboardDocumentList className="w-4 h-4" />}
              </ActionButtonWithTooltip>

              {message.feedback !== 'bad' && ( 
                <ActionButtonWithTooltip
                  onClick={() => onRateResponse(message.id, 'good')}
                  label="Good response"
                  tooltipText="Good response"
                  className={`${actionButtonClass} ${message.feedback === 'good' ? 'text-[#FF8DC7]' : ''}`}
                  disabled={message.isStreamingThisResponse}
                >
                  {message.feedback === 'good' ? <IconThumbUpSolid /> : <IconThumbUp />}
                </ActionButtonWithTooltip>
              )}

              {message.feedback !== 'good' && ( 
                <ActionButtonWithTooltip
                  onClick={() => onRateResponse(message.id, 'bad')}
                  label="Bad response"
                  tooltipText="Bad response"
                  className={`${actionButtonClass} ${message.feedback === 'bad' ? 'text-[#FF8DC7]' : ''}`}
                  disabled={message.isStreamingThisResponse}
                >
                  {message.feedback === 'bad' ? <IconThumbDownSolid /> : <IconThumbDown />}
                </ActionButtonWithTooltip>
              )}

              {message.promptText && (
                <ActionButtonWithTooltip
                  onClick={() => onRetryResponse(message.id, message.promptText!)}
                  label="Retry response"
                  tooltipText="Retry"
                  className={actionButtonClass}
                  disabled={message.isStreamingThisResponse} 
                >
                  <IconArrowRepeat />
                </ActionButtonWithTooltip>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
