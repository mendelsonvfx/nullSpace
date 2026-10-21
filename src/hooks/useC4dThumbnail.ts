import { createEmbeddedThumbnailHook } from './createEmbeddedThumbnailHook';

// Cinema 4D stores the document preview as a JPEG in the file header (absent in files saved headless by c4dpy)
const c4d = createEmbeddedThumbnailHook('extract_c4d_thumbnail', 'c4d_thumb', 'C4D');

export const useC4dThumbnail = c4d.useThumbnail;
export const clearC4dThumbnailCache = c4d.clear;
export const clearAllC4dThumbnailCache = c4d.clearAll;
export const isC4dThumbnailCached = c4d.isCached;

if (typeof window !== 'undefined') {
  (window as any).clearAllC4dThumbnailCache = clearAllC4dThumbnailCache;
}
