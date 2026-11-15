import { useSyncExternalStore } from 'react';
import { HoverPreviewPopup } from './HoverPreviewPopup';
import { getMediaPopupVersion, getMediaPopupView, subscribeMediaPopup } from '../../utils/mediaPreview';
import type { MediaPopupView } from '../../utils/mediaPreview';

/** Longest side of the picture, px */
const MAX_SIDE = 224;
/** Shortest side, px: a panorama or a strip stays readable */
const MIN_SIDE = 48;
/** The popup is never narrower than its caption needs */
const MIN_WIDTH = 184;
const PADDING = 16; // p-2 on both sides
const CAPTION = 22;

/** Image caption size, as before in Project Structure: 1.23 MB */
function formatImageSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + units[i];
}

/** Video caption size: 24.5 MB */
function formatVideoSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** h:mm:ss from an hour on, m:ss below; `tenths` adds .t (below an hour) */
function formatTime(ms: number, tenths: boolean): string {
  const safe = Math.max(0, ms);
  if (safe >= 3600_000) {
    const s = Math.floor(safe / 1000);
    return `${Math.floor(s / 3600)}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
  }
  if (tenths) {
    const t = Math.floor(safe / 100); // tenths of a second
    const s = Math.floor(t / 10);
    return `${Math.floor(s / 60)}:${pad2(s % 60)}.${t % 10}`;
  }
  const s = Math.round(safe / 1000);
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

function captionOf(view: MediaPopupView): { left: string; right: string } {
  const dims = view.width && view.height ? `${view.width}×${view.height}` : null;
  if (view.mode === 'scrub' && view.kind === 'video') {
    const left =
      view.timeMs != null && view.durationMs != null
        ? `${formatTime(view.timeMs, true)} / ${formatTime(view.durationMs, view.durationMs < 10_000)}`
        : view.name;
    const right = [dims, view.size ? formatVideoSize(view.size) : null].filter(Boolean).join(' · ');
    return { left, right };
  }
  if (view.mode === 'scrub' && view.kind === 'sequence') {
    const left = view.frameNumber != null ? String(view.frameNumber) : view.name;
    const right = [view.frameCount != null ? `${view.frameCount} frames` : null, dims].filter(Boolean).join(' · ');
    return { left, right };
  }
  return {
    left: view.name,
    right: [dims, view.size != null ? formatImageSize(view.size) : null].filter(Boolean).join(' · '),
  };
}

/**
 * The one hover preview of the app (Project Structure, Render Output). Rows start and steer it through
 * useScrubRow; this only draws the current state: one <img> whose src is swapped per slot (a small data
 * URL decodes synchronously, so there's no flicker), in a box that keeps its size for the whole hover.
 */
export function MediaPreviewHost() {
  useSyncExternalStore(subscribeMediaPopup, getMediaPopupVersion);
  const view = getMediaPopupView();
  if (!view) return null;

  if (view.mode === 'hint') {
    const width = 264;
    return (
      <HoverPreviewPopup anchor={view.anchor} visible={view.visible} width={width} height={34}>
        <div className="px-1 py-0.5 text-[11px] leading-4 text-text-secondary">
          Video previews need ffmpeg — Settings → Data
        </div>
      </HoverPreviewPopup>
    );
  }

  if (!view.src) return null;
  const aspect = view.aspect > 0 && Number.isFinite(view.aspect) ? view.aspect : 16 / 9;
  const imageW = Math.max(MIN_SIDE, Math.round(aspect >= 1 ? MAX_SIDE : MAX_SIDE * aspect));
  const imageH = Math.max(MIN_SIDE, Math.round(aspect >= 1 ? MAX_SIDE / aspect : MAX_SIDE));
  const popupW = Math.max(imageW, MIN_WIDTH) + PADDING;
  const { left, right } = captionOf(view);

  return (
    <HoverPreviewPopup anchor={view.anchor} visible={view.visible} width={popupW} height={imageH + PADDING + CAPTION}>
      <div className="mx-auto rounded-[7px] overflow-hidden bg-black/40" style={{ width: imageW, height: imageH }}>
        <img src={view.src} alt="" draggable={false} className="block w-full h-full object-contain select-none" />
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5 px-0.5">
        <span className="text-[10px] font-mono text-text-secondary truncate tabular-nums">{left}</span>
        {right && <span className="text-[10px] text-text-muted flex-shrink-0 tabular-nums">{right}</span>}
      </div>
    </HoverPreviewPopup>
  );
}
