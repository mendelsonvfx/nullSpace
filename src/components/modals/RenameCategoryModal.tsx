import { useState, useEffect } from 'react';
import { useModalBlur } from '../../hooks/useModalBlur';

interface RenameCategoryModalProps {
  isOpen: boolean;
  categoryName: string;
  onClose: () => void;
  onRename: (oldName: string, newName: string) => void;
}

export function RenameCategoryModal({ isOpen, categoryName, onClose, onRename }: RenameCategoryModalProps) {
  const [editedName, setEditedName] = useState(categoryName);
  const blurClass = useModalBlur();

  useEffect(() => {
    setEditedName(categoryName);
  }, [categoryName]);

  if (!isOpen) return null;

  const handleRename = () => {
    if (editedName.trim() && editedName.trim() !== categoryName) {
      onRename(categoryName, editedName.trim());
      onClose();
    }
  };

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
      if (editedName.trim() && editedName.trim() !== categoryName) {
        handleRename();
      } else {
        onClose();
      }
    }
    delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
  };

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 rounded-lg ${blurClass}`}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 max-w-sm w-full shadow-2xl animate-modal"
        onClick={(e) => e.stopPropagation()}
        data-modal-window
      >
        <h3 className="text-lg font-semibold mb-3">Rename Category</h3>
        <input
          type="text"
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename();
            if (e.key === 'Escape') onClose();
          }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm animate-button"
          >
            Cancel
          </button>
          <button
            onClick={handleRename}
            disabled={!editedName.trim() || editedName.trim() === categoryName}
            className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg transition-colors font-medium text-sm animate-button"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
