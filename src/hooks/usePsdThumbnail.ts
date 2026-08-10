import { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api';
import { indexedDBThumbnailCache } from '../utils/indexedDBCache';

const memoryCache = new Map<string, string>();
const mtimeCache  = new Map<string, number>();

const _focusSubs = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    _focusSubs.forEach(fn => { try { fn(); } catch {} });
  });
}

export function usePsdThumbnail(psdFilePath: string | undefined) {
  const cacheKey = useMemo(() => psdFilePath || null, [psdFilePath]);

  const [imageSrc, setImageSrc] = useState<string>(() => {
    if (!cacheKey) return '';
    return memoryCache.get(cacheKey) || '';
  });

  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    if (!cacheKey) return;
    const cb = () => { if (memoryCache.has(cacheKey)) setFocusTick(t => t + 1); };
    _focusSubs.add(cb);
    return () => { _focusSubs.delete(cb); };
  }, [cacheKey]);

  useEffect(() => {
    if (!psdFilePath || !cacheKey) {
      setImageSrc('');
      return;
    }

    let isMounted = true;

    async function loadThumbnail() {
      try {
        if (!psdFilePath || !cacheKey) return;

        // Skip IPC on normal mount/remount if memory cache is already warm.
        // focusTick is 0 on every mount and only > 0 after a window focus event.
        const memCached = memoryCache.get(cacheKey);
        if (memCached && focusTick === 0) {
          if (isMounted) setImageSrc(memCached);
          return;
        }

        let currentMtime: number | null = null;
        try {
          currentMtime = await invoke<number>('get_file_mtime', { path: psdFilePath });
        } catch { /* file inaccessible — proceed with cache */ }

        const cachedMtime = mtimeCache.get(cacheKey);
        const mtimeChanged =
          currentMtime !== null &&
          cachedMtime  !== undefined &&
          cachedMtime  !== currentMtime;

        if (mtimeChanged) {
          memoryCache.delete(cacheKey);
          mtimeCache.delete(cacheKey);
          await indexedDBThumbnailCache.clear(psdFilePath, 'psd_thumb');
        }

        if (!mtimeChanged) {
          const memCached = memoryCache.get(cacheKey);
          if (memCached) {
            if (isMounted) setImageSrc(memCached);
            return;
          }

          const idbCached = await indexedDBThumbnailCache.get(psdFilePath, 'psd_thumb');
          if (idbCached) {
            memoryCache.set(cacheKey, idbCached);
            if (currentMtime !== null) mtimeCache.set(cacheKey, currentMtime);
            if (isMounted) setImageSrc(idbCached);
            return;
          }
        }

        console.log('[PSD Thumbnail] Extracting from:', psdFilePath);
        const result = await invoke<string | null>('extract_psd_thumbnail', {
          path: psdFilePath
        });

        if (!result) {
          console.log('[PSD Thumbnail] No thumbnail found in file');
          if (isMounted) setImageSrc('');
          return;
        }

        console.log('[PSD Thumbnail] Extracted successfully, length:', result.length);

        await indexedDBThumbnailCache.set(psdFilePath, 'psd_thumb', result);
        memoryCache.set(cacheKey, result);
        if (currentMtime !== null) mtimeCache.set(cacheKey, currentMtime);

        if (isMounted) setImageSrc(result);
      } catch (error) {
        console.error('[PSD Thumbnail] Failed to extract:', error);
        if (isMounted) setImageSrc('');
      }
    }

    loadThumbnail();

    return () => {
      isMounted = false;
    };
  }, [psdFilePath, cacheKey, focusTick]);

  return imageSrc;
}

export function clearPsdThumbnailCache(psdFilePath: string) {
  memoryCache.delete(psdFilePath);
  mtimeCache.delete(psdFilePath);
  indexedDBThumbnailCache.clear(psdFilePath, 'psd_thumb');
}

export function clearAllPsdThumbnailCache() {
  memoryCache.clear();
  mtimeCache.clear();
}

export function isPsdThumbnailCached(psdFilePath: string): boolean {
  return memoryCache.has(psdFilePath);
}

if (typeof window !== 'undefined') {
  (window as any).clearAllPsdThumbnailCache = clearAllPsdThumbnailCache;
}
