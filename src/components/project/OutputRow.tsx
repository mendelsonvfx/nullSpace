import { memo, useMemo } from 'react';
import type React from 'react';
import { File as FileIcon } from 'lucide-react';
import type { OutputFile } from '../../utils/outputsCache';
import {
  useMediaThumbnail,
  useThumbVisibility,
  useScrubRow,
  type MediaItem,
  type PreviewFrame,
} from '../../utils/mediaPreview';
import { getExtensionIcon, isPreviewImage, isPreviewVideo } from '../../utils/fileIcons';
import { ScrubBar } from '../ui/ScrubBar';

// Image sequence formats that should be checked for missing frames
export const IMAGE_SEQUENCE_FORMATS = [
  'png', 'jpg', 'jpeg', 'exr', 'dpx', 'tif', 'tiff',
  'tga', 'bmp', 'hdr', 'pic', 'psd', 'sgi', 'rgb'
];

/** Stable row key: the backend id; old cached entries (no id) fall back to the path (+ name for sequences sharing a folder) */
export function outputRowId(output: OutputFile): string {
  return output.id ?? (output.is_sequence ? `${output.path}\0${output.name}` : output.path);
}

/**
 * Cheap signature of preview_frames for memo: count + first and last frame. While a sequence renders,
 * the list changes every reload; the first frame (thumbnail) stays, the last one moves.
 */
export function previewFramesSignature(frames: PreviewFrame[] | undefined): string {
  if (!frames || frames.length === 0) return '';
  const first = frames[0];
  const last = frames[frames.length - 1];
  return `${frames.length}|${first.name}|${first.modified}|${last.name}|${last.modified}`;
}

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() || '';

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export interface OutputRowProps {
  id: string;
  name: string;
  path: string;
  isSequence: boolean;
  size: number;
  /** ms (file time, or the newest frame of a sequence) */
  modified: number | undefined;
  /** s */
  createdAt: number;
  frameCount: number | undefined;
  missingFrames: string | undefined;
  /** Not compared by memo — `framesSig` stands for it */
  previewFrames: PreviewFrame[] | undefined;
  framesSig: string;
  /** Muted path before the name ("" when none), computed by the parent */
  prefix: string;
  /** Group expanded (ungrouped rows: always) — rows of a collapsed group load nothing */
  active: boolean;
  previewsEnabled: boolean;
  onOpen: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onDragStart: (e: React.MouseEvent<HTMLElement>, id: string) => void;
}

function buildMediaItem(p: OutputRowProps): MediaItem | null {
  if (!p.previewsEnabled) return null;
  if (p.isSequence) {
    // Image sequence: thumbnail = first frame, scrubbing over up to 16 frames (path = sequence folder)
    if (!isPreviewImage(p.name) || !p.previewFrames || p.previewFrames.length === 0) return null;
    return {
      kind: 'sequence',
      path: p.path,
      name: p.name,
      // The first frame's time, not the sequence's: it stays put while the sequence is still rendering
      modified: p.previewFrames[0].modified,
      frames: p.previewFrames,
      frameCount: p.frameCount,
    };
  }
  if (isPreviewImage(p.name)) return { kind: 'image', path: p.path, name: p.name, modified: p.modified, size: p.size };
  if (isPreviewVideo(p.name)) return { kind: 'video', path: p.path, name: p.name, modified: p.modified, size: p.size };
  return null;
}

function OutputRowImpl(props: OutputRowProps) {
  const {
    id, name, path, isSequence, size, modified, createdAt, frameCount, missingFrames,
    framesSig, prefix, active, previewsEnabled, onOpen, onContextMenu, onDragStart,
  } = props;

  // Rebuilt only when what the preview depends on changes (previewFrames is read through framesSig)
  const item = useMemo(
    () => buildMediaItem(props),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewsEnabled, isSequence, path, name, modified, size, frameCount, framesSig]
  );

  const [slotRef, onScreen] = useThumbVisibility<HTMLDivElement>();
  const thumb = useMediaThumbnail(item, active && onScreen);
  const { rowHandlers, barRef, scrubbable } = useScrubRow(item, thumb);

  const ext = extOf(name);
  const icon = getExtensionIcon(name) ?? <FileIcon className="w-4 h-4 text-zinc-500 flex-shrink-0" strokeWidth={1.5} />;
  const showFrameInfo = isSequence && !!frameCount && IMAGE_SEQUENCE_FORMATS.includes(ext);

  return (
    <button
      onDoubleClick={() => onOpen(id)}
      onContextMenu={(e) => onContextMenu(e, id)}
      onMouseEnter={rowHandlers.onMouseEnter}
      onMouseMove={rowHandlers.onMouseMove}
      onMouseLeave={rowHandlers.onMouseLeave}
      onMouseDown={(e) => {
        rowHandlers.onMouseDown(e);
        onDragStart(e, id);
      }}
      className="relative overflow-hidden w-full text-left px-3 py-3 rounded-lg bg-[#181818] hover:bg-[#1e1e1e] transition-colors group"
    >
      <div className="flex items-center justify-between gap-3">
        <div ref={slotRef} className="w-8 h-5 flex items-center justify-center flex-shrink-0">
          {thumb ? (
            <img
              src={thumb.dataUrl}
              alt=""
              draggable={false}
              className="w-8 h-5 object-cover rounded-[3px] select-none"
            />
          ) : (
            icon
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-text-primary group-hover:text-white transition-colors truncate block">
            {prefix && <span className="text-text-muted">{prefix}</span>}
            {name}
          </span>
          {showFrameInfo && (
            <span className="text-xs text-text-muted">
              {frameCount} frames
              {missingFrames && (
                <> | <span className="text-amber-500">Missing: {missingFrames}</span></>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted flex-shrink-0">
          <span>{formatFileSize(size)}</span>
          <span>{formatDate(createdAt)}</span>
        </div>
      </div>
      {scrubbable && <ScrubBar barRef={barRef} />}
    </button>
  );
}

/** Memo by primitives: preview_frames is compared through its signature, handlers are stable (look the row up by id) */
function rowPropsEqual(a: OutputRowProps, b: OutputRowProps): boolean {
  for (const key in a) {
    if (key === 'previewFrames') continue;
    if (!Object.is(a[key as keyof OutputRowProps], b[key as keyof OutputRowProps])) return false;
  }
  return true;
}

export const OutputRow = memo(OutputRowImpl, rowPropsEqual);
