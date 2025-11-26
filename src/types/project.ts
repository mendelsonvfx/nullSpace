// src/types/project.ts

import type { WorkSession } from '../features/time-tracking/types/workSession';

export type SoftwareName =
  | 'blender'
  | 'houdini'
  | 'after-effects'
  | 'photoshop'
  | 'maya'
  | 'cinema4d'
  | 'substance'
  | 'unreal'
  | 'unity'
  | 'zbrush'
  | 'marmoset';

export type ProjectStatus = 'active' | 'archived' | 'completed' | 'paused';

export type PaymentStatus = 'paid' | 'prepaid' | 'unpaid';

export type Currency = 'USD' | 'RUB' | 'EUR';

export interface Software {
  name: SoftwareName;
  executablePath: string;
  version?: string;
  icon?: string;
}

export interface Client {
  id: string;
  name: string;
  color?: string;
  description?: string;
  website?: string;
  telegram?: string;
  instagram?: string;
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt?: string; // ISO date string for date separator
}

export interface Scene {
  id: string;
  number: number; // 0 for Main, 1+ for SC001, SC002...
  name: string; // "Main", "Scene 001", "Scene 002"
  description?: string; // Optional scene description
  preview?: string; // Path to preview image
  todos: TodoItem[];
  notes: Note[];
  browserTabs: BrowserTab[];
  links: Link[];
  wip?: boolean; // Work in progress status
  completed?: boolean;
}

export interface Shot {
  id: string;
  sceneId?: string; // Optional: scene this shot belongs to (undefined in shots-only mode)
  number: number;
  name: string;
  preview?: string; // Path to preview image
  todos: TodoItem[];
  notes: Note[];
  browserTabs: BrowserTab[];
  links: Link[];
  wip?: boolean; // Work in progress status
  completed?: boolean;
}

export interface SpecialContext {
  id: string;
  type: 'asset' | 'compose'; // Type of special context
  sceneId?: string; // Optional: scene this context belongs to (for scene-level asset/compose)
  todos: TodoItem[];
  notes: Note[];
  browserTabs: BrowserTab[];
  links: Link[];
}

export interface Note {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  isPinned: boolean;
  favicon?: string;
}

export interface Link {
  id: string;
  url: string;
  title: string;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  sceneId?: string; // Optional: scene this entry belongs to
  shotId?: string;
  software: SoftwareName;
  startTime: string;         // ISO timestamp
  endTime?: string;          // ISO timestamp (undefined if active)
  durationMinutes: number;   // Individual time since this entry started
  elapsedSeconds: number;    // Elapsed seconds for widget display (updated every second)
  workSessionId?: string;    // WorkSession this entry belongs to (if active)
  softwareMinutes?: number;  // Focused time for this software (for stats)
  isActive: boolean;         // Currently tracking
  isManual: boolean;         // Manually added or auto-tracked
  notes?: string;            // Optional notes for manual entries
  pid?: number;              // Process ID for active tracking
  widgetVisible?: boolean;   // Widget is shown (after delay)
  countedInStats?: boolean;  // Whether this entry was counted in global software statistics
  pausedMinutes?: number;    // Minutes paused (for break tracking)
  isPaused?: boolean;        // Whether the entry is currently paused
}

export interface Transaction {
  id: string;
  amount: number;
  currency: Currency;
  date: string;              // ISO date string
  notes?: string;
  createdAt: string;         // ISO timestamp
}

