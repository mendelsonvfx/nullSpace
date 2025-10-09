// Thumbnail cache to prevent reloading images on every render
// Cache persists in localStorage
class ThumbnailCache {
  private cache: Map<string, string> = new Map();
  private readonly STORAGE_PREFIX = 'thumbnail_cache_';

  constructor() {
    // Load cache from localStorage on initialization
    this.loadFromStorage();
  }

  // Load cache from localStorage
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(this.STORAGE_PREFIX)) {
          const cacheKey = key.substring(this.STORAGE_PREFIX.length);
          const value = localStorage.getItem(key);
          if (value) {
            this.cache.set(cacheKey, value);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load thumbnail cache from storage:', error);
    }
  }

  // Save entry to localStorage
  private saveToStorage(cacheKey: string, data: string): void {
    if (typeof window === 'undefined') return;

    try {
      const storageKey = this.STORAGE_PREFIX + cacheKey;
      localStorage.setItem(storageKey, data);
    } catch (error) {
      console.error('Failed to save thumbnail to storage:', error);
    }
  }

  // Remove entry from localStorage
  private removeFromStorage(cacheKey: string): void {
    if (typeof window === 'undefined') return;

    try {
      const storageKey = this.STORAGE_PREFIX + cacheKey;
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Failed to remove thumbnail from storage:', error);
    }
  }

  // Generate cache key from project path and thumbnail path
  private getCacheKey(projectPath: string, thumbnail: string): string {
    return `${projectPath}::${thumbnail}`;
  }

  // Get cached thumbnail
  get(projectPath: string, thumbnail: string): string | undefined {
    const key = this.getCacheKey(projectPath, thumbnail);
    return this.cache.get(key);
  }

  // Set cached thumbnail
  set(projectPath: string, thumbnail: string, base64Data: string): void {
    const key = this.getCacheKey(projectPath, thumbnail);
    this.cache.set(key, base64Data);
    this.saveToStorage(key, base64Data);
  }

  // Clear specific thumbnail from cache
  clear(projectPath: string, thumbnail: string): void {
    const key = this.getCacheKey(projectPath, thumbnail);
    this.cache.delete(key);
    this.removeFromStorage(key);
  }

  // Clear all thumbnails for a project
  clearProject(projectPath: string): void {
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.startsWith(`${projectPath}::`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.removeFromStorage(key);
    });
  }

  // Clear entire cache
  clearAll(): void {
    this.cache.clear();

    // Clear from localStorage
    if (typeof window !== 'undefined') {
      try {
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          if (key.startsWith(this.STORAGE_PREFIX)) {
            localStorage.removeItem(key);
          }
        }
      } catch (error) {
        console.error('Failed to clear thumbnail cache from storage:', error);
      }
    }
  }

  // Get cache size
  getSize(): number {
    return this.cache.size;
  }
}

// Export singleton instance
export const thumbnailCache = new ThumbnailCache();
