import React from 'react';
import { IconSidebarClose, IconHeart, IconSearch, IconEdit } from '../constants';
import { ChatSession } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  chatSessions: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  isLoading?: boolean;
}

interface GroupedChatSessions {
  heading: string;
  chats: ChatSession[];
}

const groupChatSessionsByDate = (sessions: ChatSession[]): GroupedChatSessions[] => {
  if (!sessions || sessions.length === 0) {
    return [];
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const groups: { [key: string]: ChatSession[] } = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    'Previous 30 days': [],
    Older: [],
  };

  sessions.forEach(session => {
    // Ensure createdAt is a Date object
    const sessionDate = session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt);
    const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());

    if (sessionDay.getTime() === today.getTime()) {
      groups.Today.push(session);
    } else if (sessionDay.getTime() === yesterday.getTime()) {
      groups.Yesterday.push(session);
    } else if (sessionDay.getTime() > sevenDaysAgo.getTime()) {
      groups['Previous 7 days'].push(session);
    } else if (sessionDay.getTime() > thirtyDaysAgo.getTime()) {
      groups['Previous 30 days'].push(session);
    } else {
      groups.Older.push(session);
    }
  });

  return Object.entries(groups)
    .map(([heading, chats]) => ({ heading, chats }))
    .filter(group => group.chats.length > 0);
};


const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onClose, 
  onNewChat, 
  chatSessions, 
  activeChatId, 
  onSelectChat,
  isLoading 
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');

  const filteredChatSessions = chatSessions.filter(chat => 
    chat.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedSessions = groupChatSessionsByDate(filteredChatSessions);

  return (
    <div
      className={`sidebar fixed top-0 left-0 h-full w-72 sm:w-80 bg-[#393641] text-[#EAE6F0] shadow-2xl p-5 z-40 transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!isOpen}
    >
      <div className="flex flex-col h-full">
        
        {/* Top Bar: Heart icon (left) and Close button with tooltip (right) */}
        <div className="flex items-center justify-between mb-4 pt-1">
          <IconHeart className="w-7 h-7 text-[#FF8DC7]" />
          
          <div className="relative group">
            <button
              onClick={onClose}
              className="p-1 text-[#A09CB0] hover:text-[#FF8DC7]"
              aria-label="Close sidebar"
            >
              <IconSidebarClose className="w-6 h-6" />
            </button>
            <span 
              className="absolute right-0 top-full mt-2 w-max px-2 py-1 bg-[#2D2A32] text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50"
            >
              Close sidebar
            </span>
          </div>
        </div>

        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className="w-full flex items-center text-left p-3 mb-3 rounded-lg hover:bg-[#4A4754] transition-colors focus:outline-none focus:ring-2 focus:ring-[#FF8DC7]"
          aria-label="Start a new chat"
        >
          <IconEdit className="w-5 h-5 mr-3 text-[#EAE6F0]" /> 
          <span className="text-md font-normal text-[#EAE6F0]">New chat</span>
        </button>

        {/* Search Chats Input */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <IconSearch className="w-4 h-4 text-[#A09CB0]" />
          </div>
          <input
            type="text"
            placeholder="Search chats"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2.5 pl-10 bg-[#4A4754] text-[#EAE6F0] placeholder-[#A09CB0] rounded-md text-sm border border-[#5A5666] focus:outline-none focus:border-[#FF8DC7] focus:ring-1 focus:ring-[#FF8DC7]"
            aria-label="Search chat history"
          />
        </div>

        {/* Chat History List (Scrollable) */}
        <div className="flex-grow overflow-y-auto pr-1 mb-4">
          {isLoading ? (
            <p className="text-xs text-[#A09CB0] px-1 py-2 text-center">Loading chats...</p>
          ) : groupedSessions.length > 0 ? (
            groupedSessions.map(group => (
              <div key={group.heading} className="mb-3">
                <h3 className="text-xs text-[#A09CB0] uppercase font-semibold mb-1 mt-3 px-1">
                  {group.heading}
                </h3>
                <ul>
                  {group.chats.map((chat) => ( 
                    <li key={chat.id}>
                      <button 
                        onClick={() => onSelectChat(chat.id)}
                        className={`w-full text-left p-2.5 my-0.5 rounded-md hover:bg-[#4A4754] truncate transition-colors text-sm focus:outline-none focus:ring-1 focus:ring-[#FF8DC7] ${
                          activeChatId === chat.id ? 'bg-[#5A5666] font-semibold text-[#FF8DC7]' : 'text-[#EAE6F0]'
                        }`}
                      >
                        {chat.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : searchTerm && chatSessions.length > 0 ? (
             <p className="text-xs text-[#A09CB0] px-1 py-2 text-center">No chats match your search.</p>
          ) : (
            <p className="text-xs text-[#A09CB0] px-1 py-2 text-center">No chat history yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
