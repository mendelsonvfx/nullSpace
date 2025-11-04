// Outputs cache to prevent reloading project outputs on every navigation
// Cache persists in memory and localStorage with TTL

import type { SoftwareName } from '../types/project';

export interface OutputFile {
  name: string;
  path: string;
  software: SoftwareName;
  render_type: 'preview' | 'final';
  created_at: number;
  size: number;
  is_sequence: boolean;
  frame_range?: string;
  frame_count?: number;
}

interface CacheEntry {
  data: OutputFile[];
  timestamp: number;
}

interface ExpandedGroupsEntry {
  groups: string[];
  timestamp: number;
}

interface OutputStateEntry {
  selectedSoftware: SoftwareName;
  selectedOutputType: 'preview' | 'final';
  timestamp: number;
}

class OutputsCache {
  private cache: Map<string, CacheEntry> = new Map();
  private expandedGroupsCache: Map<string, ExpandedGroupsEntry> = new Map();
  private outputStateCache: Map<string, OutputStateEntry> = new Map();
  private readonly STORAGE_PREFIX = 'outputs_cache_';
  private readonly EXPANDED_GROUPS_PREFIX = 'outputs_expanded_groups_';
  private readonly OUTPUT_STATE_PREFIX = 'outputs_state_';
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes cache lifetime

  constructor() {
    // Load cache from localStorage on initialization
    this.loadFromStorage();
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
        } else if (key.startsWith(this.EXPANDED_GROUPS_PREFIX)) {
          const projectPath = key.substring(this.EXPANDED_GROUPS_PREFIX.length);
          const value = localStorage.getItem(key);
          if (value) {
            const entry: ExpandedGroupsEntry = JSON.parse(value);
            this.expandedGroupsCache.set(projectPath, entry);
          }
        } else if (key.startsWith(this.OUTPUT_STATE_PREFIX)) {
          const projectPath = key.substring(this.OUTPUT_STATE_PREFIX.length);
          const value = localStorage.getItem(key);
          if (value) {
            const entry: OutputStateEntry = JSON.parse(value);
            this.outputStateCache.set(projectPath, entry);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load outputs cache from storage:', error);
    }
  }

