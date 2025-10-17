// IndexedDB-based thumbnail cache
// Replaces localStorage-based caching to support larger datasets

const DB_NAME = 'thumbnailCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';

interface ThumbnailData {
  key: string; // projectPath::thumbnailPath
  data: string; // base64 data URL
  timestamp: number;
}

class IndexedDBThumbnailCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB thumbnail cache initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('Created thumbnail object store');
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initPromise;
    }
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }
    return this.db;
  }

  private getCacheKey(projectPath: string, thumbnail: string): string {
    return `${projectPath}::${thumbnail}`;
  }

  async get(projectPath: string, thumbnail: string): Promise<string | undefined> {
    try {
      const db = await this.ensureDB();
      const key = this.getCacheKey(projectPath, thumbnail);

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result as ThumbnailData | undefined;
          resolve(result?.data);
        };

        request.onerror = () => {
          console.error('Failed to get thumbnail from IndexedDB:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error getting thumbnail:', error);
      return undefined;
    }
  }

  async set(projectPath: string, thumbnail: string, base64Data: string): Promise<void> {
    try {
      const db = await this.ensureDB();
      const key = this.getCacheKey(projectPath, thumbnail);

      const data: ThumbnailData = {
        key,
        data: base64Data,
        timestamp: Date.now()
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(data);

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Failed to set thumbnail in IndexedDB:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error setting thumbnail:', error);
    }
  }

  async clear(projectPath: string, thumbnail: string): Promise<void> {
    try {
      const db = await this.ensureDB();
      const key = this.getCacheKey(projectPath, thumbnail);

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Failed to clear thumbnail from IndexedDB:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error clearing thumbnail:', error);
    }
  }

  async clearProject(projectPath: string): Promise<void> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();
        const keysToDelete: string[] = [];

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const data = cursor.value as ThumbnailData;
            if (data.key.startsWith(`${projectPath}::`)) {
              keysToDelete.push(data.key);
            }
            cursor.continue();
          } else {
            // Delete all matching keys
            const deleteTransaction = db.transaction([STORE_NAME], 'readwrite');
            const deleteStore = deleteTransaction.objectStore(STORE_NAME);
            keysToDelete.forEach(key => deleteStore.delete(key));

            deleteTransaction.oncomplete = () => resolve();
            deleteTransaction.onerror = () => reject(deleteTransaction.error);
          }
        };

        request.onerror = () => {
          console.error('Failed to clear project thumbnails:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error clearing project thumbnails:', error);
    }
  }

  async clearAll(): Promise<void> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          console.log('All thumbnails cleared from IndexedDB');
          resolve();
        };

        request.onerror = () => {
          console.error('Failed to clear all thumbnails:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error clearing all thumbnails:', error);
    }
  }

  async getSize(): Promise<number> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          console.error('Failed to get cache size:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error getting cache size:', error);
      return 0;
    }
  }

  // Migrate data from localStorage to IndexedDB
  async migrateFromLocalStorage(): Promise<number> {
    const STORAGE_PREFIX = 'thumbnail_cache_';
    let migratedCount = 0;

    try {
      const keys = Object.keys(localStorage);

      for (const key of keys) {
        if (key.startsWith(STORAGE_PREFIX)) {
          const cacheKey = key.substring(STORAGE_PREFIX.length);
          const value = localStorage.getItem(key);

          if (value) {
            const [projectPath, thumbnail] = cacheKey.split('::');
            if (projectPath && thumbnail) {
              await this.set(projectPath, thumbnail, value);
              migratedCount++;
            }
          }
        }
      }

      console.log(`Migrated ${migratedCount} thumbnails from localStorage to IndexedDB`);
      return migratedCount;
    } catch (error) {
      console.error('Failed to migrate from localStorage:', error);
      return migratedCount;
    }
  }

  // Clean up old localStorage cache after migration
  async cleanupLocalStorage(): Promise<void> {
    const STORAGE_PREFIX = 'thumbnail_cache_';
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(STORAGE_PREFIX)) {
          localStorage.removeItem(key);
        }
      }
      console.log('Cleaned up localStorage thumbnail cache');
    } catch (error) {
      console.error('Failed to cleanup localStorage:', error);
    }
  }
}

// Export singleton instance
export const indexedDBThumbnailCache = new IndexedDBThumbnailCache();
