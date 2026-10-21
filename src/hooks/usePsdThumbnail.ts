import { createEmbeddedThumbnailHook } from './createEmbeddedThumbnailHook';

const psd = createEmbeddedThumbnailHook('extract_psd_thumbnail', 'psd_thumb', 'PSD');

export const usePsdThumbnail = psd.useThumbnail;
export const clearPsdThumbnailCache = psd.clear;
export const clearAllPsdThumbnailCache = psd.clearAll;
export const isPsdThumbnailCached = psd.isCached;

if (typeof window !== 'undefined') {
  (window as any).clearAllPsdThumbnailCache = clearAllPsdThumbnailCache;
}