  // Save entry to localStorage
  private saveToStorage(projectPath: string, entry: CacheEntry): void {
    if (typeof window === 'undefined') return;

    try {
      const storageKey = this.STORAGE_PREFIX + projectPath;
      localStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (error) {
      console.error('Failed to save outputs to storage:', error);
    }
  }

  // Save expanded groups to localStorage
  private saveExpandedGroupsToStorage(projectPath: string, entry: ExpandedGroupsEntry): void {
    if (typeof window === 'undefined') return;

    try {
      const storageKey = this.EXPANDED_GROUPS_PREFIX + projectPath;
      localStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (error) {
      console.error('Failed to save expanded groups to storage:', error);
    }
  }

  // Save output state to localStorage
  private saveOutputStateToStorage(projectPath: string, entry: OutputStateEntry): void {
    if (typeof window === 'undefined') return;

    try {
      const storageKey = this.OUTPUT_STATE_PREFIX + projectPath;
      localStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (error) {
      console.error('Failed to save output state to storage:', error);
    }
  }

  // Remove entry from localStorage
  private removeFromStorage(projectPath: string): void {
    if (typeof window === 'undefined') return;

    try {
      const storageKey = this.STORAGE_PREFIX + projectPath;
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Failed to remove outputs from storage:', error);
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

  // Get cached outputs for a project
  get(projectPath: string): OutputFile[] | null {
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

  // Set cached outputs for a project
  set(projectPath: string, outputs: OutputFile[]): void {
    const entry: CacheEntry = {
      data: outputs,
      timestamp: Date.now()
    };
    this.cache.set(projectPath, entry);
    this.saveToStorage(projectPath, entry);
  }

  // Get expanded groups for a project
  getExpandedGroups(projectPath: string): Set<string> {
    const entry = this.expandedGroupsCache.get(projectPath);

    if (!entry) {
      return new Set();
    }

    return new Set(entry.groups);
  }

  // Set expanded groups for a project
  setExpandedGroups(projectPath: string, groups: Set<string>): void {
    const entry: ExpandedGroupsEntry = {
      groups: Array.from(groups),
      timestamp: Date.now()
    };
    this.expandedGroupsCache.set(projectPath, entry);
    this.saveExpandedGroupsToStorage(projectPath, entry);
  }

  // Get output state for a project
  getOutputState(projectPath: string): { selectedSoftware: string; selectedOutputType: 'preview' | 'final' } | null {
    const entry = this.outputStateCache.get(projectPath);
    if (!entry) {
      return null;
    }
    return {
      selectedSoftware: entry.selectedSoftware,
      selectedOutputType: entry.selectedOutputType
    };
  }

  // Set output state for a project
  setOutputState(projectPath: string, selectedSoftware: SoftwareName, selectedOutputType: 'preview' | 'final'): void {
    const entry: OutputStateEntry = {
      selectedSoftware,
      selectedOutputType,
      timestamp: Date.now()
    };
    this.outputStateCache.set(projectPath, entry);
    this.saveOutputStateToStorage(projectPath, entry);
  }

  // Add or update a single file in cache
  addFile(projectPath: string, file: OutputFile): void {
    const entry = this.cache.get(projectPath);
    if (entry) {
      // Check if file already exists
      const existingIndex = entry.data.findIndex(f => f.path === file.path && f.name === file.name);
      if (existingIndex >= 0) {
        // Update existing file
        entry.data[existingIndex] = file;
      } else {
        // Add new file
        entry.data.push(file);
      }
      entry.timestamp = Date.now();
      this.cache.set(projectPath, entry);
      this.saveToStorage(projectPath, entry);
    }
  }

  // Remove a single file from cache
  removeFile(projectPath: string, filePath: string, fileName: string): void {
    const entry = this.cache.get(projectPath);
    if (entry) {
      entry.data = entry.data.filter(f => !(f.path === filePath && f.name === fileName));
      entry.timestamp = Date.now();
      this.cache.set(projectPath, entry);
      this.saveToStorage(projectPath, entry);
    }
  }

  // Update multiple files in cache (batch operation)
  updateFiles(projectPath: string, files: OutputFile[]): void {
    const entry = this.cache.get(projectPath);
    if (entry) {
      for (const file of files) {
        const existingIndex = entry.data.findIndex(f => f.path === file.path && f.name === file.name);
        if (existingIndex >= 0) {
          entry.data[existingIndex] = file;
        } else {
          entry.data.push(file);
        }
      }
      entry.timestamp = Date.now();
      this.cache.set(projectPath, entry);
      this.saveToStorage(projectPath, entry);
    }
  }

  // Invalidate cache for a specific project
  invalidate(projectPath: string): void {
    this.cache.delete(projectPath);
    this.removeFromStorage(projectPath);
    // Don't invalidate expanded groups - they should persist
  }

  // Clear entire cache
  clearAll(): void {
    this.cache.clear();
    this.expandedGroupsCache.clear();
    this.outputStateCache.clear();

    // Clear from localStorage
    if (typeof window !== 'undefined') {
      try {
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          if (key.startsWith(this.STORAGE_PREFIX) ||
              key.startsWith(this.EXPANDED_GROUPS_PREFIX) ||
              key.startsWith(this.OUTPUT_STATE_PREFIX)) {
            localStorage.removeItem(key);
          }
        }
      } catch (error) {
        console.error('Failed to clear outputs cache from storage:', error);
      }
    }
  }

  // Get cache size
  getSize(): number {
    return this.cache.size;
  }
}

// Export singleton instance
export const outputsCache = new OutputsCache();
