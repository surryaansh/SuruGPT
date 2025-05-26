
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

export const IconClipboardDocumentList: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m9.75 0H9.375c-.621 0-1.125.504-1.125 1.125v8.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V11.25a1.125 1.125 0 0 0-1.125-1.125Z" />
  </svg>
);

export const IconThumbUp: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75A2.25 2.25 0 0 1 16.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904M6.633 10.5l-1.07-1.071a.75.75 0 0 0-1.06 1.061l1.07 1.071M6.633 10.5V14.25m0-3.75a.75.75 0 0 0-1.5 0v3.75a.75.75 0 0 0 1.5 0V10.5Z" />
  </svg>
);

export const IconThumbUpSolid: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632a1.003 1.003 0 0 1 .351-1.007l1.548-1.362A21.782 21.782 0 0 1 12 14.25c.495 0 .983.025 1.462.073a7.49 7.49 0 0 1 3.452 3.036A7.49 7.49 0 0 1 12 21.75a7.473 7.473 0 0 1-3.98.997c-.066.002-.132.003-.198.003H7.493ZM2.25 9.375c0-1.02.648-1.894 1.566-2.208.166-.056.339-.084.51-.084H7.5c.726 0 1.375-.432 1.684-1.07CM8.572 3.665A2.25 2.25 0 0 1 10.5 2.25h3c.507 0 .988.168 1.378.463.21.155.396.338.551.546A4.484 4.484 0 0 1 16.5 4.5v2.25c0 .578.213 1.132.591 1.569.769.889 1.239 1.99 1.239 3.181v1.93C18.33 14.362 17.231 15 16.02 15h-1.533A21.746 21.746 0 0 0 12 14.25c-2.212 0-4.337.344-6.33.977-.412.133-.83.187-1.248.187C2.983 15.415 2.25 14.682 2.25 13.75V9.375Z" />
  </svg>
);


export const IconThumbDown: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c-.806 0-1.533.446-2.031 1.08a9.041 9.041 0 0 0-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.498 4.498 0 0 1-.322 1.672V21a.75.75 0 0 0 .75.75A2.25 2.25 0 0 0 16.5 19.5c0-1.152.26-2.243.723-3.218.266-.558-.107-1.282-.725-1.282H3.374c-1.026 0-1.945-.694-2.054-1.715-.045-.422-.068-.85-.068-1.285a11.95 11.95 0 0 1 2.649-7.521c.388-.482.987-.729 1.605-.729H9.02c.483 0 .964.078 1.423.23l3.114 1.04a4.501 4.501 0 0 1 1.423.23h1.777M6.633 10.5l1.07 1.071a.75.75 0 0 1 1.06-1.061l-1.07-1.071M6.633 10.5V5.25m0 5.25a.75.75 0 0 1 1.5 0V5.25a.75.75 0 0 1-1.5 0v5.25Z" />
  </svg>
);

export const IconThumbDownSolid: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M16.507 5.25c.425 0 .82.236.975.632a1.003 1.003 0 0 1-.351 1.007l-1.548 1.362A21.782 21.782 0 0 1 12 9.75c-.495 0-.983-.025-1.462-.073a7.49 7.49 0 0 1-3.452-3.036A7.49 7.49 0 0 1 12 2.25a7.473 7.473 0 0 1 3.98-.997c.066-.002.132-.003.198-.003h.329ZM21.75 14.625c0 1.02-.648 1.894-1.566 2.208-.166.056-.339.084-.51.084H16.5c-.726 0-1.375.432-1.684 1.07.649.405 1.251.887 1.797 1.435A2.25 2.25 0 0 1 14.25 21.75h-3c-.507 0-.988-.168-1.378-.463a4.007 4.007 0 0 1-.551-.546A4.484 4.484 0 0 1 8.25 19.5v-2.25c0-.578-.213-1.132-.591-1.569-.769-.889-1.239-1.99-1.239-3.181v-1.93c.001-1.03.769-1.875 1.77-1.875h1.533A21.746 21.746 0 0 0 12 9.75c2.212 0 4.337-.344 6.33-.977.412-.133.83-.187 1.248-.187.93 0 1.668.733 1.668 1.667v3.185Z" />
  </svg>
);

export const IconArrowPath: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0l3.181-3.183m-4.994 0-3.182-3.182a8.25 8.25 0 0 0-11.667 0l3.182 3.182H2.985z" />
  </svg>
);
