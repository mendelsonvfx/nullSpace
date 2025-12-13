import { createPortal } from 'react-dom';
import { IconCut, IconCopy, IconClipboard, IconSelectAll } from '@tabler/icons-react';
import { useGlobalTextContextMenu } from '../../../hooks/useGlobalTextContextMenu';
import { ContextMenuDivider } from './ContextMenuDivider';

export function GlobalTextContextMenu() {
  const {
    isOpen,
    position,
    hasSelection,
    hasClipboard,
    hasText,
    isReadOnly,
    handleCut,
    handleCopy,
    handlePaste,
    handleSelectAll,
  } = useGlobalTextContextMenu();

  if (!isOpen) return null;

  // Calculate safe position to prevent overflow
  const menuWidth = 180;
  const menuHeight = 160;
  const margin = 10;

  let top = position.y;
  let left = position.x;

  if (position.y + menuHeight > window.innerHeight) {
    top = window.innerHeight - menuHeight - margin;
  }

  if (position.x + menuWidth > window.innerWidth) {
    left = window.innerWidth - menuWidth - margin;
  }

  const menu = (
    <div
      className="fixed bg-zinc-800/80 backdrop-blur-xl border border-zinc-600/50 rounded-xl shadow-2xl p-1.5 z-[200] min-w-[160px] animate-context-menu"
      style={{ top, left }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Cut */}
      <button
        onClick={handleCut}
        disabled={!hasSelection || isReadOnly}
        className={`
          w-full px-3 py-1.5 text-left text-sm flex items-center gap-2.5 rounded-md transition-colors
          ${(!hasSelection || isReadOnly) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'}
          text-text-primary
        `}
      >
        <IconCut className="w-4 h-4 opacity-80" stroke={1.5} />
        <span className="flex-1">Cut</span>
        <span className="text-zinc-500 text-xs">Ctrl+X</span>
      </button>

      {/* Copy */}
      <button
        onClick={handleCopy}
        disabled={!hasSelection}
        className={`
          w-full px-3 py-1.5 text-left text-sm flex items-center gap-2.5 rounded-md transition-colors
          ${!hasSelection ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'}
          text-text-primary
        `}
      >
        <IconCopy className="w-4 h-4 opacity-80" stroke={1.5} />
        <span className="flex-1">Copy</span>
        <span className="text-zinc-500 text-xs">Ctrl+C</span>
      </button>

      {/* Paste */}
      <button
        onClick={handlePaste}
        disabled={!hasClipboard || isReadOnly}
        className={`
          w-full px-3 py-1.5 text-left text-sm flex items-center gap-2.5 rounded-md transition-colors
          ${(!hasClipboard || isReadOnly) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'}
          text-text-primary
        `}
      >
        <IconClipboard className="w-4 h-4 opacity-80" stroke={1.5} />
        <span className="flex-1">Paste</span>
        <span className="text-zinc-500 text-xs">Ctrl+V</span>
      </button>

      <ContextMenuDivider />

      {/* Select All */}
      <button
        onClick={handleSelectAll}
        disabled={!hasText}
        className={`
          w-full px-3 py-1.5 text-left text-sm flex items-center gap-2.5 rounded-md transition-colors
          ${!hasText ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'}
          text-text-primary
        `}
      >
        <IconSelectAll className="w-4 h-4 opacity-80" stroke={1.5} />
        <span className="flex-1">Select All</span>
        <span className="text-zinc-500 text-xs">Ctrl+A</span>
      </button>
    </div>
  );

  return createPortal(menu, document.body);
}
