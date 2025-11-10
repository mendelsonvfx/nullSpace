import { useEffect, useState, useMemo } from 'react';
import { readBinaryFile } from '@tauri-apps/api/fs';
import { thumbnailCache } from '../utils/thumbnailCache';
import { indexedDBThumbnailCache } from '../utils/indexedDBCache';

// Feature flag to switch between localStorage and IndexedDB
const USE_INDEXED_DB = true;

// Global in-memory cache for instant thumbnail access
const memoryCache = new Map<string, string>();

export function useThumbnail(projectPath: string, thumbnail: string | undefined) {
  // Memoize cache key to prevent unnecessary recalculations
  const cacheKey = useMemo(() =>
    thumbnail ? `${projectPath}::${thumbnail}` : null,
    [projectPath, thumbnail]
  );

  // Initialize state from memory cache if available (synchronous, no flicker)
  const [imageSrc, setImageSrc] = useState<string>(() => {
    if (!cacheKey) return '';
    return memoryCache.get(cacheKey) || '';
  });

  useEffect(() => {
    if (!thumbnail || !cacheKey) {
      setImageSrc('');
      return;
    }

    let isMounted = true;

    async function loadImage() {
      try {
        if (!thumbnail || !cacheKey) return;

        // Check memory cache first (synchronous, fastest)
        const memCached = memoryCache.get(cacheKey);
        if (memCached) {
          if (isMounted) {
            setImageSrc(memCached);
          }
          return;
        }

        // Check IndexedDB or localStorage cache
        if (USE_INDEXED_DB) {
          const cached = await indexedDBThumbnailCache.get(projectPath, thumbnail);
          if (cached && isMounted) {
            // Store in memory cache for instant access next time
            memoryCache.set(cacheKey, cached);
            setImageSrc(cached);
            return;
          }
        } else {
          const cached = thumbnailCache.get(projectPath, thumbnail);
          if (cached) {
            // Store in memory cache for instant access next time
            memoryCache.set(cacheKey, cached);
            setImageSrc(cached);
            return;
          }
        }

        // Clean paths and join correctly
        const cleanPath = projectPath.trim().replace(/[\/\\]+$/, '');
        const cleanFile = thumbnail.trim().replace(/^[\/\\]+/, '');
        const fullPath = `${cleanPath}\\${cleanFile}`;

        // Read file as binary
        const fileData = await readBinaryFile(fullPath);

        // Determine MIME type based on extension
        const extension = thumbnail.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'bmp': 'image/bmp'
        };
        const mimeType = mimeTypes[extension || 'jpg'] || 'image/jpeg';

        // Convert to base64
        const base64 = btoa(
          fileData.reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        const dataUrl = `data:${mimeType};base64,${base64}`;

        // Store in all caches
        if (USE_INDEXED_DB) {
          await indexedDBThumbnailCache.set(projectPath, thumbnail, dataUrl);
        } else {
          thumbnailCache.set(projectPath, thumbnail, dataUrl);
        }

        // Store in memory cache for instant access
        memoryCache.set(cacheKey, dataUrl);

        if (isMounted) {
          setImageSrc(dataUrl);
        }
      } catch (error) {
        console.error('Failed to load thumbnail:', error);
        if (isMounted) {
          setImageSrc('');
        }
      }
    }

    loadImage();

    return () => {
      isMounted = false;
    };
  }, [projectPath, thumbnail, cacheKey]);

  return imageSrc;
}

// Function to clear cache for specific thumbnail
export function clearThumbnailCache(projectPath: string, thumbnail: string) {
  const cacheKey = `${projectPath}::${thumbnail}`;
  memoryCache.delete(cacheKey);

  if (USE_INDEXED_DB) {
    indexedDBThumbnailCache.clear(projectPath, thumbnail);
  } else {
    thumbnailCache.clear(projectPath, thumbnail);
  }
}

// Export caches for manual cache management if needed
export { thumbnailCache, indexedDBThumbnailCache };
