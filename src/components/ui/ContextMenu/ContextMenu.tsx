import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useContextMenuStore } from '../../../store/contextMenuStore';
import { ContextMenuProps } from './types';

export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(({
  isOpen,
  position,
  onClose,
  children,
  menuId,
  className = '',
  onMenuRect
}, ref) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Expose the menu ref to parent components
  useImperativeHandle(ref, () => menuRef.current as HTMLDivElement, [isOpen]);

  // Call onMenuRect callback when menu is mounted and has dimensions
  useEffect(() => {
    if (isOpen && menuRef.current && onMenuRect) {
      // Use requestAnimationFrame to ensure the element is painted
      requestAnimationFrame(() => {
        if (menuRef.current) {
          onMenuRect(menuRef.current.getBoundingClientRect());
        }
      });
    }
  }, [isOpen, onMenuRect]);
  const { setActiveMenu } = useContextMenuStore();

  // Calculate safe position to prevent overflow
  const getPosition = useCallback(() => {
    if (!menuRef.current) {
      return { top: position.y, left: position.x };
    }

    const menuRect = menuRef.current.getBoundingClientRect();
    const menuHeight = menuRect.height || 200;
    const menuWidth = menuRect.width || 180;
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const margin = 10;

    let top = position.y;
    let left = position.x;

    // Prevent vertical overflow
    if (position.y + menuHeight > windowHeight) {
      top = windowHeight - menuHeight - margin;
    }

    // Prevent horizontal overflow
    if (position.x + menuWidth > windowWidth) {
      left = windowWidth - menuWidth - margin;
    }

    return { top, left };
  }, [position]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Small delay to prevent immediate close on the same click that opened the menu
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Set active menu in store
  useEffect(() => {
    if (isOpen && menuId) {
      setActiveMenu(menuId);
    }
    return () => {
      if (menuId) {
        setActiveMenu(null);
      }
    };
  }, [isOpen, menuId, setActiveMenu]);

  if (!isOpen) return null;

  const pos = getPosition();

  const menu = (
    <div
      ref={menuRef}
      className={`fixed bg-zinc-800/80 backdrop-blur-xl border border-zinc-600/50 rounded-xl shadow-2xl p-1.5 z-[100] min-w-[200px] animate-context-menu ${className}`}
      style={{
        top: pos.top,
        left: pos.left
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );

  return createPortal(menu, document.body);
});
