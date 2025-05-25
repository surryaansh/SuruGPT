
import React from 'react';
import { IconMenu, IconHeart } from '../constants';

interface HeaderProps {
  onToggleSidebar: () => void;
  onNewChat: () => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onNewChat }) => {
  return (
    <header className="bg-[#393641] p-3 sm:p-4 flex items-center justify-between sticky top-0 z-20 border-b border-[#5A5666]">
      {/* Left Button: Menu */}
      <button 
        onClick={onToggleSidebar}
        className="p-1.5 sm:p-2 text-[#EAE6F0] hover:text-[#FF8DC7] flex-shrink-0"
        aria-label="Open menu"
      >
        <IconMenu className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      {/* Center Title: Allows shrinking and truncation. */}
      <div className="flex-grow flex items-center justify-center min-w-0 px-1 sm:px-2">
        {/* Chevron icon removed from here */}
        <span className="text-[#EAE6F0] text-lg sm:text-xl font-semibold truncate">SuruGPT</span>
      </div>
      
      {/* Right Button: New Chat */}
      <button
        onClick={onNewChat}
        className="p-1.5 sm:p-2 text-[#EAE6F0] hover:text-[#FF8DC7] flex-shrink-0" 
        aria-label="Start new chat"
      >
        <IconHeart className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>
    </header>
  );
};

export default Header;
