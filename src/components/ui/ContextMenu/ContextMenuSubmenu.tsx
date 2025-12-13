import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { ContextMenuSubmenuProps } from './types';

export function ContextMenuSubmenu({
  label,
  icon,
  disabled = false,
  children,
  className = ''
}: ContextMenuSubmenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'right' | 'left'>('right');
  const timeoutRef = useRef<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  const clearCloseTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    clearCloseTimeout();

    // Calculate position
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const submenuWidth = 180; // Approximate submenu width
      const windowWidth = window.innerWidth;

      // Check if submenu would overflow on the right
      if (rect.right + submenuWidth > windowWidth) {
        setPosition('left');
      } else {
        setPosition('right');
      }
    }

    setIsOpen(true);
  }, [clearCloseTimeout]);

  const handleMouseLeave = useCallback(() => {
    clearCloseTimeout();
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, [clearCloseTimeout]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const getSubmenuStyle = useCallback(() => {
    if (!buttonRef.current) return {};

    const rect = buttonRef.current.getBoundingClientRect();
    const submenuHeight = submenuRef.current?.offsetHeight || 200;
    const windowHeight = window.innerHeight;

    let top = 0; // Relative to parent button

    // Calculate if submenu would overflow at bottom
    if (rect.top + submenuHeight > windowHeight) {
      // Align to bottom of parent menu
      top = -(submenuHeight - rect.height);
    }

    if (position === 'right') {
      return {
        top,
        left: '100%',
        marginLeft: '4px'
      };
    } else {
      return {
        top,
        right: '100%',
        marginRight: '4px'
      };
    }
  }, [position]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        disabled={disabled}
        className={`
          w-full px-4 py-2 text-left text-sm flex items-center justify-between
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-700 cursor-pointer'}
          text-text-primary
          ${className}
        `}
      >
        <span className="flex items-center gap-2">
          {icon && <span className="w-4 h-4 flex items-center justify-center">{icon}</span>}
          <span>{label}</span>
        </span>
        <ChevronRight className="w-4 h-4 text-zinc-500" />
      </button>

      {isOpen && !disabled && (
        <div
          ref={submenuRef}
          className="absolute bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 min-w-[140px] max-w-[180px] z-[100] animate-context-menu"
          style={getSubmenuStyle()}
          onMouseEnter={clearCloseTimeout}
          onMouseLeave={handleMouseLeave}
        >
          {children}
        </div>
      )}
    </div>
  );
}
