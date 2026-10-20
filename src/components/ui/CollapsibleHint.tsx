import type { ReactNode } from 'react';

/**
 * Hint line that smoothly expands/collapses its height.
 * Animates grid-template-rows 0fr <-> 1fr, so the real content height is used — no fixed max-height.
 * Always rendered: place it inside the same wrapper as its field so parent `space-y-*` gaps don't apply to it.
 */
export function CollapsibleHint({ show, children, className = '' }: { show: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden={!show}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
        show ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="overflow-hidden">
        {/* Spacing lives inside the clipped box so it collapses together with the text */}
        <p className={`pt-1 text-xs text-red-400 ${className}`}>{children}</p>
      </div>
    </div>
  );
}
