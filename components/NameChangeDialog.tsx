import React, { useState, useEffect } from 'react';
import { IconClose } from '../constants';

interface NameChangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newName: string) => Promise<void>;
  currentName: string;
}

const NameChangeDialog: React.FC<NameChangeDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  currentName,
}) => {
  const [newName, setNewName] = useState(currentName);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setNewName(currentName);
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!newName.trim() || newName === currentName) {
      onClose();
      return;
    }
    setIsSaving(true);
    await onSave(newName.trim());
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 animate-fadeIn">
      <div 
        className="bg-[#393641] p-6 rounded-3xl shadow-2xl w-full max-w-sm border border-[#4A4754] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[#EAE6F0]">Change Name</h2>
          <button onClick={onClose} className="p-1 text-[#A09CB0] hover:text-[#FF8DC7]">
            <IconClose className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-xs text-[#A09CB0] mb-4">How should Suru address you?</p>
        
        <input
          autoFocus
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="Enter your name"
          className="w-full px-4 py-3 bg-[#4A4754] border border-[#5A5666] rounded-2xl text-[#EAE6F0] focus:outline-none focus:ring-2 focus:ring-[#FF8DC7] mb-6 transition-all"
        />

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-[#EAE6F0] bg-[#4A4754] hover:bg-[#53505F] rounded-2xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !newName.trim()}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-[#FF8DC7] hover:bg-opacity-90 rounded-2xl disabled:opacity-50 shadow-lg transition-all active:scale-95"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NameChangeDialog;
