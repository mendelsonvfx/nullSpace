import { thumbnailCache } from '../utils/thumbnailCache';
import { indexedDBThumbnailCache } from '../utils/indexedDBCache';

// Feature flag - should match useThumbnail.ts
const USE_INDEXED_DB = true;

/**
 * Hook for manual thumbnail cache management
 * Useful when you need to force reload a thumbnail
 * Now supports both localStorage and IndexedDB backends
 */
export function useThumbnailCache() {
  return {
    // Clear specific thumbnail
    clearThumbnail: async (projectPath: string, thumbnail: string) => {
      if (USE_INDEXED_DB) {
        await indexedDBThumbnailCache.clear(projectPath, thumbnail);
      } else {
        thumbnailCache.clear(projectPath, thumbnail);
      }
    },

    // Clear all thumbnails for a project
    clearProjectThumbnails: async (projectPath: string) => {
      if (USE_INDEXED_DB) {
        await indexedDBThumbnailCache.clearProject(projectPath);
      } else {
        thumbnailCache.clearProject(projectPath);
      }
    },

    // Clear entire cache
    clearAllThumbnails: async () => {
      if (USE_INDEXED_DB) {
        await indexedDBThumbnailCache.clearAll();
      } else {
        thumbnailCache.clearAll();
      }
    },

    // Get cache size
    getCacheSize: async (): Promise<number> => {
      if (USE_INDEXED_DB) {
        return await indexedDBThumbnailCache.getSize();
      } else {
        return thumbnailCache.getSize();
      }
    },

    // Migrate from localStorage to IndexedDB (one-time operation)
    migrateToIndexedDB: async (): Promise<number> => {
      if (USE_INDEXED_DB) {
        const count = await indexedDBThumbnailCache.migrateFromLocalStorage();
        if (count > 0) {
          await indexedDBThumbnailCache.cleanupLocalStorage();
        }
        return count;
      }
      return 0;
    }
  };
}