export interface FolderTemplate {
  name: string;
  subfolders?: (FolderTemplate | string)[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  tags: string[];
  software: Software[];
  todos: TodoItem[];
  notes: Note[];
  browserTabs: BrowserTab[];
  links: Link[];
  thumbnail?: string;
  folderStructure: FolderTemplate[];
  deadline?: string; // ISO date string
  isFavorite?: boolean;
  isPinned?: boolean;
  color?: string; // Random HSL color generated for project
  cost?: number;
  currency?: Currency;
  paymentStatus?: PaymentStatus;
  prepaymentAmount?: number;
  completedAt?: string; // ISO date string - when payment status was set to "paid"
  clientId?: string;
  hasScenes?: boolean;
  hasShots?: boolean;
  scenes?: Scene[];
  currentSceneId?: string;
  shots?: Shot[];
  currentShotId?: string;
  sceneShotPreferences?: Record<string, string>; // sceneId -> shotId mapping
  specialContexts?: SpecialContext[]; // Asset/Compose contexts
  currentSpecialContextId?: string; // Currently selected special context (asset/compose)
  category?: string;
  timeEntries?: TimeEntry[];
  totalMinutesSpent?: number;        // Completed sessions total
  workSession?: WorkSession | null;  // Active WorkSession for this project
  hourlyRate?: number;
  targetHourlyRate?: number;
  transactions?: Transaction[];      // Manual financial transactions history
  isManualTransaction?: boolean;     // Manually added financial transaction (deprecated - use transactions array)
  sourceProjectId?: string;          // ID of the project this transaction is related to (deprecated)
}

// Предустановленные шаблоны структуры папок
export const FOLDER_TEMPLATES: Record<SoftwareName, FolderTemplate> = {
  blender: {
    name: 'Blender',
    subfolders: [
      {
        name: 'Geo',
        subfolders: ['Exported', 'Imported']
      },
      {
        name: 'Tex',
        subfolders: ['Exported', 'Imported', 'Plates']
      },
      {
        name: 'Cache',
        subfolders: ['Temp', 'Sim', 'Bake']
      },
      {
        name: 'Render',
        subfolders: ['Preview', 'Final', 'Passes']
      }
    ]
  },
  houdini: {
    name: 'Houdini',
    subfolders: [
      {
        name: 'Geo',
        subfolders: ['Exported', 'Imported']
      },
      {
        name: 'Tex',
        subfolders: ['Exported', 'Imported']
      },
      {
        name: 'Cache',
        subfolders: ['Temp', 'Sim', 'Render', 'Alembic']
      },
      {
        name: 'Render',
        subfolders: ['Preview', 'Final', 'Passes']
      },
      {
        name: 'Assets',
        subfolders: ['HDAs', 'Presets']
      },
      'Notes'
    ]
  },
  'after-effects': {
    name: 'AfterEffects',
    subfolders: [
      {
        name: 'Footage',
        subfolders: ['Renders', 'Plates', 'Stock']
      },
      {
        name: 'Assets',
        subfolders: ['Logos', 'Graphics', 'Audio']
      },
      {
        name: 'Output',
        subfolders: ['Preview', 'Final']
      },
      {
        name: 'Cache',
        subfolders: ['AE_Cache', 'Temp']
      }
    ]
  },
  photoshop: {
    name: 'Photoshop',
    subfolders: [
      {
        name: 'Source',
        subfolders: ['Drafts', 'Final']
      },
      {
        name: 'Assets',
        subfolders: ['Textures', 'Brushes', 'Patterns', 'Fonts']
      },
      'Export'
    ]
  },
  maya: {
    name: 'Maya',
    subfolders: ['scenes', 'images', 'cache', 'sourceimages']
  },
  cinema4d: {
    name: 'Cinema4D',
    subfolders: ['scenes', 'tex', 'render', 'cache']
  },
  substance: {
    name: 'Substance',
    subfolders: ['exports', 'sources', 'references']
  },
  unreal: {
    name: 'Unreal',
    subfolders: ['Content', 'Saved', 'Intermediate']
  },
  unity: {
    name: 'Unity',
    subfolders: ['Assets', 'ProjectSettings', 'Packages']
  },
  zbrush: {
    name: 'ZBrush',
    subfolders: ['Tools', 'Renders', 'Export']
  },
  marmoset: {
    name: 'Marmoset',
    subfolders: ['Scenes', 'Exports', 'Textures']
  }
};

// Конфигурация приложения
export interface AppConfig {
  projectsDirectory: string;
  theme: 'light' | 'dark';
  softwarePaths: Partial<Record<SoftwareName, string>>;
  recentProjects: string[];
}

// Команды для Tauri backend
export interface CreateProjectCommand {
  name: string;
  description: string;
  path: string;
  software: SoftwareName[];
  tags: string[];
  deadline?: string; // ISO date string
  hasScenes?: boolean;
  hasShots?: boolean;
}

export interface LaunchSoftwareCommand {
  projectPath: string;
  software: string;
  executablePath: string;
  projectName: string;
  sceneName?: string;
  sceneNumber?: number;
  shotNumber?: number;
  specialContext?: string;
}

export interface StartTimeTrackingCommand {
  entryId: string;
  projectId: string;
  projectPath: string;
  sceneId?: string;
  shotId?: string;
  software: SoftwareName;
  pid: number;
}

export interface StopTimeTrackingCommand {
  entryId: string;
}

export interface PauseTimeTrackingCommand {
  entryId: string;
}

export interface ResumeTimeTrackingCommand {
  entryId: string;
}