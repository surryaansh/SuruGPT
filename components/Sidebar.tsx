
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { IconLayoutSidebar, IconHeart, IconSearch, IconPencil, IconEllipsisVertical, IconTrash, IconNewChat } from '../constants'; // IconUser removed
import { ChatSession } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  chatSessions: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onRequestDeleteConfirmation: (sessionId: string, sessionTitle: string) => void;
  onRenameChatSession: (sessionId: string, newTitle: string) => Promise<void>;
  isLoading?: boolean;
  onLogout: () => void; 
  userName: string; 
  ownerUID: string;
}

interface GroupedChatSessions {
  heading: string;
  chats: ChatSession[];
}

function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };
  return debounced;
}

const groupChatSessionsByDate = (sessions: ChatSession[]): GroupedChatSessions[] => {
  if (!sessions || sessions.length === 0) return [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30);

  const groups: { [key: string]: ChatSession[] } = { Today: [], Yesterday: [], 'Previous 7 days': [], 'Previous 30 days': [], Older: [] };
  sessions.forEach(session => {
    const sessionDate = session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt);
    const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
    if (sessionDay.getTime() === today.getTime()) groups.Today.push(session);
    else if (sessionDay.getTime() === yesterday.getTime()) groups.Yesterday.push(session);
    else if (sessionDay.getTime() > sevenDaysAgo.getTime()) groups['Previous 7 days'].push(session);
    else if (sessionDay.getTime() > thirtyDaysAgo.getTime()) groups['Previous 30 days'].push(session);
    else groups.Older.push(session);
  });
  return Object.entries(groups).map(([heading, chats]) => ({ heading, chats })).filter(group => group.chats.length > 0);
};

const MENU_WIDTH = 148; // px

interface ChatSessionItemProps {
  chat: ChatSession;
  isActive: boolean;
  isEditing: boolean;
  editingTitle: string;
  activeContextMenuSessionId: string | null;
  onSelectChat: (chatId: string) => void;
  handleEllipsisClick: (e: React.MouseEvent, session: ChatSession) => void;
  handleEditInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleEditInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  submitRename: () => void;
  ellipsisRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  animationDelay: string;
}

