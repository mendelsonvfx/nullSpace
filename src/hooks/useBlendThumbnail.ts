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

export function useBlendThumbnail(blendFilePath: string | undefined) {
  const cacheKey = useMemo(() => blendFilePath || null, [blendFilePath]);

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
    if (!blendFilePath || !cacheKey) {
      setImageSrc('');
      return;
    }

    let isMounted = true;

    async function loadThumbnail() {
      try {
        if (!blendFilePath || !cacheKey) return;

        // Skip IPC on normal mount/remount if memory cache is already warm.
        // focusTick is 0 on every mount and only > 0 after a window focus event.
        const memCached = memoryCache.get(cacheKey);
        if (memCached && focusTick === 0) {
          if (isMounted) setImageSrc(memCached);
          return;
        }

        let currentMtime: number | null = null;
        try {
          currentMtime = await invoke<number>('get_file_mtime', { path: blendFilePath });
        } catch { /* file inaccessible — proceed with cache */ }

        const cachedMtime = mtimeCache.get(cacheKey);
        const mtimeChanged =
          currentMtime !== null &&
          cachedMtime  !== undefined &&
          cachedMtime  !== currentMtime;

        if (mtimeChanged) {
          memoryCache.delete(cacheKey);
          mtimeCache.delete(cacheKey);
          await indexedDBThumbnailCache.clear(blendFilePath, 'blend_thumb');
        }

        if (!mtimeChanged) {
          const memCached = memoryCache.get(cacheKey);
          if (memCached) {
            if (isMounted) setImageSrc(memCached);
            return;
          }

          const cached = await indexedDBThumbnailCache.get(blendFilePath, 'blend_thumb');
          if (cached) {
            memoryCache.set(cacheKey, cached);
            if (currentMtime !== null) mtimeCache.set(cacheKey, currentMtime);
            if (isMounted) setImageSrc(cached);
            return;
          }
        }

        console.log('[Blend Thumbnail] Extracting from:', blendFilePath);
        const result = await invoke<string | null>('extract_blend_thumbnail', {
          path: blendFilePath
        });

        if (!result) {
          console.log('[Blend Thumbnail] No thumbnail found in file');
          if (isMounted) setImageSrc('');
          return;
        }

        console.log('[Blend Thumbnail] Extracted successfully, length:', result.length);

        await indexedDBThumbnailCache.set(blendFilePath, 'blend_thumb', result);
        memoryCache.set(cacheKey, result);
        if (currentMtime !== null) mtimeCache.set(cacheKey, currentMtime);

        if (isMounted) setImageSrc(result);
      } catch (error) {
        console.error('[Blend Thumbnail] Failed to extract:', error);
        if (isMounted) setImageSrc('');
      }
    }

    loadThumbnail();

    return () => {
      isMounted = false;
    };
  }, [blendFilePath, cacheKey, focusTick]);

  return imageSrc;
}

export function clearBlendThumbnailCache(blendFilePath: string) {
  memoryCache.delete(blendFilePath);
  mtimeCache.delete(blendFilePath);
  indexedDBThumbnailCache.clear(blendFilePath, 'blend_thumb');
}

export function clearAllBlendThumbnailCache() {
  memoryCache.clear();
  mtimeCache.clear();
}

export function isBlendThumbnailCached(blendFilePath: string): boolean {
  return memoryCache.has(blendFilePath);
}

if (typeof window !== 'undefined') {
  (window as any).clearAllBlendThumbnailCache = clearAllBlendThumbnailCache;
}
