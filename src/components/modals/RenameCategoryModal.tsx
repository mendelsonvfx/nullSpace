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
        className="bg-card-bg border border-border-secondary rounded-card p-5 max-w-sm w-full shadow-2xl animate-modal"
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
          className="w-full bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 mb-4 text-sm focus:outline-none focus:border-accent"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button transition-colors text-sm animate-button"
          >
            Cancel
          </button>
          <button
            onClick={handleRename}
            disabled={!editedName.trim() || editedName.trim() === categoryName}
            className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-button transition-colors font-medium text-sm text-white animate-button"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
