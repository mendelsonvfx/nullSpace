export type MarkColor = 'red' | 'green' | 'blue' | null;

interface VersionMarks {
  [versionPath: string]: MarkColor;
}

interface ProjectMarks {
  [projectPath: string]: VersionMarks;
}

class VersionMarksCache {
  private readonly STORAGE_PREFIX = 'version_marks_';
  private cache: ProjectMarks = {};

  constructor() {
    // Load all marks from localStorage on initialization
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      // Scan localStorage for all version_marks_ keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_PREFIX)) {
          const projectPath = key.substring(this.STORAGE_PREFIX.length);
          const data = localStorage.getItem(key);
          if (data) {
            this.cache[projectPath] = JSON.parse(data);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load version marks from localStorage:', error);
    }
  }

  private saveToStorage(projectPath: string): void {
    try {
      const key = `${this.STORAGE_PREFIX}${projectPath}`;
      const marks = this.cache[projectPath];
      if (marks && Object.keys(marks).length > 0) {
        localStorage.setItem(key, JSON.stringify(marks));
      } else {
        // Remove key if no marks left
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('Failed to save version marks to localStorage:', error);
    }
  }

  /**
   * Get the mark color for a specific version
   */
  getMark(projectPath: string, versionPath: string): MarkColor {
    return this.cache[projectPath]?.[versionPath] || null;
  }

  /**
   * Set the mark color for a specific version
   */
  setMark(projectPath: string, versionPath: string, color: MarkColor): void {
    // Initialize project marks if not exists
    if (!this.cache[projectPath]) {
      this.cache[projectPath] = {};
    }

    if (color === null) {
      // Remove the mark
      delete this.cache[projectPath][versionPath];
    } else {
      // Set the mark
      this.cache[projectPath][versionPath] = color;
    }

    this.saveToStorage(projectPath);
  }

  /**
   * Get all marks for a project
   */
  getProjectMarks(projectPath: string): VersionMarks {
    return this.cache[projectPath] || {};
  }

  /**
   * Clear all marks for a project
   */
  clearProjectMarks(projectPath: string): void {
    delete this.cache[projectPath];
    const key = `${this.STORAGE_PREFIX}${projectPath}`;
    localStorage.removeItem(key);
  }

  /**
   * Clear all marks for all projects
   */
  clearAll(): void {
    // Remove all version_marks_ keys from localStorage
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    this.cache = {};
  }
}

// Export singleton instance
export const versionMarksCache = new VersionMarksCache();
