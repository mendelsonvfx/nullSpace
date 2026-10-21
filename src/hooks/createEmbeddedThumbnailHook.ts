import { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api';
import { indexedDBThumbnailCache } from '../utils/indexedDBCache';

const _focusSubs = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    _focusSubs.forEach(fn => { try { fn(); } catch {} });
  });
}

/**
 * Hook factory for previews embedded in DCC files (PSD, C4D): the backend command returns a data URL or null.
 * Each hook gets its own memory/mtime caches; IndexedDB entries are separated by `cacheType`.
 * The cache is invalidated when the file's mtime changes (checked on window focus).
 */
export function createEmbeddedThumbnailHook(command: string, cacheType: string, label: string) {
  const memoryCache = new Map<string, string>();
  const mtimeCache  = new Map<string, number>();

  function useThumbnail(filePath: string | undefined) {
    const cacheKey = useMemo(() => filePath || null, [filePath]);

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
      if (!filePath || !cacheKey) {
        setImageSrc('');
        return;
      }

      let isMounted = true;

      async function loadThumbnail() {
        try {
          if (!filePath || !cacheKey) return;

          // Skip IPC on normal mount/remount if memory cache is already warm.
          // focusTick is 0 on every mount and only > 0 after a window focus event.
          const memCached = memoryCache.get(cacheKey);
          if (memCached && focusTick === 0) {
            if (isMounted) setImageSrc(memCached);
            return;
          }

          let currentMtime: number | null = null;
          try {
            currentMtime = await invoke<number>('get_file_mtime', { path: filePath });
          } catch { /* file inaccessible — proceed with cache */ }

          const cachedMtime = mtimeCache.get(cacheKey);
          const mtimeChanged =
            currentMtime !== null &&
            cachedMtime  !== undefined &&
            cachedMtime  !== currentMtime;

          if (mtimeChanged) {
            memoryCache.delete(cacheKey);
            mtimeCache.delete(cacheKey);
            await indexedDBThumbnailCache.clear(filePath, cacheType);
          }

          if (!mtimeChanged) {
            const memCached = memoryCache.get(cacheKey);
            if (memCached) {
              if (isMounted) setImageSrc(memCached);
              return;
            }

            const idbCached = await indexedDBThumbnailCache.get(filePath, cacheType);
            if (idbCached) {
              memoryCache.set(cacheKey, idbCached);
              if (currentMtime !== null) mtimeCache.set(cacheKey, currentMtime);
              if (isMounted) setImageSrc(idbCached);
              return;
            }
          }

          console.log(`[${label} Thumbnail] Extracting from:`, filePath);
          const result = await invoke<string | null>(command, { path: filePath });

          if (!result) {
            console.log(`[${label} Thumbnail] No thumbnail found in file`);
            if (isMounted) setImageSrc('');
            return;
          }

          console.log(`[${label} Thumbnail] Extracted successfully, length:`, result.length);

          await indexedDBThumbnailCache.set(filePath, cacheType, result);
          memoryCache.set(cacheKey, result);
          if (currentMtime !== null) mtimeCache.set(cacheKey, currentMtime);

          if (isMounted) setImageSrc(result);
        } catch (error) {
          console.error(`[${label} Thumbnail] Failed to extract:`, error);
          if (isMounted) setImageSrc('');
        }
      }

      loadThumbnail();

      return () => {
        isMounted = false;
      };
    }, [filePath, cacheKey, focusTick]);

    return imageSrc;
  }

  function clear(filePath: string) {
    memoryCache.delete(filePath);
    mtimeCache.delete(filePath);
    indexedDBThumbnailCache.clear(filePath, cacheType);
  }

  function clearAll() {
    memoryCache.clear();
    mtimeCache.clear();
  }

  function isCached(filePath: string): boolean {
    return memoryCache.has(filePath);
  }

  return { useThumbnail, clear, clearAll, isCached };
}
