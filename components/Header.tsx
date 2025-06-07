
import React from 'react';
import { IconOpenSidebar, IconHeart, IconLayoutSidebar } from '../constants'; // Added IconLayoutSidebar

interface HeaderProps {
  onToggleSidebar: () => void;
  onNewChat: () => void;
  isSidebarOpen: boolean; // Added prop to know sidebar state
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onNewChat, isSidebarOpen }) => {
  return (
    <header className="bg-[#2E2B36] p-3 sm:p-4 flex items-center justify-between sticky top-0 z-20"> {/* Removed border, updated background */}
      {/* Left Button: Menu Toggle */}
      <button 
        onClick={onToggleSidebar}
        className="p-1.5 sm:p-2 text-[#EAE6F0] hover:text-[#FF8DC7] flex-shrink-0"
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
      >
        {isSidebarOpen ? (
          <IconLayoutSidebar className="w-5 h-5 sm:w-6 sm:h-6" />
        ) : (
          <IconOpenSidebar className="w-5 h-5 sm:w-6 sm:h-6" />
        )}
      </button>

      {/* Center Title: Allows shrinking and truncation. */}
      <div className="flex-grow flex items-center justify-center min-w-0 px-1 sm:px-2">
        <span className="text-[#EAE6F0] text-lg sm:text-xl font-normal truncate">SuruGPT</span> {/* font-semibold to font-normal */}
      </div>
      
      {/* Right Button: New Chat */}
      <button
        onClick={onNewChat}
        className="p-1.5 sm:p-2 text-[#EAE6F0] hover:text-[#FF8DC7] flex-shrink-0 animate-subtleBounceOnHover" 
        aria-label="Start new chat"
      >
        <IconHeart className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>
    </header>
  );
};

export default Header;
