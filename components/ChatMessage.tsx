
import React, { useState, useEffect, useRef } from 'react';
import { Message, SenderType } from '../types';
import { IconClipboardDocumentList, IconPencil, IconThumbUp, IconThumbDown, IconArrowRepeat, IconThumbUpSolid, IconThumbDownSolid, IconCheck } from '../constants';

interface ChatMessageProps {
  message: Message;
  isStreamingAiText?: boolean;
  isOverallLatestMessage: boolean;
  onCopyText: (text: string) => void;
  onRateResponse: (messageId: string, rating: 'good' | 'bad')
    => void;
  onRetryResponse: (aiMessageId: string, userPromptText: string) => void;
  onSaveEdit: (messageId: string, newText: string) => void;
  previousUserMessageText?: string;
}

const ActionButtonWithTooltip: React.FC<{
  onClick?: () => void;
  label: string;
  tooltipText: string;
  children: React.ReactNode;
  className?: string; // Applied to the button itself
  wrapperClassName?: string; // Applied to the wrapping div of button + tooltip
  disabled?: boolean;
}> = ({ onClick, label, tooltipText, children, className, wrapperClassName, disabled }) => (
  <div className={\`relative group \${wrapperClassName || ''}\`}> {/* Apply wrapperClassName here */}
    <button
      onClick={onClick}
      className={\`\${className || ''} focus:outline-none focus-visible:ring-1 focus-visible:ring-[#FF8DC7] focus-visible:ring-offset-1 focus-visible:ring-offset-[#35323C]\`}
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


const ChatMessage: React.FC<ChatMessageProps> = React.memo(({
  message,
  isStreamingAiText, 
  isOverallLatestMessage,
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
  const typingSpeed = 25; // Adjusted from 35ms

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const [showCopiedFeedbackFor, setShowCopiedFeedbackFor] = useState<string | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);

  const [actionButtonsReady, setActionButtonsReady] = useState(isUser);
  const actionButtonReadyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (isUser) {
      setActionButtonsReady(true);
      return;
    }
    if (!isUser && !isStreamingAiText && message.text && message.text.trim() !== '') {
      if (actionButtonReadyTimeoutRef.current) clearTimeout(actionButtonReadyTimeoutRef.current);
      actionButtonReadyTimeoutRef.current = window.setTimeout(() => {
        setActionButtonsReady(true);
      }, 150); // Small delay to ensure text is fully rendered before buttons appear
    } else if (isStreamingAiText || !message.text || message.text.trim() === '') {
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
      if (isEditing) setEditText(message.text); // Ensure editText is synced if message.text changes externally while editing
      return;
    }

    // AI messages
    if (isStreamingAiText && message.text) {
        // Only update if the incoming text is different, to avoid interrupting manual edits or mid-stream fixes
        if (displayedText !== message.text) {
            let currentTypedLength = displayedText.length;
            // If the new text is shorter or doesn't start with the current displayed text, reset.
            if (message.text.length < displayedText.length || !message.text.startsWith(displayedText)) {
                setDisplayedText('');
                currentTypedLength = 0;
            }

            const type = () => {
                if (currentTypedLength < message.text.length) {
                    setDisplayedText(prev => message.text.substring(0, prev.length + 1)); // More robust update
                    currentTypedLength++; // This local var is now out of sync with displayedText.length, better to rely on displayedText.length in next iteration
                    setShowTypingCursor(true);
                    typingTimeoutRef.current = window.setTimeout(type, typingSpeed);
                } else {
                    setShowTypingCursor(false);
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                }
            };

            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            // Use displayedText.length directly for the next character to type
            typingTimeoutRef.current = window.setTimeout(type, displayedText.length === currentTypedLength ? typingSpeed: 0);
        }
    } else if (!isStreamingAiText && message.text) {
        // Not streaming, set text directly
        setDisplayedText(message.text);
        setShowTypingCursor(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    } else if (isStreamingAiText && !message.text) {
        // Streaming but no text yet (initial AI "thinking" state)
        setDisplayedText('');
        setShowTypingCursor(false); // No cursor if no text is being typed
    }


    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  // Ensure displayedText is in dependency array if logic inside effect depends on its previous state for typing.
  }, [message.text, message.sender, isStreamingAiText, isUser, displayedText]); 

  const showInitialLoadingDots = message.sender === SenderType.AI && isStreamingAiText && !message.text && !displayedText;

  const handleCopy = (buttonIdSuffix: string) => {
    const textToCopy = isEditing ? editText : message.text;
    onCopyText(textToCopy.trim()); 

    const copyButtonId = \`\${message.id}-\${buttonIdSuffix}\`;
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
      // Auto-resize textarea
      editInputRef.current.style.height = 'auto';
      editInputRef.current.style.height = \`\${editInputRef.current.scrollHeight}px\`;
    }
  }, [isEditing]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = \`\${e.target.scrollHeight}px\`;
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

  const shouldShowActionButtons = actionButtonsReady && !showInitialLoadingDots && (isUser || (!isUser && message.text && message.text.trim() !== ''));
  
  const baseActionButtonsContainerClass = "mt-1 flex items-center space-x-1.5";
  let dynamicClassesForContainer = "";

  // If it's the latest AI message and it's not streaming (i.e., fully loaded), show buttons immediately.
  if (!isUser && isOverallLatestMessage && !isStreamingAiText && actionButtonsReady && !showInitialLoadingDots && message.text && message.text.trim() !== '') {
    dynamicClassesForContainer = 'actions-visible-immediately';
  }
  const actionButtonsContainerClass = \`\${baseActionButtonsContainerClass} \${dynamicClassesForContainer}\`;

  return (
    <div id={message.id} className={\`message-item flex flex-col animate-fadeInSlideUp \${isUser ? 'items-end' : 'items-start'}\`}>
      <div className={\`max-w-[85%] sm:max-w-[75%]\`}>
        {showInitialLoadingDots ? (
          <div className="py-1.5 px-0 text-sm leading-relaxed"> {/* Adjusted py for AI loading dots */}
            <span className="pulsating-white-dot" aria-hidden="true"></span>
          </div>
        ) : (
          <div
            className={\`\${
              isUser
                ? 'bg-[#4A4754] rounded-3xl py-2 px-3.5' // Updated user bubble background and padding
                : 'py-1.5 px-0' // Updated AI message container padding
            }\`}
          >
            {isEditing && isUser ? (
              <textarea
                ref={editInputRef}
                value={editText}
                onChange={handleTextareaChange}
                onKeyDown={handleTextareaKeyDown}
                className="w-full bg-transparent text-[#EAE6F0] text-sm leading-relaxed focus:outline-none resize-none border-none p-0 overflow-y-auto max-h-40"
                rows={1}
              />
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-[#EAE6F0]">{displayedText.trim()}{showTypingCursor && <span className="blinking-cursor" aria-hidden="true"></span>}</p>
            )}
          </div>
        )}
      </div>
      {shouldShowActionButtons && (
        <div className={actionButtonsContainerClass}>
          {isUser ? (
            <>
              <ActionButtonWithTooltip
                onClick={() => handleCopy('user-copy')}
                label="Copy my message"
                tooltipText="Copy"
                className={actionButtonClass}
                wrapperClassName="stagger-action-button"
              >
                {showCopiedFeedbackFor === \`\${message.id}-user-copy\` ? <IconCheck className="w-4 h-4 text-[#FF8DC7]" /> : <IconClipboardDocumentList className="w-4 h-4" />}
              </ActionButtonWithTooltip>
              {isEditing ? (
                <>
                  <ActionButtonWithTooltip
                    onClick={handleSave}
                    label="Save changes"
                    tooltipText="Save"
                    className={\`\${actionButtonClass} text-[#86E8B3] hover:text-[#A0F0C8]\`}
                    wrapperClassName="stagger-action-button"
                  >
                    Save
                  </ActionButtonWithTooltip>
                  <ActionButtonWithTooltip
                    onClick={handleCancelEdit}
                    label="Cancel edit"
                    tooltipText="Cancel"
                    className={\`\${actionButtonClass} text-[#FF8585] hover:text-[#FFAAAA]\`}
                    wrapperClassName="stagger-action-button"
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
                  wrapperClassName="stagger-action-button"
                >
                  <IconPencil className="w-4 h-4" />
                </ActionButtonWithTooltip>
              )}
            </>
          ) : (
            <>
              <ActionButtonWithTooltip
                onClick={() => handleCopy('ai-copy')}
                label="Copy AI's response"
                tooltipText="Copy"
                className={actionButtonClass}
                wrapperClassName="stagger-action-button"
              >
                 {showCopiedFeedbackFor === \`\${message.id}-ai-copy\` ? <IconCheck className="w-4 h-4 text-[#FF8DC7]" /> : <IconClipboardDocumentList className="w-4 h-4" />}
              </ActionButtonWithTooltip>

              {message.feedback !== 'bad' && (
                <ActionButtonWithTooltip
                  onClick={() => onRateResponse(message.id, 'good')}
                  label="Good response"
                  tooltipText="Good response"
                  className={\`\${actionButtonClass} \${message.feedback === 'good' ? 'text-[#FF8DC7]' : ''}\`}
                  wrapperClassName="stagger-action-button"
                >
                  {message.feedback === 'good' ? <IconThumbUpSolid /> : <IconThumbUp />}
                </ActionButtonWithTooltip>
              )}

              {message.feedback !== 'good' && (
                <ActionButtonWithTooltip
                  onClick={() => onRateResponse(message.id, 'bad')}
                  label="Bad response"
                  tooltipText="Bad response"
                  className={\`\${actionButtonClass} \${message.feedback === 'bad' ? 'text-[#FF8DC7]' : ''}\`}
                  wrapperClassName="stagger-action-button"
                >
                  {message.feedback === 'bad' ? <IconThumbDownSolid /> : <IconThumbDown />}
                </ActionButtonWithTooltip>
              )}

              {previousUserMessageText && (
                <ActionButtonWithTooltip
                  onClick={() => onRetryResponse(message.id, previousUserMessageText)}
                  label="Retry response"
                  tooltipText="Retry"
                  className={actionButtonClass}
                  wrapperClassName="stagger-action-button"
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
});

export default ChatMessage;
