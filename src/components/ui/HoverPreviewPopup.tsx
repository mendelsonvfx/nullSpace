import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { HoverAnchor } from '../../hooks/useHoverPreview';

interface Props {
  anchor: HoverAnchor;
  visible: boolean;
  /** Popup width, px */
  width: number;
  /** Expected height, px: decides whether it fits above the anchor */
  height: number;
  children: ReactNode;
}

const GAP = 8;
const EDGE = 8;

/**
 * Floating preview next to a hovered element, styled like the task attachment preview:
 * above it when there is room, otherwise below, kept inside the window. Portaled to body so a faded
 * (hidden) row or an animating container doesn't change its look.
 */
export function HoverPreviewPopup({ anchor, visible, width, height, children }: Props) {
  const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - width - EDGE));
  const above = anchor.top > height + GAP + EDGE;
  const style = above
    ? { left, width, top: anchor.top - GAP, transform: 'translateY(-100%)' }
    : { left, width, top: anchor.bottom + GAP };

  return createPortal(
    <div
      className={`fixed z-[200] pointer-events-none p-2 bg-hover-bg border border-border-secondary rounded-[11px] shadow-2xl transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={style}
    >
      {children}
    </div>,
    document.body
  );
}
