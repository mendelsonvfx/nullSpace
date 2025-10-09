import { useEffect, useState, useMemo } from 'react';
import { readBinaryFile } from '@tauri-apps/api/fs';
import { thumbnailCache } from '../utils/thumbnailCache';

export function useThumbnail(projectPath: string, thumbnail: string | undefined) {
  const [imageSrc, setImageSrc] = useState<string>('');

  // Memoize cache key to prevent unnecessary recalculations
  const cacheKey = useMemo(() =>
    thumbnail ? `${projectPath}::${thumbnail}` : null,
    [projectPath, thumbnail]
  );

  useEffect(() => {
    if (!thumbnail || !cacheKey) {
      setImageSrc('');
      return;
    }

    // Check cache first
    const cached = thumbnailCache.get(projectPath, thumbnail);
    if (cached) {
      setImageSrc(cached);
      return;
    }

    let isMounted = true;

    async function loadImage() {
      try {
        if (!thumbnail) return;

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

        // Store in cache
        thumbnailCache.set(projectPath, thumbnail, dataUrl);

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

// Export cache for manual cache management if needed
export { thumbnailCache };
