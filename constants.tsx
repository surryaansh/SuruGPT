
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
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden="true">
        {/* Main circle for face */}
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        {/* Eyes */}
        <circle cx="9" cy="10" r="1.5" fill="#EAE6F0" />
        <circle cx="15" cy="10" r="1.5" fill="#EAE6F0" />
        {/* Smile */}
        <path d="M8 14 Q12 16.5 16 14" stroke="#EAE6F0" strokeWidth="1.2" strokeLinecap="round" fill="none" />
         {/* Small blush marks - optional, can be removed if too detailed */}
        <ellipse cx="7" cy="12.5" rx="1.2" ry="0.8" fill="#FFB6C1" opacity="0.5" />
        <ellipse cx="17" cy="12.5" rx="1.2" ry="0.8" fill="#FFB6C1" opacity="0.5" />
    </svg>
);


export const IconHeart: React.FC<{ className?: string, style?: React.CSSProperties }> = ({ className = "w-6 h-6", style }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M11.645 20.91a.75.75 0 0 1-1.29 0L1.759 10.336a4.5 4.5 0 0 1 6.364-6.364l.69.69.69-.69a4.5 4.5 0 0 1 6.364 6.364L11.645 20.91Z" />
    </svg>
  );

export const IconThumbUp: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H5.904c-.656 0-1.233-.425-1.435-1.026a4.782 4.782 0 0 1 0-2.944C4.671 3.425 5.248 3 5.904 3H15.31c.656 0 1.233.425 1.435 1.026a4.782 4.782 0 0 1 0 2.944c-.202.601-.779 1.026-1.435 1.026Z" />
  </svg>
);
export const IconThumbUpSolid: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632a1.5 1.5 0 0 1 .522-1.666l.983-.805A9.004 9.004 0 0 1 9 15.082V9.75a3 3 0 0 1 3-3h.375c.621 0 1.2.201 1.62.562l.668.557c.25.208.532.39.832.537.299.145.617.228.945.228h3.125c.621 0 1.125.504 1.125 1.125V15c0 .621-.504 1.125-1.125 1.125h-4.372c.123.47.175.965.175 1.471 0 .624-.134 1.22-.39 1.766a2.99 2.99 0 0 1-1.164 1.123c-.344.196-.711.291-1.078.291H9.375a3 3 0 0 1-1.882-.666Z" />
    <path d="M5.25 7.5c0-.828-.672-1.5-1.5-1.5h-1.5a1.5 1.5 0 0 0-1.5 1.5v11.25c0 .828.672 1.5 1.5 1.5h1.5a1.5 1.5 0 0 0 1.5-1.5V7.5Z" />
  </svg>
);


export const IconThumbDown: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533.446 2.031 1.08a9.041 9.041 0 0 1 2.861 2.4c.723.384 1.35.956 1.653 1.715a4.498 4.498 0 0 0 .322 1.672V17.25a.75.75 0 0 1-.75.75 2.25 2.25 0 0 1-2.25-2.25c0-1.152.26-2.243.723-3.218.266-.558-.107-1.282-.725-1.282m0 0H9.375c-1.026 0-1.945-.694-2.054-1.715A9.965 9.965 0 0 1 7.248 6.5c-.388-.482-.987-.729-1.605-.729H4.158c-.483 0-.964.078-1.423.23L1.62 7.051a4.501 4.501 0 0 0-1.423.23H0M13.367 3.75H5.904c-.656 0-1.233.425-1.435 1.026a4.782 4.782 0 0 0 0 2.944c.202.601.779 1.026 1.435 1.026H13.367c.656 0 1.233-.425 1.435-1.026a4.782 4.782 0 0 0 0-2.944C14.6 4.175 14.023 3.75 13.367 3.75Z" />
  </svg>
);
export const IconThumbDownSolid: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M11.25 5.25c0-.828.672-1.5 1.5-1.5h1.5a1.5 1.5 0 0 1 1.5 1.5v11.25c0 .828-.672 1.5-1.5 1.5h-1.5a1.5 1.5 0 0 1-1.5-1.5V5.25Z" />
    <path d="M6 11.25c.123-.47.175-.965.175-1.471 0-.624-.134-1.22-.39-1.766a2.99 2.99 0 0 0-1.164-1.123c-.344-.196-.711-.291-1.078-.291H2.625a3 3 0 0 0-1.882.666C.305 7.785.025 8.237 0 8.718c0 .425.22.82.621 1.076a1.5 1.5 0 0 0 1.657.101l.983-.805A9.004 9.004 0 0 0 6 8.918v5.332a3 3 0 0 0 3 3h.375c.621 0 1.2-.201 1.62-.562l.668-.557c.25-.208.532-.39.832-.537.299-.145.617-.228.945-.228H15c.621 0 1.125-.504 1.125-1.125V9a1.125 1.125 0 0 0-1.125-1.125h-4.372Z" />
  </svg>
);


export const IconArrowPath: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0l3.181-3.183m0-4.991v4.99" />
  </svg>
);

export const IconEllipsisVertical: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
  </svg>
);

export const IconTrash: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12.56 0c.342.052.682.107 1.022.166m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
  </svg>
);

export const IconClipboardDocumentList: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black" className={className} aria-hidden="true">
    <rect width="24" height="24" />
  </svg>
);
