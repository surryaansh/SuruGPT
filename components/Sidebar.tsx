
import React from 'react';
import { IconClose, IconHeart } from '../constants'; // Using IconHeart for New Chat
import { ChatSession } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  chatSessions: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onClose, 
  onNewChat, 
  chatSessions, 
  activeChatId, 
  onSelectChat 
}) => {
  return (
    <div
      className={`sidebar fixed top-0 left-0 h-full w-72 sm:w-80 bg-[#393641] text-[#EAE6F0] shadow-2xl p-5 z-40 transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sidebar-title"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 id="sidebar-title" className="text-xl font-semibold text-[#FF8DC7]">
          Suru Menu
        </h2>
        <button
          onClick={onClose}
          className="p-1 text-[#A09CB0] hover:text-[#FF8DC7]"
          aria-label="Close menu"
        >
          <IconClose className="w-6 h-6" />
        </button>
      </div>

      <nav className="flex flex-col h-[calc(100%-100px)]"> {/* Adjust height for API key section */}
        <button
          onClick={onNewChat}
          className="w-full flex items-center text-left p-3 mb-3 rounded-lg bg-[#FF8DC7] hover:bg-opacity-80 text-white transition-colors"
        >
          <IconHeart className="w-5 h-5 mr-3" /> 
          <span className="text-md font-semibold">New Chat</span>
        </button>

        <div className="flex-grow overflow-y-auto pr-1">
          {chatSessions.length > 0 && (
            <h3 className="text-xs text-[#A09CB0] uppercase font-semibold mb-1 mt-3 px-1">Chat History</h3>
          )}
          <ul>
            {chatSessions.map((chat) => ( 
              <li key={chat.id}>
                <button 
                  onClick={() => onSelectChat(chat.id)}
                  className={`w-full text-left p-2.5 my-0.5 rounded-md hover:bg-[#4A4754] truncate transition-colors text-sm ${
                    activeChatId === chat.id ? 'bg-[#5A5666] font-semibold text-[#FF8DC7]' : 'text-[#EAE6F0]'
                  }`}
                >
                  {chat.title}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto pt-4 border-t border-[#5A5666]">
          <h3 className="text-xs text-[#A09CB0] uppercase font-semibold mb-2 px-1">API Key Status</h3>
          <input
            type="text"
            placeholder="API Key configured on server"
            disabled
            className="w-full p-2.5 bg-[#2D2A32] text-[#A09CB0] placeholder-[#7f7b8a] rounded-md text-xs border border-[#5A5666] focus:outline-none cursor-not-allowed"
            aria-label="OpenAI API Key is managed on the server"
          />
          <p className="text-xs text-[#A09CB0] mt-2 px-1">
            The OpenAI API Key is securely managed on the server-side for this application.
          </p>
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;
