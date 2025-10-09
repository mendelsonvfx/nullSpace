import { thumbnailCache } from '../utils/thumbnailCache';

/**
 * Hook for manual thumbnail cache management
 * Useful when you need to force reload a thumbnail
 */
export function useThumbnailCache() {
  return {
    // Clear specific thumbnail
    clearThumbnail: (projectPath: string, thumbnail: string) => {
      thumbnailCache.clear(projectPath, thumbnail);
    },

    // Clear all thumbnails for a project
    clearProjectThumbnails: (projectPath: string) => {
      thumbnailCache.clearProject(projectPath);
    },

    // Clear entire cache
    clearAllThumbnails: () => {
      thumbnailCache.clearAll();
    },

    // Get cache size
    getCacheSize: () => {
      return thumbnailCache.getSize();
    }
  };
}
