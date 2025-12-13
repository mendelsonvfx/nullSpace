import { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api';
import { indexedDBThumbnailCache } from '../utils/indexedDBCache';

// Global in-memory cache for instant thumbnail access
const memoryCache = new Map<string, string>();

/**
 * Hook to extract and display thumbnail from .blend files
 * Uses the TEST block embedded in .blend files
 */
export function useBlendThumbnail(blendFilePath: string | undefined) {
  // Memoize cache key to prevent unnecessary recalculations
  const cacheKey = useMemo(() => blendFilePath || null, [blendFilePath]);

  // Initialize state from memory cache if available (synchronous, no flicker)
  const [imageSrc, setImageSrc] = useState<string>(() => {
    if (!cacheKey) return '';
    return memoryCache.get(cacheKey) || '';
  });

  useEffect(() => {
    if (!blendFilePath || !cacheKey) {
      setImageSrc('');
      return;
    }

    let isMounted = true;

    async function loadThumbnail() {
      try {
        if (!blendFilePath || !cacheKey) return;

        // Check memory cache first (synchronous, fastest)
        const memCached = memoryCache.get(cacheKey);
        if (memCached) {
          if (isMounted) {
            setImageSrc(memCached);
          }
          return;
        }

        // Check IndexedDB cache using file path as both project and thumbnail key
        // We use the full path as the identifier
        const cached = await indexedDBThumbnailCache.get(blendFilePath, 'blend_thumb');
        if (cached && isMounted) {
          // Store in memory cache for instant access next time
          memoryCache.set(cacheKey, cached);
          setImageSrc(cached);
          return;
        }

        // Extract thumbnail from .blend file via Tauri backend
        console.log('[Blend Thumbnail] Extracting from:', blendFilePath);
        const result = await invoke<string | null>('extract_blend_thumbnail', {
          path: blendFilePath
        });

        if (!result) {
          // No thumbnail found in this .blend file
          console.log('[Blend Thumbnail] No thumbnail found in file');
          if (isMounted) {
            setImageSrc('');
          }
          return;
        }

        console.log('[Blend Thumbnail] Extracted successfully, length:', result.length);

        // Store in IndexedDB cache
        await indexedDBThumbnailCache.set(blendFilePath, 'blend_thumb', result);

        // Store in memory cache for instant access
        memoryCache.set(cacheKey, result);

        if (isMounted) {
          setImageSrc(result);
        }
      } catch (error) {
        console.error('[Blend Thumbnail] Failed to extract:', error);
        if (isMounted) {
          setImageSrc('');
        }
      }
    }

    loadThumbnail();

    return () => {
      isMounted = false;
    };
  }, [blendFilePath, cacheKey]);

  return imageSrc;
}

// Function to clear cache for specific .blend file
export function clearBlendThumbnailCache(blendFilePath: string) {
  memoryCache.delete(blendFilePath);
  indexedDBThumbnailCache.clear(blendFilePath, 'blend_thumb');
}
