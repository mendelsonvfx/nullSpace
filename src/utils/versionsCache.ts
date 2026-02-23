// Versions cache to prevent reloading project versions on every navigation
// Cache persists in memory and localStorage with TTL

export interface ProjectVersion {
  name: string;
  path: string;
  software: string[];
  created_at: number;  // Unix timestamp in seconds
  modified_at: number; // Unix timestamp in seconds
  is_versioned: boolean; // true if file has _v### pattern
}

export interface VersionsFilterState {
  selectedSoftware: string;
  showOnlyUnversioned: boolean;
}

interface CacheEntry {
  data: ProjectVersion[];
  timestamp: number;
}

class VersionsCache {
  private cache: Map<string, CacheEntry> = new Map();
  private expandedStacksCache: Map<string, Set<string>> = new Map();
  private filterCache: Map<string, VersionsFilterState> = new Map();
  private readonly STORAGE_PREFIX = 'versions_cache_';
  private readonly EXPANDED_STACKS_PREFIX = 'versions_expanded_stacks_';
  private readonly FILTER_PREFIX = 'versions_filter_';
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes cache lifetime

  constructor() {
    // Load cache from localStorage on initialization
    this.loadFromStorage();
    this.loadExpandedStacks();
    this.loadFilters();
    // Clean expired entries on startup
    this.cleanExpiredEntries();
  }

  // Load cache from localStorage
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(this.STORAGE_PREFIX)) {
          const projectPath = key.substring(this.STORAGE_PREFIX.length);
          const value = localStorage.getItem(key);
          if (value) {
            const entry: CacheEntry = JSON.parse(value);
            this.cache.set(projectPath, entry);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load versions cache from storage:', error);
    }
  }

  // Save entry to localStorage
  private saveToStorage(projectPath: string, entry: CacheEntry): void {
    if (typeof window === 'undefined') return;

    try {
      const storageKey = this.STORAGE_PREFIX + projectPath;
      localStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (error) {
      console.error('Failed to save versions to storage:', error);
    }
  }

  // Remove entry from localStorage
  private removeFromStorage(projectPath: string): void {
    if (typeof window === 'undefined') return;

    try {
      const storageKey = this.STORAGE_PREFIX + projectPath;
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Failed to remove versions from storage:', error);
    }
  }

  // Check if cache entry is expired
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.TTL_MS;
  }

  // Clean all expired entries
  private cleanExpiredEntries(): void {
    const keysToDelete: string[] = [];
    this.cache.forEach((entry, key) => {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.removeFromStorage(key);
    });
  }

  // Get cached versions for a project
  get(projectPath: string): ProjectVersion[] | null {
    const entry = this.cache.get(projectPath);

    if (!entry) {
      return null;
    }

    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.cache.delete(projectPath);
      this.removeFromStorage(projectPath);
      return null;
    }

    return entry.data;
  }

  // Set cached versions for a project
  set(projectPath: string, versions: ProjectVersion[]): void {
    const entry: CacheEntry = {
      data: versions,
      timestamp: Date.now()
    };
    this.cache.set(projectPath, entry);
    this.saveToStorage(projectPath, entry);
  }

  // Invalidate cache for a specific project
  invalidate(projectPath: string): void {
    this.cache.delete(projectPath);
    this.removeFromStorage(projectPath);
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
        console.error('Failed to clear versions cache from storage:', error);
      }
    }
  }

  // Get cache size
  getSize(): number {
    return this.cache.size;
  }

  // Get cache info for debugging
  getCacheInfo(): { size: number; entries: { path: string; count: number; age: number }[] } {
    const entries = Array.from(this.cache.entries()).map(([path, entry]) => ({
      path,
      count: entry.data.length,
      age: Date.now() - entry.timestamp
    }));

    return {
      size: this.cache.size,
      entries
    };
  }

  // Load expanded stacks from localStorage
  private loadExpandedStacks(): void {
    if (typeof window === 'undefined') return;

    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(this.EXPANDED_STACKS_PREFIX)) {
          const projectPath = key.substring(this.EXPANDED_STACKS_PREFIX.length);
          const value = localStorage.getItem(key);
          if (value) {
            const stacksArray: string[] = JSON.parse(value);
            this.expandedStacksCache.set(projectPath, new Set(stacksArray));
          }
        }
      }
    } catch (error) {
      console.error('Failed to load expanded stacks from storage:', error);
    }
  }

  // Get expanded stacks for a project
  getExpandedStacks(projectPath: string): Set<string> {
    return this.expandedStacksCache.get(projectPath) || new Set();
  }

  // Set expanded stacks for a project
  setExpandedStacks(projectPath: string, stacks: Set<string>): void {
    this.expandedStacksCache.set(projectPath, stacks);

    if (typeof window === 'undefined') return;

    try {
      const storageKey = this.EXPANDED_STACKS_PREFIX + projectPath;
      localStorage.setItem(storageKey, JSON.stringify(Array.from(stacks)));
    } catch (error) {
      console.error('Failed to save expanded stacks to storage:', error);
    }
  }

  // Load filter state from localStorage
  private loadFilters(): void {
    if (typeof window === 'undefined') return;

    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(this.FILTER_PREFIX)) {
          const projectPath = key.substring(this.FILTER_PREFIX.length);
          const value = localStorage.getItem(key);
          if (value) {
            const filter: VersionsFilterState = JSON.parse(value);
            this.filterCache.set(projectPath, filter);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load filter state from storage:', error);
    }
  }

  // Get saved filter state for a project
  getFilter(projectPath: string): VersionsFilterState | null {
    return this.filterCache.get(projectPath) || null;
  }

  // Save filter state for a project
  setFilter(projectPath: string, filter: VersionsFilterState): void {
    this.filterCache.set(projectPath, filter);

    if (typeof window === 'undefined') return;

    try {
      const storageKey = this.FILTER_PREFIX + projectPath;
      localStorage.setItem(storageKey, JSON.stringify(filter));
    } catch (error) {
      console.error('Failed to save filter state to storage:', error);
    }
  }
}

// Export singleton instance
export const versionsCache = new VersionsCache();
