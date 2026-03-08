import { useState } from 'react';
import { useModalBlur } from '../../hooks/useModalBlur';

interface AddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}

export function AddCategoryModal({ isOpen, onClose, onAdd }: AddCategoryModalProps) {
  const [categoryName, setCategoryName] = useState('');
  const blurClass = useModalBlur();

  if (!isOpen) return null;

  const handleAdd = () => {
    if (categoryName.trim()) {
      onAdd(categoryName.trim());
      setCategoryName('');
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
      if (categoryName.trim()) {
        handleAdd();
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
        <h3 className="text-lg font-semibold mb-3">Add Category</h3>
        <input
          type="text"
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="Category name..."
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
            onClick={handleAdd}
            disabled={!categoryName.trim()}
            className="px-3 py-1.5 bg-gradient-to-br from-accent to-accent-hover disabled:opacity-40 rounded-button transition-colors font-medium text-sm text-white animate-button"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
