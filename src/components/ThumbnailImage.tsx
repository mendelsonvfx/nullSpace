import { useEffect, useState } from 'react';
import { readBinaryFile } from '@tauri-apps/api/fs';

interface ThumbnailImageProps {
  projectPath: string;
  thumbnail: string;
  className?: string;
  alt?: string;
  onError?: () => void;
}

export function ThumbnailImage({ projectPath, thumbnail, className, alt, onError }: ThumbnailImageProps) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadImage() {
      try {
        // Clean paths and join correctly
        const cleanPath = projectPath.trim().replace(/[\/\\]+$/, '');
        const cleanFile = thumbnail.trim().replace(/^[\/\\]+/, '');
        const fullPath = `${cleanPath}\\${cleanFile}`;

        console.log('Loading thumbnail from:', fullPath);

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
          setHasError(false);
        }
      } catch (error) {
        console.error('Failed to load thumbnail:', error);
        if (isMounted) {
          setHasError(true);
          onError?.();
        }
      }
    }

    loadImage();

    return () => {
      isMounted = false;
    };
  }, [projectPath, thumbnail, onError]);

  if (hasError) {
    return null;
  }

  if (!imageSrc) {
    return (
      <div className={className}>
        <div className="w-full h-full bg-zinc-800 animate-pulse" />
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt || 'Thumbnail'}
      className={className}
      onError={() => {
        setHasError(true);
        onError?.();
      }}
    />
  );
}
