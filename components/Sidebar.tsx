
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { IconSidebarClose, IconHeart, IconSearch, IconPencil, IconEllipsisVertical, IconTrash, IconNewChat } from '../constants';
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

const Sidebar: React.FC<SidebarProps> = ({
  isOpen, onClose, onNewChat, chatSessions, activeChatId, onSelectChat,
  onRequestDeleteConfirmation, onRenameChatSession, isLoading
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [displayedSessions, setDisplayedSessions] = useState<ChatSession[]>(chatSessions);
  const [isSearching, setIsSearching] = useState(false);

  const [activeContextMenuSessionId, setActiveContextMenuSessionId] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const ellipsisRefs = useRef<Record<string, HTMLButtonElement | null>>({});


  useEffect(() => {
    if (!searchTerm.trim()) {
      setDisplayedSessions(chatSessions);
    }
  }, [chatSessions, searchTerm]);

  const performSearch = useCallback(async (term: string) => {
    const trimmedTerm = term.trim();
    if (!trimmedTerm) {
      setDisplayedSessions(chatSessions); setIsSearching(false); return;
    }
    setIsSearching(true);
    try {
      const response = await fetch('/api/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchTerm: trimmedTerm }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Search failed: ${errorData.error || response.statusText}`);
      }
      setDisplayedSessions(await response.json());
    } catch (error) {
      console.error("Error fetching search results:", error); setDisplayedSessions([]);
    } finally { setIsSearching(false); }
  }, [chatSessions]);

  const debouncedSearch = useMemo(() => debounce(performSearch, 300), [performSearch]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    if (!term.trim()) { setDisplayedSessions(chatSessions); setIsSearching(false); }
    debouncedSearch(term);
  };

  const handleEllipsisClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const buttonElement = ellipsisRefs.current[sessionId];
    if (buttonElement) {
        const rect = buttonElement.getBoundingClientRect();
        setContextMenuPosition({ top: rect.bottom + window.scrollY + 5, left: rect.left + window.scrollX - 120 }); // Position below and slightly to the left
    }
    setActiveContextMenuSessionId(sessionId === activeContextMenuSessionId ? null : sessionId);
  };
  
  const closeContextMenu = useCallback(() => {
    setActiveContextMenuSessionId(null);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        closeContextMenu();
      }
    };
    if (activeContextMenuSessionId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeContextMenuSessionId, closeContextMenu]);

  const handleRename = (sessionId: string, currentTitle: string) => {
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
    closeContextMenu();
  };

  const submitRename = async () => {
    if (editingSessionId && editingTitle.trim()) {
      try {
        await onRenameChatSession(editingSessionId, editingTitle.trim());
      } catch (error) {
        console.error("Failed to rename chat session:", error);
        // Optionally, revert title or show error to user
      }
    }
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingTitle(e.target.value);
  };

  const handleEditInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submitRename();
    if (e.key === 'Escape') {
      setEditingSessionId(null); setEditingTitle('');
    }
  };

  const groupedSessions = groupChatSessionsByDate(displayedSessions);

  return (
    <div
      className={`sidebar fixed top-0 left-0 h-full w-56 sm:w-64 bg-[#2D2A32] text-[#EAE6F0] p-5 z-40 transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`} role="dialog" aria-modal="true" aria-hidden={!isOpen}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4 pt-1">
          <IconHeart className="w-7 h-7 text-[#FF8DC7]" />
          <div className="relative group">
            <button onClick={onClose} className="p-1 text-[#A09CB0] hover:text-[#FF8DC7]" aria-label="Close sidebar">
              <IconSidebarClose className="w-6 h-6" />
            </button>
            <span className="absolute right-0 top-full mt-2 w-max px-2 py-1 bg-[#393641] text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Close sidebar</span>
          </div>
        </div>

        <button onClick={onNewChat} className="w-full flex items-center text-left p-3 mb-3 rounded-lg hover:bg-[#4A4754] transition-colors focus:outline-none focus:ring-2 focus:ring-[#FF8DC7] focus:ring-offset-2 focus:ring-offset-[#2D2A32]" aria-label="Start a new chat">
          <IconNewChat className="w-5 h-5 mr-3 text-[#EAE6F0]" />
          <span className="text-md font-normal text-[#EAE6F0]">New chat</span>
        </button>

        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <IconSearch className="w-4 h-4 text-[#A09CB0]" />
          </div>
          <input type="text" placeholder="Search chats" value={searchTerm} onChange={handleSearchChange} className="w-full p-2.5 pl-10 bg-[#4A4754] text-[#EAE6F0] placeholder-[#A09CB0] rounded-md text-sm border border-[#5A5666] focus:outline-none focus:border-[#FF8DC7] focus:ring-1 focus:ring-[#FF8DC7]" aria-label="Search chat history"/>
        </div>

        <div className="flex-grow overflow-y-auto pr-1 mb-4">
          {isSearching ? <p className="text-xs text-[#A09CB0] px-1 py-2 text-center">Searching chats...</p>
            : isLoading && !searchTerm.trim() ? <p className="text-xs text-[#A09CB0] px-1 py-2 text-center">Loading chats...</p>
            : displayedSessions.length > 0 ? (
              groupedSessions.map(group => (
                <div key={group.heading} className="mb-3">
                  <h3 className="text-xs text-[#A09CB0] uppercase font-semibold mb-1 mt-3 px-1">{group.heading}</h3>
                  <ul>
                    {group.chats.map((chat, index) => (
                      <li key={chat.id} className="relative group flex items-center justify-between px-1 hover:bg-[#3c3a43] rounded-md animate-fadeInSlideUp" style={{ animationDelay: `${index * 0.03}s` }}>
                        {editingSessionId === chat.id ? (
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={handleEditInputChange}
                            onKeyDown={handleEditInputKeyDown}
                            onBlur={submitRename}
                            autoFocus
                            className="flex-grow min-w-0 p-2 my-0.5 bg-[#5A5666] text-[#FF8DC7] rounded-md text-sm border border-[#FF8DC7] focus:outline-none focus:ring-1 focus:ring-[#FF8DC7]"
                          />
                        ) : (
                          <button onClick={() => onSelectChat(chat.id)} className={`flex-grow min-w-0 text-left p-2 my-0.5 rounded-md truncate transition-opacity text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8DC7] focus:ring-offset-1 focus:ring-offset-[#2D2A32] ${activeChatId === chat.id ? 'bg-[#5A5666] font-semibold text-[#FF8DC7] opacity-100' : 'text-[#EAE6F0] opacity-75 group-hover:opacity-100'}`}>
                            {chat.title}
                          </button>
                        )}
                        {editingSessionId !== chat.id && (
                          <button
                            ref={el => ellipsisRefs.current[chat.id] = el}
                            onClick={(e) => handleEllipsisClick(e, chat.id)}
                            className="p-1.5 text-[#A09CB0] hover:text-[#FF8DC7] opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 flex-shrink-0"
                            aria-label={`More options for chat: ${chat.title}`}
                          >
                            <IconEllipsisVertical className="w-4 h-4" />
                          </button>
                        )}
                        {activeContextMenuSessionId === chat.id && contextMenuPosition && (
                          <div
                            ref={contextMenuRef}
                            className="context-menu absolute bg-[#2D2A32] border border-[#5A5666] rounded-md shadow-lg py-1 z-50"
                            style={{ top: `${contextMenuPosition.top}px`, left: `${contextMenuPosition.left}px`, width: '150px' }}
                          >
                            <button onClick={() => handleRename(chat.id, chat.title)} className="context-menu-item w-full text-left px-3 py-1.5 text-sm text-[#EAE6F0] hover:bg-[#4A4754] flex items-center">
                              <IconPencil className="w-4 h-4 mr-2.5" /> Rename
                            </button>
                            <button onClick={() => { onRequestDeleteConfirmation(chat.id, chat.title); closeContextMenu(); }} className="context-menu-item w-full text-left px-3 py-1.5 text-sm text-[#FF6B6B] hover:bg-[#4A4754] flex items-center">
                              <IconTrash className="w-4 h-4 mr-2.5" /> Delete
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : searchTerm.trim() ? <p className="text-xs text-[#A09CB0] px-1 py-2 text-center">No chats match your search.</p>
            : <p className="text-xs text-[#A09CB0] px-1 py-2 text-center">No chat history yet.</p>
          }
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
