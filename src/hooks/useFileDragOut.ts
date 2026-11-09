import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { invoke } from '@tauri-apps/api/tauri';

// Windows' default drag threshold (SM_CXDRAG / SM_CYDRAG)
const DRAG_THRESHOLD_PX = 4;

// Elements inside a draggable row that keep their own click (hide button, links, inputs)
const INTERACTIVE = 'button,a,input,textarea,select,[contenteditable],[data-no-drag]';

// One gesture at a time across the whole app: tracking a press, or a system drag in progress
let gestureActive = false;

/**
 * Drag a file out of nullSpace into other apps (Explorer, Discord, …) as a regular file.
 * Pass `startTracking(e, path)` to a row's onMouseDown: a press that moves past the threshold
 * with the left button held hands the file to the system drag (`start_file_drag`). Clicks,
 * double-clicks and the context menu are untouched.
 */
export function useFileDragOut(onError?: (message: string) => void) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Unmounted mid-press (e.g. a version card re-keyed by the watcher): stop tracking
  useEffect(() => () => cleanupRef.current?.(), []);

  return useCallback((e: React.MouseEvent<HTMLElement>, path: string) => {
    if (e.button !== 0 || e.detail > 1 || gestureActive || !path) return;
    const hit = (e.target as Element | null)?.closest?.(INTERACTIVE);
    if (hit && hit !== e.currentTarget) return;

    gestureActive = true;
    const startX = e.clientX;
    const startY = e.clientY;

    const cleanup = (endGesture: boolean) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('blur', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('dragstart', onHtmlDrag, true);
      cleanupRef.current = null;
      if (endGesture) gestureActive = false;
    };
    const onEnd = () => cleanup(true);
    // Chromium's own HTML drag (an image, a link) must not start instead of ours
    const onHtmlDrag = (ev: DragEvent) => ev.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!(ev.buttons & 1)) {
        cleanup(true);
        return;
      }
      if (Math.abs(ev.clientX - startX) <= DRAG_THRESHOLD_PX && Math.abs(ev.clientY - startY) <= DRAG_THRESHOLD_PX) return;
      cleanup(false);
      // Resolves once the file is dropped somewhere or the drag is cancelled
      invoke<boolean>('start_file_drag', { path })
        .catch((error) => {
          const message = String(error);
          if (message === 'busy') return;
          if (onErrorRef.current) onErrorRef.current(message);
          else console.warn('[FileDrag]', message);
        })
        .finally(() => {
          gestureActive = false;
        });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('blur', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('dragstart', onHtmlDrag, true);
    cleanupRef.current = onEnd;
  }, []);
}
