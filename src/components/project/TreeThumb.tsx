import { memo } from 'react';
import type React from 'react';
import type { ReactNode } from 'react';
import { ScrubBar } from '../ui/ScrubBar';
import { useMediaThumbnail, useScrubRow, useThumbVisibility } from '../../utils/mediaPreview';
import type { MediaItem, MediaKind, MediaThumb } from '../../utils/mediaPreview';

type ThumbSize = number | { width: number; height: number };

interface TreeThumbProps {
  /**
   * Thumbnail to show, loaded by the row (useMediaThumbnail). Leave undefined to let TreeThumb load its
   * own from `path` / `kind` / `modified` (images and videos only; sequences need the row's frames).
   */
  thumb?: MediaThumb | null;
  path?: string;
  modified?: number;
  kind?: MediaKind;
  /** Self-loading only: all parents open (rows of collapsed folders stay mounted at zero height) */
  active?: boolean;
  /** The usual icon, shown until a thumbnail is ready and when there is none */
  fallback: ReactNode;
  /** Slot size, px: square (default 20) or width × height (Render Output: 32 × 20) */
  size?: ThumbSize;
}

const dims = (size: ThumbSize | undefined) =>
  typeof size === 'number' ? { width: size, height: size } : size ?? { width: 20, height: 20 };

function ThumbSlot({ thumb, fallback, size, slotRef }: { thumb: MediaThumb | null; fallback: ReactNode; size?: ThumbSize; slotRef?: (el: HTMLDivElement | null) => void }) {
  const { width, height } = dims(size);
  return (
    <div ref={slotRef} className="-mx-px flex items-center justify-center flex-shrink-0" style={{ width, height }}>
      {thumb ? (
        <img
          src={thumb.dataUrl}
          alt=""
          draggable={false}
          className="object-cover rounded-[4px] select-none"
          style={{ width, height }}
        />
      ) : (
        fallback
      )}
    </div>
  );
}

function SelfLoadingThumb({ path, modified, kind, active, fallback, size }: TreeThumbProps) {
  const [ref, onScreen] = useThumbVisibility<HTMLDivElement>();
  const item: MediaItem | null = path ? { kind: kind === 'video' ? 'video' : 'image', path, name: '', modified } : null;
  const thumb = useMediaThumbnail(item, (active ?? true) && onScreen);
  return <ThumbSlot thumb={thumb} fallback={fallback} size={size} slotRef={ref} />;
}

const sizeKey = (size: ThumbSize | undefined) => {
  const d = dims(size);
  return `${d.width}x${d.height}`;
};

/** Media thumbnail in a row's icon slot (Project Structure, Render Output) */
export const TreeThumb = memo(
  function TreeThumb(props: TreeThumbProps) {
    if (props.thumb !== undefined) return <ThumbSlot thumb={props.thumb} fallback={props.fallback} size={props.size} />;
    return <SelfLoadingThumb {...props} />;
  },
  // The fallback icon is a new element on every render but always the same icon for a row
  (a, b) =>
    a.thumb === b.thumb &&
    a.path === b.path &&
    a.modified === b.modified &&
    a.kind === b.kind &&
    a.active === b.active &&
    sizeKey(a.size) === sizeKey(b.size)
);

type DivProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onMouseEnter' | 'onMouseMove' | 'onMouseLeave'>;

interface TreeMediaRowProps extends DivProps {
  /** What the row previews; null: a plain row (folders, other files, previews off) */
  item: MediaItem | null;
  /** All parent folders open */
  active: boolean;
  /** Row content; gets the thumbnail for the icon slot */
  children: (thumb: MediaThumb | null) => ReactNode;
}

/**
 * A Project Structure row that previews media: loads its thumbnail while on screen, scrubs videos on hover,
 * opens the hover popup (MediaPreviewHost) and draws the playback bar. With `item` null it's a plain row.
 */
export function TreeMediaRow({ item, active, className, onMouseDown, children, ...rest }: TreeMediaRowProps) {
  const [ref, onScreen] = useThumbVisibility<HTMLDivElement>();
  const thumb = useMediaThumbnail(item, active && onScreen);
  const { rowHandlers, barRef, scrubbable } = useScrubRow(item, thumb);
  if (!item) {
    return (
      <div className={className} onMouseDown={onMouseDown} {...rest}>
        {children(null)}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${className ?? ''}`}
      {...rest}
      onMouseEnter={rowHandlers.onMouseEnter}
      onMouseMove={rowHandlers.onMouseMove}
      onMouseLeave={rowHandlers.onMouseLeave}
      onMouseDown={(e) => {
        rowHandlers.onMouseDown(e);
        onMouseDown?.(e);
      }}
    >
      {children(thumb)}
      {scrubbable && <ScrubBar barRef={barRef} />}
    </div>
  );
}
