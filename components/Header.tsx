import React from 'react';
import { IconMenu, IconChevronDown, IconHeart } from '../constants';

interface HeaderProps {
  onToggleSidebar: () => void;
  onNewChat: () => void; // Added prop for handling new chat
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onNewChat }) => {
  return (
    <header className="bg-[#393641] p-3 sm:p-4 flex items-center justify-between sticky top-0 z-20 border-b border-[#5A5666]">
      <button 
        onClick={onToggleSidebar}
        className="p-2 text-[#EAE6F0] hover:text-[#FF8DC7]"
        aria-label="Open menu"
      >
        <IconMenu className="w-6 h-6" />
      </button>
      <div className="flex items-center text-[#EAE6F0] text-xl font-semibold">
        <span>SuruGPT</span>
        <IconChevronDown className="w-5 h-5 ml-1 mt-1 text-[#EAE6F0]" />
      </div>
      <button
        onClick={onNewChat}
        className="p-2 text-[#EAE6F0] hover:text-[#FF8DC7]"
        aria-label="Start new chat"
      >
        <IconHeart className="w-6 h-6" />
      </button>
    </header>
  );
};

export default Header;
