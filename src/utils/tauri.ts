// src/utils/tauri.ts
import { invoke } from '@tauri-apps/api/tauri';
export const tauriCommands = {
  async createProject(input: any): Promise<any> {
    return invoke('create_project', { input });
  },

  async loadProjects(projectsDir: string): Promise<any[]> {
    return invoke('load_projects', { projectsDir });
  },

  async updateProject(project: any): Promise<void> {
    return invoke('update_project', { project });
  },

  async deleteProject(projectPath: string): Promise<void> {
    return invoke('delete_project', { projectPath });
  },

  async launchSoftware(input: any): Promise<void> {
    return invoke('launch_software', { input });
  },

  async openInExplorer(path: string): Promise<void> {
    return invoke('open_in_explorer', { path });
  }
};

export async function selectProjectDirectory(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/api/dialog');
    const selected = await open({
      directory: true,
      multiple: false
    });
    return selected as string | null;
  } catch (error) {
    console.error('Failed to open directory dialog:', error);
    return null;
  }
}

export async function selectExecutable(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/api/dialog');
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Executable',
        extensions: ['exe', 'app', 'bat', 'sh']
      }]
    });
    return selected as string | null;
  } catch (error) {
    console.error('Failed to open file dialog:', error);
    return null;
  }
}

export async function selectImageFile(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/api/dialog');
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Image',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
      }]
    });
    return selected as string | null;
  } catch (error) {
    console.error('Failed to open file dialog:', error);
    return null;
  }
}

export async function getUserHomeDir(): Promise<string> {
  return '';
}

export async function getDefaultProjectsDirectory(): Promise<string> {
  return './projects';
}

export function getSoftwarePaths(_softwareName: string): string[] {
  return [];
}

export async function detectInstalledSoftware(): Promise<Record<string, string>> {
  return {};
}

export class TauriError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message);
    this.name = 'TauriError';
  }
}

export function handleTauriError(error: unknown): TauriError {
  if (error instanceof Error) {
    return new TauriError(error.message, error);
  }
  return new TauriError('Unknown Tauri error', error);
}

export const storage = {
  getProjectsDirectory(): string | null {
    return null;
  },
  setProjectsDirectory(_path: string): void {},
  getSoftwarePaths(): Record<string, string> { return {}; },
  setSoftwarePaths(_paths: Record<string, string>): void {},
  getRecentProjects(): string[] { return []; },
  addRecentProject(_projectId: string): void {},
  getTheme(): 'light' | 'dark' { return 'dark'; },
  setTheme(_theme: 'light' | 'dark'): void {}
};