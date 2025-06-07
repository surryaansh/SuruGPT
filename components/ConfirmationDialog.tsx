import React from 'react';
import { IconClose } from '../constants'; // IconTrash removed, will be passed via confirmButtonText

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode; 
  confirmButtonText?: React.ReactNode; // Optional, defaults to "Confirm"
  confirmButtonColorClass?: string; // Optional, defaults to red delete color
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText = "Confirm",
  confirmButtonColorClass = "bg-[#FF6B6B] hover:bg-[#E05252]",
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="dialog-overlay fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fadeIn" // Added animate-fadeIn
      onClick={onClose} 
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div 
        className="dialog-content bg-[#393641] p-6 rounded-lg shadow-xl w-full max-w-md transform transition-all animate-scaleIn" // Added animate-scaleIn
        onClick={(e) => e.stopPropagation()} 
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="dialog-title" className="text-xl font-semibold text-[#EAE6F0]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-[#A09CB0] hover:text-[#FF8DC7]"
            aria-label="Close dialog"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>
        <div className="text-[#C0BCCF] mb-6 text-sm">
          {message}
        </div>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#EAE6F0] bg-[#5A5666] hover:bg-[#4A4754] rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF8DC7] focus:ring-offset-2 focus:ring-offset-[#393641]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white ${confirmButtonColorClass} rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF8DC7] focus:ring-offset-2 focus:ring-offset-[#393641] flex items-center`}
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;