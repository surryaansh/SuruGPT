
import React from 'react';

export const IconMenu: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
  </svg>
);

export const IconChevronDown: React.FC<{ className?: string }> = ({ className = "w-4 h-4 ml-1" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
);

export const IconClose: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export const IconSidebarClose: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Outer rounded rectangle container */}
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    {/* Vertical line divider, slightly offset from the left */}
    <line x1="8.5" y1="3" x2="8.5" y2="21" />
    {/* Left-pointing chevron in the right compartment */}
    <polyline points="15.5 16.5 11.5 12 15.5 7.5" />
  </svg>
);

export const IconSearch: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

export const IconPencil: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
  </svg>
);

export const IconNewChat: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);


export const IconSend: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
  </svg>
);

export const IconKawaiiSuru: React.FC<{ className?: string }> = ({ className = "w-6 h-6 text-[#FF8DC7]" }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M50 10C27.909 10 10 27.909 10 50C10 72.091 27.909 90 50 90C72.091 90 90 72.091 90 50C90 27.909 72.091 10 50 10Z" fill="currentColor"/>
    <circle cx="35" cy="45" r="8" fill="#EAE6F0"/>
    <circle cx="65" cy="45" r="8" fill="#EAE6F0"/>
    <path d="M30 62C30 62 38 70 50 70C62 70 70 62 70 62" stroke="#EAE6F0" strokeWidth="5" strokeLinecap="round"/>
    <ellipse cx="25" cy="58" rx="7" ry="4" fill="#FFB6C1" opacity="0.6"/>
    <ellipse cx="75" cy="58" rx="7" ry="4" fill="#FFB6C1" opacity="0.6"/>
  </svg>
);

// FIX: Added style prop to IconSuru to allow inline styles.
export const IconSuru: React.FC<{ className?: string, style?: React.CSSProperties }> = ({ className = "w-6 h-6 text-[#FF8DC7]", style }) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
        <path d="M7 13C7 14.1046 7.89543 15 9 15C10.1046 15 11 14.1046 11 13C11 11.8954 10.1046 11 9 11C7.89543 11 7 11.8954 7 13Z" fill="#EAE6F0"/>
        <path d="M13 13C13 14.1046 13.8954 15 15 15C16.1046 15 17 14.1046 17 13C17 11.8954 16.1046 11 15 11C13.8954 11 13 11.8954 13 13Z" fill="#EAE6F0"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M5 7C5 5.34315 6.34315 4 8 4H16C17.6569 4 19 5.34315 19 7V17C19 18.6569 17.6569 20 16 20H8C6.34315 20 5 18.6569 5 17V7ZM8 6C7.44772 6 7 6.44772 7 7V17C7 17.5523 7.44772 18 8 18H16C17.5523 18 18 17.5523 18 17V7C18 6.44772 17.5523 6 16 6H8Z" fill="currentColor"/>
        <path d="M9 16.5H15" stroke="#EAE6F0" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
);

export const IconUser: React.FC<{ className?: string }> = ({ className = "w-6 h-6 text-[#EAE6F0]" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" clipRule="evenodd" />
  </svg>
);

export const IconHeart: React.FC<{ className?: string, style?: React.CSSProperties }> = ({ className = "w-6 h-6 text-[#FF8DC7]", style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24"
    fill="currentColor" 
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path fillRule="evenodd" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" clipRule="evenodd" />
  </svg>
);

export const IconEllipsisVertical: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
  </svg>
);

export const IconTrash: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12.56 0c1.153 0 2.242.078 3.324.214m9.236-1.003H4.827a2.25 2.25 0 0 0-2.231 2.079l.162 1.947m5.569 0H9.26" />
  </svg>
);

export const IconAI = IconSuru;

// Replaced <img> tag with an SVG for the Copy Icon
export const IconClipboardDocumentList: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    fill="none" 
    viewBox="0 0 24 24" 
    strokeWidth={1.5} 
    stroke="currentColor" 
    className={className}
    aria-hidden="true"
  >
    <path 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" 
    />
  </svg>
);


// Thumbs Up Icon (Outline) 
export const IconThumbUp: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.426 2.002-1.125H18.75a2.25 2.25 0 012.25 2.25v.167c0 .904-.426 1.708-1.125 2.252H15.188c-.862 1.69-2.607 2.875-4.688 2.875C7.138 17.125 4.5 14.526 4.5 11.137V9.375c0-1.125.9-2.025 2.025-2.025H6.633z" />
  </svg>
);

// Thumbs Up Icon (Solid) 
export const IconThumbUpSolid: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.5-3.375 1.375-4.75A7.48 7.48 0 015.25 6H6.75a2.25 2.25 0 012.25-2.25H13.5a2.25 2.25 0 012.25 2.25V15h1.5a2.25 2.25 0 012.25 2.25v1.5a2.25 2.25 0 01-2.25-2.25H16.5a2.25 2.25 0 01-2.25-2.25V15H7.493v3.75z" />
  </svg>
);

// Thumbs Down Icon (Outline) 
export const IconThumbDown: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.367 13.5c-.806 0-1.533.426-2.002 1.125H5.25a2.25 2.25 0 01-2.25-2.25v-.167c0-.904.426-1.708 1.125-2.252h2.812c.862-1.69 2.607-2.875 4.688-2.875C15.862 6.875 18.5 9.474 18.5 12.863v1.762c0 1.125-.9 2.025-2.025 2.025h-.108z" />
  </svg>
);

// Thumbs Down Icon (Solid) 
export const IconThumbDownSolid: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
     <path d="M16.507 5.25c.425 0 .82.236.975.632A7.48 7.48 0 0118 8.625c0 1.75-.5 3.375-1.375 4.75a7.48 7.48 0 012.125 4.75H17.25a2.25 2.25 0 01-2.25 2.25H9a2.25 2.25 0 01-2.25-2.25V9H5.25a2.25 2.25 0 01-2.25-2.25V5.25A2.25 2.25 0 015.25 3H7.5a2.25 2.25 0 012.25 2.25V9h6.757V5.25z" />
  </svg>
);

// Retry Icon 
export const IconArrowPath: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);
