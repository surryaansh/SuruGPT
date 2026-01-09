import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import { IconLayoutSidebar, IconHeart, IconSearch, IconPencil, IconEllipsisVertical, IconTrash, IconNewChat } from '../constants';
import { ChatSession } from '../types';
import { debounce } from '../utils/helpers';

interface SidebarProps {
  isOpen: boolean; onClose: () => void; onNewChat: () => void;
  chatSessions: ChatSession[]; activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onRequestDeleteConfirmation: (sessionId: string, sessionTitle: string) => void;
  onRenameChatSession: (sessionId: string, newTitle: string) => Promise<void>;
  isLoading?: boolean; onLogout: () => void;
  onRequestNameChange: () => void; // New prop
  userName: string; ownerUID: string;
}

const groupSessions = (sessions: ChatSession[]) => {
  const groups: Record<string, ChatSession[]> = { Today: [], Yesterday: [], 'Recent': [], 'Older': [] };
  const now = new Date();
  sessions.forEach(s => {
    const d = s.createdAt instanceof Date ? s.createdAt : (s.createdAt as Timestamp).toDate();
    const diff = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);
    if (diff < 1) groups.Today.push(s);
    else if (diff < 2) groups.Yesterday.push(s);
    else if (diff < 7) groups.Recent.push(s);
    else groups.Older.push(s);
  });
  return Object.entries(groups).filter(([_, chats]) => chats.length > 0);
};

const Sidebar: React.FC<SidebarProps> = ({
  isOpen, onClose, onNewChat, chatSessions, activeChatId, onSelectChat,
  onRequestDeleteConfirmation, onRenameChatSession,
  onLogout, onRequestNameChange, userName
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtered, setFiltered] = useState(chatSessions);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setFiltered(chatSessions); }, [chatSessions]);

  const debouncedFilter = useMemo(() => debounce((term: string) => {
    const t = term.toLowerCase();
    setFiltered(chatSessions.filter(s => s.title.toLowerCase().includes(t)));
  }, 300), [chatSessions]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    debouncedFilter(e.target.value);
  };

  const openMenu = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 5, left: rect.left - 100 });
    setActiveMenuId(session.id);
  };

  const submitRename = async () => {
    if (editingId && editTitle.trim()) {
      await onRenameChatSession(editingId, editTitle);
    }
    setEditingId(null);
  };

  const grouped = useMemo(() => groupSessions(filtered), [filtered]);

  return (
    <>
      <div className={`sidebar fixed top-0 left-0 h-full w-52 sm:w-60 bg-[#2D2A32] text-[#EAE6F0] p-4 z-40 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300`}>
        <div className="flex flex-col h-full">
          <button onClick={onNewChat} className="w-full flex items-center p-2.5 mb-4 rounded-lg hover:bg-[#4A4754] transition-colors">
            <IconNewChat className="w-4 h-4 mr-2" /> <span className="text-sm">New chat</span>
          </button>
          <div className="relative mb-4">
            <IconSearch className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#A09CB0]" />
            <input type="text" placeholder="Search chats" value={searchTerm} onChange={handleSearch} className="w-full p-2 pl-8 bg-[#4A4754] text-xs rounded-md border border-[#5A5666]" />
          </div>
          <div className="flex-grow overflow-y-auto">
            {grouped.map(([heading, chats]) => (
              <div key={heading} className="mb-4">
                <h3 className="text-[10px] text-[#A09CB0] uppercase font-bold mb-1 px-1">{heading}</h3>
                {chats.map(chat => (
                  <div key={chat.id} onClick={() => onSelectChat(chat.id)} className={`group relative flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs mb-0.5 ${activeChatId === chat.id ? 'bg-[#4A4754] text-[#FF8DC7]' : 'hover:bg-[#3c3a43]'}`}>
                    {editingId === chat.id ? (
                      <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={submitRename} onKeyDown={e => e.key === 'Enter' && submitRename()} className="bg-transparent border-none outline-none w-full" />
                    ) : (
                      <span className="truncate flex-grow">{chat.title}</span>
                    )}
                    <button onClick={e => openMenu(e, chat)} className="opacity-0 group-hover:opacity-100 p-1"><IconEllipsisVertical className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-auto border-t border-[#393641] pt-3">
            <div className="flex items-center justify-between mb-2">
              <button 
                onClick={onRequestNameChange}
                className="group/name flex items-center truncate flex-grow p-1 rounded-lg hover:bg-[#4A4754] transition-all"
                title="Click to change name"
              >
                <IconHeart className="w-4 h-4 text-[#FFD1DC] mr-2 flex-shrink-0" />
                <span className="text-xs truncate font-medium group-hover/name:text-[#FF8DC7]">{userName}</span>
              </button>
            </div>
            <div className="flex justify-end">
              <button onClick={onLogout} className="text-[10px] text-[#A09CB0] hover:text-[#FF8DC7] px-1">Logout</button>
            </div>
          </div>
        </div>
      </div>
      {activeMenuId && menuPos && (
        <div ref={menuRef} className="fixed bg-[#201F23] rounded shadow-xl py-1 z-50 text-xs w-28" style={{ top: menuPos.top, left: menuPos.left }}>
          <button onClick={() => { setEditingId(activeMenuId); setEditTitle(filtered.find(s=>s.id===activeMenuId)?.title || ""); setActiveMenuId(null); }} className="w-full text-left px-3 py-2 hover:bg-[#393641]">Rename</button>
          <button onClick={() => { const s = filtered.find(x=>x.id===activeMenuId); if(s) onRequestDeleteConfirmation(s.id, s.title); setActiveMenuId(null); }} className="w-full text-left px-3 py-2 hover:bg-[#393641] text-[#FF8DC7]">Delete</button>
        </div>
      )}
    </>
  );
};

export default Sidebar;
