import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { IconLayoutSidebar, IconHeart, IconSearch, IconPencil, IconEllipsisVertical, IconTrash, IconNewChat, IconLogout } from '../constants'; // IconUser removed, IconLogout added
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
  onRequestLogoutConfirmation: () => void; // Changed from onLogout
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
  onRequestLogoutConfirmation, userName, ownerUID 
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
  }, 300), [chatSessions]); 


  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    setIsSearching(true); 
    debouncedSearch(term);
  };

  const handleEllipsisClick = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    if (activeContextMenuSessionId === session.id) {
      setActiveContextMenuSessionId(null);
      setCurrentSessionForMenu(null);
    } else {
      const buttonRect = e.currentTarget.getBoundingClientRect();
      const sidebarRect = e.currentTarget.closest('.sidebar')?.getBoundingClientRect();
      if (sidebarRect) {
        setContextMenuPosition({
          top: buttonRect.bottom - sidebarRect.top,
          left: buttonRect.left - sidebarRect.left - MENU_WIDTH + buttonRect.width,
        });
      } else {
         setContextMenuPosition({ top: buttonRect.bottom, left: buttonRect.left - MENU_WIDTH + buttonRect.width });
      }
      setActiveContextMenuSessionId(session.id);
      setCurrentSessionForMenu(session);
    }
  };

  const handleClickOutsideMenu = useCallback((event: MouseEvent) => {
    if (activeContextMenuSessionId && contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node) &&
        ellipsisRefs.current[activeContextMenuSessionId] && !ellipsisRefs.current[activeContextMenuSessionId]!.contains(event.target as Node)
    ) {
      setActiveContextMenuSessionId(null);
      setCurrentSessionForMenu(null);
    }
  }, [activeContextMenuSessionId]);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutsideMenu);
    return () => document.removeEventListener('mousedown', handleClickOutsideMenu);
  }, [handleClickOutsideMenu]);

  const handleStartEdit = () => {
    if (currentSessionForMenu) {
      setEditingSessionId(currentSessionForMenu.id);
      setEditingTitle(currentSessionForMenu.title);
      setActiveContextMenuSessionId(null);
    }
  };
  
  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setEditingTitle(e.target.value);
  
  const submitRename = async () => {
    if (editingSessionId && editingTitle.trim()) {
      await onRenameChatSession(editingSessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const handleEditInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); submitRename(); }
    else if (e.key === 'Escape') { e.preventDefault(); setEditingSessionId(null); setEditingTitle(''); }
  };
  
  const handleDelete = () => {
    if (currentSessionForMenu) {
      onRequestDeleteConfirmation(currentSessionForMenu.id, currentSessionForMenu.title);
      setActiveContextMenuSessionId(null);
    }
  };

  const groupedAndFilteredSessions = useMemo(() => {
    const sessionsToGroup = displayedSessions.filter(session => !session.id.startsWith("PENDING_"));
    return groupChatSessionsByDate(sessionsToGroup);
  }, [displayedSessions]);


  return (
    <aside className={`sidebar fixed top-0 left-0 h-full w-60 bg-[#2D2A32] text-[#EAE6F0] p-3 flex flex-col z-40 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      {/* Sidebar Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <button 
          onClick={onNewChat}
          className="flex items-center space-x-2.5 p-2 w-full text-left text-sm rounded-lg hover:bg-[#3c3a43] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#FF8DC7] animate-subtleBounceOnHover"
        >
          <IconNewChat className="w-5 h-5 text-[#FF8DC7]" />
          <span>New Chat</span>
        </button>
        <button onClick={onClose} className="p-1.5 text-[#A09CB0] hover:text-[#FF8DC7] md:hidden">
          <IconLayoutSidebar className="w-5 h-5" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative mb-2 flex-shrink-0">
        <IconSearch className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#A09CB0]" />
        <input
          type="text"
          placeholder="Search chats..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="w-full pl-8 pr-2 py-1.5 bg-[#232129] text-[#EAE6F0] placeholder-[#A09CB0] rounded-md text-xs border border-[#393641] focus:border-[#FF8DC7] focus:ring-1 focus:ring-[#FF8DC7] focus:outline-none"
        />
      </div>

      {/* Chat History List */}
      <nav className="flex-grow overflow-y-auto pr-1 -mr-1"> {/* Negative margin to hide scrollbar track, padding for content */}
        {isLoading && (
            <div className="flex justify-center items-center h-full">
                <div className="w-3 h-3 bg-[#FF8DC7] rounded-full animate-pulse" style={{animationDelay: '0s'}}></div>
                <div className="w-3 h-3 bg-[#FF8DC7] rounded-full animate-pulse mx-1" style={{animationDelay: '0.2s'}}></div>
                <div className="w-3 h-3 bg-[#FF8DC7] rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
            </div>
        )}
        {!isLoading && searchTerm && displayedSessions.length === 0 && !isSearching && (
          <p className="text-xs text-center text-[#A09CB0] py-4">No chats found for "{searchTerm}".</p>
        )}
        {!isLoading && !searchTerm && displayedSessions.length === 0 && (
          <p className="text-xs text-center text-[#A09CB0] py-4">No chat history yet.</p>
        )}

        {groupedAndFilteredSessions.map((group, groupIndex) => (
          group.chats.length > 0 && (
            <div key={group.heading} className="mb-2 last:mb-0">
              <h3 className="text-[11px] font-semibold text-[#A09CB0] px-2 py-1 uppercase tracking-wider">{group.heading}</h3>
              <ul>
                {group.chats.map((chat, chatIndex) => (
                  <ChatSessionItem
                    key={chat.id}
                    chat={chat}
                    isActive={activeChatId === chat.id}
                    isEditing={editingSessionId === chat.id}
                    editingTitle={editingTitle}
                    activeContextMenuSessionId={activeContextMenuSessionId}
                    onSelectChat={onSelectChat}
                    handleEllipsisClick={handleEllipsisClick}
                    handleEditInputChange={handleEditInputChange}
                    handleEditInputKeyDown={handleEditInputKeyDown}
                    submitRename={submitRename}
                    ellipsisRefs={ellipsisRefs}
                    animationDelay={`${(groupIndex * 5 + chatIndex) * 30}ms`} 
                  />
                ))}
              </ul>
            </div>
          )
        ))}
      </nav>

      {/* Context Menu */}
      {activeContextMenuSessionId && currentSessionForMenu && contextMenuPosition && (
        <div
          ref={contextMenuRef}
          className="absolute bg-[#393641] rounded-lg shadow-xl py-1.5 z-50 animate-scaleIn"
          style={{ top: contextMenuPosition.top, left: contextMenuPosition.left, width: `${MENU_WIDTH}px` }}
          role="menu" aria-orientation="vertical" aria-labelledby={`ellipsis-button-${currentSessionForMenu.id}`}
        >
          <button
            onClick={handleStartEdit}
            className="flex items-center w-full px-3 py-1.5 text-xs text-[#EAE6F0] hover:bg-[#4A4754] focus:bg-[#4A4754] focus:outline-none"
            role="menuitem"
          >
            <IconPencil className="w-3.5 h-3.5 mr-2.5" /> Rename
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center w-full px-3 py-1.5 text-xs text-[#FF6B6B] hover:bg-[#4A4754] focus:bg-[#4A4754] focus:outline-none"
            role="menuitem"
          >
            <IconTrash className="w-3.5 h-3.5 mr-2.5" /> Delete
          </button>
        </div>
      )}

      {/* Sidebar Footer */}
      <div className="mt-auto flex-shrink-0 border-t border-[#393641] pt-3">
        <div className="flex items-center justify-between p-2">
          <div className="flex items-center space-x-2">
            <IconHeart className="w-4 h-4 text-[#FFD1DC]" /> 
            <span className="text-xs font-medium text-[#EAE6F0]">{userName}</span>
          </div>
          <button
            onClick={onRequestLogoutConfirmation} 
            className="p-1.5 text-[#A09CB0] hover:text-[#FF6B6B] rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-[#FF6B6B] focus-visible:ring-offset-1 focus-visible:ring-offset-[#2D2A32]"
            aria-label="Log out"
          >
            <IconLogout className="w-4 h-4" /> 
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;