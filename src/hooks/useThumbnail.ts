import { useEffect, useState } from 'react';
import { readBinaryFile } from '@tauri-apps/api/fs';

export function useThumbnail(projectPath: string, thumbnail: string | undefined) {
  const [imageSrc, setImageSrc] = useState<string>('');

  useEffect(() => {
    if (!thumbnail) {
      setImageSrc('');
      return;
    }

    let isMounted = true;

    async function loadImage() {
      try {
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
  }, [projectPath, thumbnail]);

  return imageSrc;
}
