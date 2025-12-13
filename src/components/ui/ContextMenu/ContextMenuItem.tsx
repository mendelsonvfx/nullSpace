import { Check } from 'lucide-react';
import { ContextMenuItemProps } from './types';

export function ContextMenuItem({
  icon,
  onClick,
  disabled = false,
  danger = false,
  checked,
  children,
  className = ''
}: ContextMenuItemProps) {
  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`
        w-full px-3 py-1.5 text-left text-sm flex items-center gap-2.5 rounded-md transition-colors
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'}
        ${danger ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10' : 'text-text-primary'}
        ${className}
      `}
    >
      {checked !== undefined ? (
        <span className="w-4 h-4 flex items-center justify-center">
          {checked && <Check className="w-4 h-4" />}
        </span>
      ) : icon ? (
        <span className="w-4 h-4 flex items-center justify-center opacity-80">
          {icon}
        </span>
      ) : null}
      <span className="flex-1">{children}</span>
    </button>
  );
}
