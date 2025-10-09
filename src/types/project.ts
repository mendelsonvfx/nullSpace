// src/types/project.ts

export type SoftwareName = 
  | 'blender'
  | 'houdini'
  | 'after-effects'
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
  cost?: number;
  currency?: Currency;
  paymentStatus?: PaymentStatus;
  prepaymentAmount?: number;
  clientId?: string;
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
        subfolders: ['Exported', 'Imported']
      },
      {
        name: 'Cache',
        subfolders: ['Temp', 'Sim', 'Bake']
      },
      {
        name: 'Render',
        subfolders: ['Preview', 'Final', 'Passes']
      },
      {
        name: 'Assets',
        subfolders: ['Shaders', 'Materials', 'Models', 'HDRI', 'Presets']
      },
      'Notes'
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
}

export interface LaunchSoftwareCommand {
  projectPath: string;
  software: string;
  executablePath: string;
  projectName: string;
}