const ChatSessionItem: React.FC<ChatSessionItemProps> = React.memo(({
  chat, isActive, isEditing, editingTitle, activeContextMenuSessionId,
  onSelectChat, handleEllipsisClick, handleEditInputChange,
  handleEditInputKeyDown, submitRename, ellipsisRefs, animationDelay
}) => {
  return (
    <li
      key={chat.id} role="button" tabIndex={0}
      onClick={() => { if (!isEditing) onSelectChat(chat.id); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!isEditing) onSelectChat(chat.id); } }}
      className={`group relative flex items-center justify-between p-2 my-0.5 rounded-lg animate-fadeInSlideUp outline-none transition-all duration-150 ease-in-out focus-visible:ring-2 focus-visible:ring-[#FF8DC7] focus-visible:ring-offset-1 focus-visible:ring-offset-[#2D2A32]
        ${isActive ? 'bg-[#4A4754]' : 'hover:bg-[#3c3a43] focus:bg-[#3c3a43]'}`}
      style={{ animationDelay }} aria-current={isActive ? "page" : undefined}
    >
      {isEditing ? (
        <input
          type="text" value={editingTitle} onChange={handleEditInputChange}
          onKeyDown={handleEditInputKeyDown} onBlur={submitRename} autoFocus
          className="flex-grow min-w-0 p-0 bg-transparent text-[#FF8DC7] rounded-md text-xs border-none focus:outline-none focus:ring-0"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className={`flex-grow min-w-0 text-left truncate text-xs ${isActive ? 'font-semibold text-[#FF8DC7]' : 'text-[#EAE6F0]'}`}>
          {chat.title}
        </div>
      )}
      {!isEditing && (
        <button
          ref={el => { if (el) ellipsisRefs.current[chat.id] = el; }}
          onClick={(e) => handleEllipsisClick(e, chat)}
          className={`p-0.5 text-[#A09CB0] hover:text-[#FF8DC7] rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-[#FF8DC7] flex-shrink-0 transition-opacity group-hover:scale-110
              ${activeContextMenuSessionId === chat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
          aria-label={`More options for chat: ${chat.title}`} aria-haspopup="true" aria-expanded={activeContextMenuSessionId === chat.id}
        >
          <IconEllipsisVertical className="w-4 h-4" />
        </button>
      )}
    </li>
  );
});

const Sidebar: React.FC<SidebarProps> = ({
  isOpen, onClose, onNewChat, chatSessions, activeChatId, onSelectChat,
  onRequestDeleteConfirmation, onRenameChatSession, isLoading,
  onLogout, userName, ownerUID 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [displayedSessions, setDisplayedSessions] = useState<ChatSession[]>(chatSessions);
  const [isSearching, setIsSearching] = useState(false);

  const [activeContextMenuSessionId, setActiveContextMenuSessionId] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [currentSessionForMenu, setCurrentSessionForMenu] = useState<ChatSession | null>(null);

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const contextMenuRef = useRef<HTMLDivElement>(null);
  const ellipsisRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!searchTerm.trim()) setDisplayedSessions(chatSessions);
  }, [chatSessions, searchTerm]);

  const performSearch = useCallback(async (term: string, currentUserId: string) => {
    const trimmedTerm = term.trim();
    if (!trimmedTerm) { setDisplayedSessions(chatSessions); setIsSearching(false); return; }
    if (!currentUserId) { console.warn("Search attempted without user ID"); setIsSearching(false); return; }

    setIsSearching(true);
    try {
      const response = await fetch(`${window.location.origin}/api/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchTerm: trimmedTerm, userId: currentUserId }),
      });
      if (!response.ok) throw new Error(await response.text());
      setDisplayedSessions(await response.json());
    } catch (error) {
      console.error("Error fetching search results:", error); setDisplayedSessions([]);
    } finally { setIsSearching(false); }
  }, [chatSessions]);


  const debouncedSearch = useMemo(() => debounce((term: string) => {
    const lowerTerm = term.toLowerCase();
    if (!lowerTerm) {
        setDisplayedSessions(chatSessions);
    } else {
        setDisplayedSessions(
            chatSessions.filter(s => s.title.toLowerCase().includes(lowerTerm) || (s.firstMessageTextForTitle || "").toLowerCase().includes(lowerTerm))
        );
    }
    setIsSearching(false);
  }, 300), [chatSessions, ownerUID, performSearch]); 


  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    setIsSearching(true); 
    debouncedSearch(term);
  };

  const closeContextMenu = useCallback(() => {
    setActiveContextMenuSessionId(null); setContextMenuPosition(null); setCurrentSessionForMenu(null);
  }, []);

  const handleEllipsisClick = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    const buttonElement = ellipsisRefs.current[session.id];
    if (activeContextMenuSessionId === session.id) { closeContextMenu(); return; }
    if (buttonElement) {
      const buttonRect = buttonElement.getBoundingClientRect();
      let top = buttonRect.bottom + 2, left = buttonRect.right + 6;
      if (left + MENU_WIDTH > window.innerWidth) left = buttonRect.left - MENU_WIDTH - 6;
      if (left < 0) left = 6;
      const menuHeightEstimate = contextMenuRef.current?.offsetHeight || 80;
      if (top + menuHeightEstimate > window.innerHeight) top = buttonRect.top - menuHeightEstimate - 2;
      if (top < 0) top = 2;
      setContextMenuPosition({ top, left });
      setActiveContextMenuSessionId(session.id);
      setCurrentSessionForMenu(session);
    } else { closeContextMenu(); }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        if (!Object.values(ellipsisRefs.current).some(btn => btn && btn.contains(event.target as Node))) {
          closeContextMenu();
        }
      }
    };
    if (activeContextMenuSessionId) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeContextMenuSessionId, closeContextMenu]);

  const handleRename = (session: ChatSession) => {
    setEditingSessionId(session.id); setEditingTitle(session.title); closeContextMenu();
  };

  const submitRename = async () => {
    if (editingSessionId && editingTitle.trim()) {
      try { await onRenameChatSession(editingSessionId, editingTitle.trim()); }
      catch (error) {
        console.error("Failed to rename:", error);
        const original = chatSessions.find(s => s.id === editingSessionId);
        if (original) setEditingTitle(original.title);
      }
    }
    setEditingSessionId(null);
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setEditingTitle(e.target.value);
  const handleEditInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submitRename();
    if (e.key === 'Escape') {
      const original = chatSessions.find(s => s.id === editingSessionId);
      if (original) setEditingTitle(original.title);
      setEditingSessionId(null);
    }
  };

  const groupedSessions = useMemo(() => groupChatSessionsByDate(displayedSessions), [displayedSessions]);

  return (
    <>
      <div
        className={`sidebar fixed top-0 left-0 h-full w-52 sm:w-60 bg-[#2D2A32] text-[#EAE6F0] pt-6 pb-4 px-4 z-40 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out`}
        role="dialog" aria-modal="true" aria-hidden={!isOpen}
      >
        <div className="flex flex-col h-full">
          {/* New Chat Button - moved up, header removed */}
          <button
            onClick={onNewChat}
            className="group w-full flex items-center text-left p-2.5 mb-3.5 rounded-lg hover:bg-[#4A4754] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8DC7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2D2A32]"
            aria-label="Start a new chat"
          >
            <IconNewChat className="w-4 h-4 mr-2.5 text-[#EAE6F0] group-hover:scale-110 group-hover:rotate-[-12deg] transition-transform duration-200" />
            <span className="text-sm font-normal text-[#EAE6F0]">New chat</span>
          </button>

          {/* Search Input */}
          <div className="relative mb-3">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <IconSearch className="w-3.5 h-3.5 text-[#A09CB0]" />
            </div>
            <input
              type="text" placeholder="Search chats" value={searchTerm} onChange={handleSearchChange}
              className="w-full p-2 pl-8 bg-[#4A4754] text-[#EAE6F0] placeholder-[#A09CB0] rounded-md text-xs border border-[#5A5666] focus:outline-none focus:border-[#FF8DC7] focus:ring-1 focus:ring-[#FF8DC7]"
              aria-label="Search chat history"
            />
          </div>

          {/* Chat List Area */}
          <div className="flex-grow overflow-y-auto px-1 mb-1 sidebar-chat-list-scroll-container">
            {isSearching ? <p className="text-xs text-[#A09CB0] px-1 py-1.5 text-center">Searching...</p>
              : isLoading && !searchTerm.trim() ? <p className="text-xs text-[#A09CB0] px-1 py-1.5 text-center">Loading chats...</p>
                : displayedSessions.length > 0 ? (
                  groupedSessions.map((sessionGroup, groupIndex) => (
                    <div key={sessionGroup.heading} className="mb-2">
                      <h3 className="text-xs text-[#A09CB0] uppercase font-semibold mb-0.5 mt-2 px-1 animate-fadeInSlideUp" style={{ animationDelay: `${groupIndex * 0.05}s` }}>
                        {sessionGroup.heading}
                      </h3>
                      <ul>
                        {sessionGroup.chats.map((chat, index) => (
                          <ChatSessionItem
                            key={chat.id} chat={chat} isActive={activeChatId === chat.id}
                            isEditing={editingSessionId === chat.id} editingTitle={editingTitle}
                            activeContextMenuSessionId={activeContextMenuSessionId}
                            onSelectChat={() => { onSelectChat(chat.id); closeContextMenu(); }}
                            handleEllipsisClick={handleEllipsisClick}
                            handleEditInputChange={handleEditInputChange}
                            handleEditInputKeyDown={handleEditInputKeyDown}
                            submitRename={submitRename}
                            ellipsisRefs={ellipsisRefs}
                            animationDelay={`${(groupIndex * 0.1) + (index * 0.03)}s`}
                          />
                        ))}
                      </ul>
                    </div>
                  ))
                  ) : searchTerm.trim() ? <p className="text-xs text-[#A09CB0] px-1 py-1.5 text-center">No chats match.</p>
                    : <p className="text-xs text-[#A09CB0] px-1 py-1.5 text-center">No chat history.</p>
            }
          </div>

          {/* User Info and Logout at the bottom */}
          <div className="mt-auto border-t border-[#393641] pt-3 pb-1">
            <div className="flex items-center justify-between p-1.5 rounded-lg hover:bg-[#3c3a43] transition-colors duration-150">
                <div className="flex items-center min-w-0">
                    <IconHeart className="w-5 h-5 text-[#FFD1DC] mr-2.5 flex-shrink-0" /> {/* Changed IconUser to IconHeart and updated classes */}
                    <span className="text-sm text-[#EAE6F0] truncate font-medium">{userName}</span>
                </div>
                <button
                    onClick={onLogout} // This prop correctly calls handleRequestLogoutConfirmation from App.tsx
                    className="ml-2 text-xs text-[#A09CB0] hover:text-[#FF8DC7] p-1 rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-[#FF8DC7] focus-visible:ring-offset-1 focus-visible:ring-offset-[#2D2A32]"
                    aria-label="Logout"
                >
                    Logout
                </button>
            </div>
          </div>

        </div>
      </div>

      {/* Context Menu */}
      {activeContextMenuSessionId && contextMenuPosition && currentSessionForMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu fixed bg-[#201F23] rounded-lg shadow-xl py-1 z-50 animate-fadeIn animate-scaleIn"
          style={{ top: `${contextMenuPosition.top}px`, left: `${contextMenuPosition.left}px`, width: `${MENU_WIDTH}px` }}
          role="menu"
        >
          <button onClick={() => handleRename(currentSessionForMenu)}
            className="context-menu-item w-full text-left px-2.5 py-1.5 text-xs text-[#EAE6F0] hover:bg-[#393641] flex items-center focus:bg-[#393641] focus:outline-none rounded-t-md" role="menuitem">
            <IconPencil className="w-3.5 h-3.5 mr-2" /> Rename
          </button>
          <div className="border-t border-[#393641] my-0.5 mx-1"></div>
          <button onClick={() => { onRequestDeleteConfirmation(currentSessionForMenu.id, currentSessionForMenu.title); closeContextMenu(); }}
            className="context-menu-item w-full text-left px-2.5 py-1.5 text-xs text-[#FF8DC7] hover:bg-[#393641] flex items-center focus:bg-[#393641] focus:outline-none rounded-b-md" role="menuitem">
            <IconTrash className="w-3.5 h-3.5 mr-2" /> Delete
          </button>
        </div>
      )}
    </>
  );
};

export default Sidebar;
