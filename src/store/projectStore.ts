// src/store/projectStore.ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import type { Project, CreateProjectCommand, LaunchSoftwareCommand, Client, TimeEntry, SoftwareName } from '../types/project';
import { thumbnailCache } from '../utils/thumbnailCache';
import { useTimeStatsStore, useTimeTrackingStore } from '../features/time-tracking';
import { generateProjectColor, generateBrightColor } from '../utils/colorUtils';

// Sanitize scene name for folder name (remove spaces and special characters)
const sanitizeFolderName = (name: string): string => {
  return name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_-]/g, '');
};

interface ProjectStore {
  // State
  projects: Project[];
  selectedProject: Project | null;
  isLoading: boolean;
  error: string | null;
  projectsDirectory: string;
  defaultProjectsPath: string;
  clients: Client[];
  categories: string[];
  selectedCategory: string;
  launchingStatus: Record<string, 'idle' | 'launching' | 'success'>; // track launch status per software

  // Actions
  loadProjects: () => Promise<void>;
  createProject: (input: CreateProjectCommand) => Promise<void>;
  updateProject: (project: Project) => Promise<void>;
  deleteProject: (projectPath: string) => Promise<void>;
  selectProject: (project: Project | null) => void;
  launchSoftware: (input: LaunchSoftwareCommand) => Promise<void>;
  openInExplorer: (path: string) => Promise<void>;
  setProjectsDirectory: (dir: string) => void;
  setDefaultProjectsPath: (path: string) => void;
  addNote: (projectId: string, content: string) => void;
  updateNote: (projectId: string, noteId: string, content: string) => void;
  deleteNote: (projectId: string, noteId: string) => void;
  addTag: (projectId: string, tag: string) => void;
  removeTag: (projectId: string, tag: string) => void;
  updateStatus: (projectId: string, status: Project['status']) => void;
  updateDeadline: (projectId: string, deadline: string | undefined) => void;
  addBrowserTab: (projectId: string, url: string, title: string) => void;
  removeBrowserTab: (projectId: string, tabId: string) => void;
  addTodo: (projectId: string, text: string) => void;
  toggleTodo: (projectId: string, todoId: string) => void;
  removeTodo: (projectId: string, todoId: string) => void;
  addLink: (projectId: string, url: string, title: string) => string;
  updateLink: (projectId: string, linkId: string, newTitle: string) => void;
  removeLink: (projectId: string, linkId: string) => void;
  toggleFavorite: (projectId: string) => void;
  togglePin: (projectId: string) => void;
  addClient: (client: Omit<Client, 'id'> & { id?: string }) => string;
  updateClient: (clientId: string, updates: Partial<Client>) => void;
  deleteClient: (clientId: string) => void;
  getClientById: (clientId: string) => Client | undefined;
  // Category management
  addCategory: (name: string) => void;
  removeCategory: (name: string) => void;
  renameCategory: (oldName: string, newName: string) => void;
  setSelectedCategory: (category: string) => void;
  // Migration
  migrateProjectToScenes: (project: Project) => Project;
  // Scene management
  addScene: (projectId: string, name?: string) => void;
  removeScene: (projectId: string, sceneId: string) => Promise<void>;
  renameScene: (projectId: string, sceneId: string, newName: string) => Promise<void>;
  setSceneDescription: (projectId: string, sceneId: string, description: string) => void;
  setCurrentScene: (projectId: string, sceneId: string | null) => void;
  toggleSceneCompleted: (projectId: string, sceneId: string) => void;
  addSceneNote: (projectId: string, sceneId: string, content: string) => void;
  updateSceneNote: (projectId: string, sceneId: string, noteId: string, content: string) => void;
  deleteSceneNote: (projectId: string, sceneId: string, noteId: string) => void;
  addSceneTodo: (projectId: string, sceneId: string, text: string) => void;
  toggleSceneTodo: (projectId: string, sceneId: string, todoId: string) => void;
  removeSceneTodo: (projectId: string, sceneId: string, todoId: string) => void;
  addSceneBrowserTab: (projectId: string, sceneId: string, url: string, title: string) => void;
  removeSceneBrowserTab: (projectId: string, sceneId: string, tabId: string) => void;
  addSceneLink: (projectId: string, sceneId: string, url: string, title: string) => string;
  updateSceneLink: (projectId: string, sceneId: string, linkId: string, newTitle: string) => void;
  removeSceneLink: (projectId: string, sceneId: string, linkId: string) => void;
  // Shot management
  addShot: (projectId: string, sceneId?: string, name?: string) => void;
  removeShot: (projectId: string, shotId: string) => Promise<void>;
  renameShot: (projectId: string, shotId: string, newName: string) => Promise<void>;
  setCurrentShot: (projectId: string, shotId: string | null) => void;
  toggleShotCompleted: (projectId: string, shotId: string) => void;
  setShotStatus: (projectId: string, shotId: string, status: 'none' | 'wip' | 'done') => void;
  addShotNote: (projectId: string, shotId: string, content: string) => void;
  updateShotNote: (projectId: string, shotId: string, noteId: string, content: string) => void;
  deleteShotNote: (projectId: string, shotId: string, noteId: string) => void;
  addShotTodo: (projectId: string, shotId: string, text: string) => void;
  toggleShotTodo: (projectId: string, shotId: string, todoId: string) => void;
  removeShotTodo: (projectId: string, shotId: string, todoId: string) => void;
  addShotBrowserTab: (projectId: string, shotId: string, url: string, title: string) => void;
  removeShotBrowserTab: (projectId: string, shotId: string, tabId: string) => void;
  addShotLink: (projectId: string, shotId: string, url: string, title: string) => string;
  updateShotLink: (projectId: string, shotId: string, linkId: string, newTitle: string) => void;
  removeShotLink: (projectId: string, shotId: string, linkId: string) => void;
  // Special context management (Assets/Compose)
  setSpecialContext: (projectId: string, contextType: 'asset' | 'compose', sceneId?: string) => void;
  clearSpecialContext: (projectId: string) => void;
  // Special context data management
  addSpecialContextLink: (projectId: string, contextId: string, url: string, title: string) => string;
  updateSpecialContextLink: (projectId: string, contextId: string, linkId: string, newTitle: string) => void;
  removeSpecialContextLink: (projectId: string, contextId: string, linkId: string) => void;
  addSpecialContextTodo: (projectId: string, contextId: string, text: string) => void;
  toggleSpecialContextTodo: (projectId: string, contextId: string, todoId: string) => void;
  removeSpecialContextTodo: (projectId: string, contextId: string, todoId: string) => void;
  addSpecialContextNote: (projectId: string, contextId: string, content: string) => void;
  updateSpecialContextNote: (projectId: string, contextId: string, noteId: string, content: string) => void;
  removeSpecialContextNote: (projectId: string, contextId: string, noteId: string) => void;
  // Preview management
  setScenePreview: (projectId: string, sceneId: string) => Promise<void>;
  setShotPreview: (projectId: string, shotId: string) => Promise<void>;
  // Time tracking (project data only - session management moved to time-tracking feature)
  addManualTimeEntry: (projectId: string, software: SoftwareName, durationMinutes: number, date: string, shotId?: string, notes?: string, countInStats?: boolean) => void;
  removeTimeEntry: (projectId: string, entryId: string) => void;
  getActiveTimeEntry: (projectId: string) => TimeEntry | undefined;
  updateTargetHourlyRate: (projectId: string, rate: number) => void;
}

// Private update queue to prevent race conditions
let updateQueue: Promise<void> = Promise.resolve();

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Initial state
  projects: [],
  selectedProject: null,
  isLoading: false,
  error: null,
  projectsDirectory: '',
  defaultProjectsPath: typeof window !== 'undefined' ? (localStorage.getItem('defaultProjectsPath') || 'E:\\Projects\\Personal') : 'E:\\Projects\\Personal',
  clients: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('clients') || '[]') : [],
  categories: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('categories') || '["Commercial", "Personal"]') : ['Commercial', 'Personal'],
  selectedCategory: typeof window !== 'undefined' ? (localStorage.getItem('selectedCategory') || 'Personal') : 'Personal',
  launchingStatus: {},

  // Load all projects
  loadProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projectsDir = get().projectsDirectory || get().defaultProjectsPath;
      console.log('Loading projects from:', projectsDir);
      const projects = await invoke<Project[]>('load_projects', {
        projectsDir
      });
      console.log('Loaded projects:', projects.length);

      // Migrate projects to scene-based structure if needed
      const migratedProjects = projects.map(project => get().migrateProjectToScenes(project));

      // Save migrated projects back to disk
      const migrationPromises = migratedProjects
        .filter((project, index) => project !== projects[index]) // Only save if migrated
        .map(project => invoke('update_project', { project }));

      if (migrationPromises.length > 0) {
        await Promise.all(migrationPromises);
        console.log(`[Migration] Migrated ${migrationPromises.length} projects to scene-based structure`);
      }

      // Clean up stale active sessions (processes that no longer exist)
      const cleanedProjects = await Promise.all(
        migratedProjects.map(async (project) => {
          const activeEntries = project.timeEntries?.filter(e => e.isActive && e.pid) || [];

          if (activeEntries.length === 0) {
            return project;
          }

          console.log(`[TimeTracking] Checking ${activeEntries.length} active sessions for project "${project.name}"`);

          // Check each active entry to see if process still exists
          const updatedEntries = await Promise.all(
            (project.timeEntries || []).map(async (entry) => {
              if (!entry.isActive || !entry.pid) {
                return entry;
              }

              try {
                // Check if process is alive
                const isAlive = await invoke<boolean>('check_process_alive', { pid: entry.pid });

                if (!isAlive) {
                  console.log(`[TimeTracking] Process ${entry.pid} no longer exists, closing session ${entry.id} with ${entry.durationMinutes}m`);

                  // Close the session - keep existing durationMinutes (don't recalculate)
                  const now = new Date().toISOString();

                  return {
                    ...entry,
                    isActive: false,
                    endTime: now,
                    // Keep the existing durationMinutes - it was already being tracked
                    widgetVisible: false
                  };
                }
              } catch (error) {
                console.error(`[TimeTracking] Error checking process ${entry.pid}:`, error);
              }

              return entry;
            })
          );

          // If any entries were modified, update the project
          const hasChanges = updatedEntries.some((entry, i) =>
            entry !== (project.timeEntries || [])[i]
          );

          if (hasChanges) {
            // DON'T recalculate totalMinutesSpent - it's now updated in real-time!
            // Only update activeMinutes
            const activeMinutes = updatedEntries
              .filter(e => e.isActive)
              .reduce((sum, e) => sum + e.durationMinutes, 0);

            const updatedProject = {
              ...project,
              timeEntries: updatedEntries,
              // Keep existing totalMinutesSpent - it's already up-to-date from real-time updates
              currentProjectTime: activeMinutes,
              updatedAt: new Date().toISOString()
            };

            // Save the updated project
            try {
              await invoke('update_project', { project: updatedProject });
              console.log(`[TimeTracking] Cleaned up stale sessions for project "${project.name}". Total: ${updatedProject.totalMinutesSpent}m, Active: ${activeMinutes}m`);
              return updatedProject;
            } catch (error) {
              console.error(`[TimeTracking] Failed to save cleaned project:`, error);
            }
          }

          return project;
        })
      );

      set({ projects: cleanedProjects, isLoading: false });
      console.log('[ProjectStore] Projects loaded successfully');
      // NOTE: Global statistics are persisted in localStorage via timeStatsStore
      // Stats are incremented in real-time, not recalculated from timeEntries
    } catch (error) {
      set({ error: String(error), isLoading: false });
      console.error('Failed to load projects:', error);
    }
  },

  // Create new project
  createProject: async (input: CreateProjectCommand) => {
    set({ isLoading: true, error: null });
    try {
      const project = await invoke<Project>('create_project', { input });

      // Generate random color for project
      project.color = generateProjectColor(project.id);

      // Create Scene 001 if hasScenes is enabled
      if (project.hasScenes) {
        const firstScene = {
          id: crypto.randomUUID(),
          number: 1,
          name: 'Scene 001',
          notes: [],
          todos: [],
          browserTabs: [],
          links: []
        };

        project.scenes = [firstScene];
        project.currentSceneId = firstScene.id;

        // Create Scene001 folders
        const firstSceneCode = sanitizeFolderName(firstScene.name);
        try {
          await invoke('create_scene_folders', {
            input: {
              projectPath: project.path,
              sceneCode: firstSceneCode
            }
          });
        } catch (error) {
          console.error('Failed to create first scene folders:', error);
        }

        // If both scenes and shots, create Shot 001 inside Scene 001
        if (project.hasShots) {
          const firstShot = {
            id: crypto.randomUUID(),
            sceneId: firstScene.id,
            number: 1,
            name: 'Shot 001',
            notes: [],
            todos: [],
            browserTabs: [],
            links: []
          };

          project.shots = [firstShot];
          project.currentShotId = firstShot.id;

          // Create SH001 folders
          try {
            await invoke('create_shot_folders', {
              input: {
                project_path: project.path,
                scene_code: firstSceneCode,
                shot_code: 'SH001'
              }
            });
          } catch (error) {
            console.error('Failed to create first shot folders:', error);
          }
        }
      } else if (project.hasShots) {
        // Only shots, no scenes - legacy mode
        const firstShot = {
          id: crypto.randomUUID(),
          sceneId: '', // No scene
          number: 1,
          name: 'Shot 001',
          notes: [],
          todos: [],
          browserTabs: [],
          links: []
        };

        project.shots = [firstShot];
        project.currentShotId = firstShot.id;
      }

      // Save the updated project with color (and Shot 001 if applicable)
      await invoke('update_project', { project });

      set(state => ({
        projects: [project, ...state.projects],
        selectedProject: project,
        isLoading: false
      }));
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // Update existing project
  updateProject: async (project: Project) => {
    // Queue updates to prevent race conditions (multiple parallel writes)
    updateQueue = updateQueue
      .then(async () => {
        try {
          // Clear thumbnail cache if thumbnail changed
          const oldProject = get().projects.find(p => p.id === project.id);
          if (oldProject && oldProject.thumbnail !== project.thumbnail) {
            if (oldProject.thumbnail) {
              thumbnailCache.clear(oldProject.path, oldProject.thumbnail);
            }
          }

          // Log active entry durationMinutes before update
          const oldActiveEntry = oldProject?.timeEntries?.find(e => e.isActive);
          const newActiveEntry = project.timeEntries?.find(e => e.isActive);
          console.log(`[updateProject] 📝 Updating project ${project.name}`);
          console.log(`[updateProject] 📊 Active entry durationMinutes: ${oldActiveEntry?.durationMinutes} → ${newActiveEntry?.durationMinutes}`);

          // First update local state synchronously
          set(state => ({
            projects: state.projects.map(p =>
              p.id === project.id ? project : p
            ),
            selectedProject: state.selectedProject?.id === project.id
              ? project
              : state.selectedProject
          }));

          // Then save to backend asynchronously
          await invoke('update_project', { project });
        } catch (error) {
          set({ error: String(error) });
          console.error('[updateProject] ❌ Failed to update project:', error);
        }
      })
      .catch(err => console.error('[updateProject] ❌ Queue error:', err));

    // Wait for the queued update to complete
    return updateQueue;
  },

  // Delete project
  deleteProject: async (projectPath: string) => {
    set({ isLoading: true, error: null });
    try {
      // Clear all thumbnails for this project from cache
      thumbnailCache.clearProject(projectPath);

      await invoke('delete_project', { projectPath });
      set(state => ({
        projects: state.projects.filter(p => p.path !== projectPath),
        selectedProject: state.selectedProject?.path === projectPath
          ? null
          : state.selectedProject,
        isLoading: false
      }));
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // Select project
  selectProject: (project: Project | null) => {
    set({ selectedProject: project });
  },

  // Launch software
  launchSoftware: async (input: LaunchSoftwareCommand) => {
    const statusKey = `${input.projectPath}-${input.software}`;

    try {
      // Set launching status
      set((state) => ({
        launchingStatus: { ...state.launchingStatus, [statusKey]: 'launching' }
      }));

      console.log('Launching software with input:', input);
      const result = await invoke<{ file_name: string; pid: number }>('launch_software', { input });
      console.log('Software launched successfully, created file:', result.file_name, 'PID:', result.pid);

      // Set success status
      set((state) => ({
        launchingStatus: { ...state.launchingStatus, [statusKey]: 'success' }
      }));

      // Reset status after 2 seconds
      setTimeout(() => {
        set((state) => ({
          launchingStatus: { ...state.launchingStatus, [statusKey]: 'idle' }
        }));
      }, 2000);

      // Dispatch event to update versions list for this specific project
      window.dispatchEvent(new CustomEvent('version-created', {
        detail: { projectPath: input.projectPath }
      }));

      // Start time tracking using new time-tracking module (only if enabled)
      const timeTrackingEnabled = localStorage.getItem('timeTrackingEnabled');
      const isTimeTrackingEnabled = timeTrackingEnabled !== null ? JSON.parse(timeTrackingEnabled) : true;

      if (!isTimeTrackingEnabled) {
        console.log('[TimeTracking] ⏸️  Time tracking is disabled, skipping session creation');
        return;
      }

      const project = get().projects.find(p => p.path === input.projectPath);
      console.log('[TimeTracking] Found project:', project?.name, 'for path:', input.projectPath);

      if (project) {
        try {
          const sceneId = input.sceneNumber
            ? project.scenes?.find(s => s.number === input.sceneNumber)?.id
            : undefined;

          const shotId = input.shotNumber
            ? project.shots?.find(s => s.number === input.shotNumber)?.id
            : undefined;

          // input.software is already lowercase SoftwareName from Software.name
          const softwareKey = input.software as SoftwareName;
          console.log('[TimeTracking] Starting tracking for software:', softwareKey, 'PID:', result.pid, 'Scene:', sceneId, 'Shot:', shotId);

          // Use new time-tracking module
          const { startSession, getSession } = useTimeTrackingStore.getState();
          const entryId = await startSession({
            projectId: project.id,
            projectPath: project.path,
            software: softwareKey,
            pid: result.pid,
            sceneId,
            shotId
          });

          // Get the created entry from timeTrackingStore
          const timeEntry = getSession(entryId);
          if (timeEntry) {
            // Add the entry to project's timeEntries
            const updatedProject = {
              ...project,
              timeEntries: [...(project.timeEntries || []), timeEntry]
            };
            get().updateProject(updatedProject);
            console.log('[TimeTracking] ✓ Time entry added to project');
          }

          console.log('[TimeTracking] ✓ Time tracking started for', softwareKey);
        } catch (error) {
          console.error('[TimeTracking] ✗ Failed to start time tracking:', error);
          // Don't throw - software launch was successful
        }
      } else {
        console.error('[TimeTracking] ✗ Project not found for path:', input.projectPath);
      }
    } catch (error) {
      console.error('Failed to launch software:', error);

      // Reset status on error
      set((state) => ({
        error: String(error),
        launchingStatus: { ...state.launchingStatus, [statusKey]: 'idle' }
      }));

      alert(`Failed to launch software: ${error}`);
      throw error;
    }
  },

  // Open project in file explorer
  openInExplorer: async (path: string) => {
    try {
      console.log('Open:', path);
      await invoke('open_in_explorer', { path });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Set projects directory
  setProjectsDirectory: (dir: string) => {
    set({ projectsDirectory: dir });
    if (typeof window !== 'undefined') {
      localStorage.setItem('projectsDirectory', dir);
    }
  },

  // Set default projects path
  setDefaultProjectsPath: (path: string) => {
    set({ defaultProjectsPath: path });
    if (typeof window !== 'undefined') {
      localStorage.setItem('defaultProjectsPath', path);
    }
  },

  // Add note to project
  addNote: (projectId: string, content: string) => {
    const newNote = {
      id: crypto.randomUUID(),
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Find and update project
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = { ...project, notes: [...project.notes, newNote] };
      // updateProject now handles both state update and backend save
      get().updateProject(updated);
    }
  },

  // Update note
  updateNote: (projectId: string, noteId: string, content: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = {
        ...project,
        notes: project.notes.map(n =>
          n.id === noteId
            ? { ...n, content, updatedAt: new Date().toISOString() }
            : n
        )
      };
      get().updateProject(updated);
    }
  },

  // Delete note
  deleteNote: (projectId: string, noteId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = {
        ...project,
        notes: project.notes.filter(n => n.id !== noteId)
      };
      get().updateProject(updated);
    }
  },

  // Add tag
  addTag: (projectId: string, tag: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && !project.tags.includes(tag)) {
      const updated = { ...project, tags: [...project.tags, tag] };
      get().updateProject(updated);
    }
  },

  // Remove tag
  removeTag: (projectId: string, tag: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = { ...project, tags: project.tags.filter(t => t !== tag) };
      get().updateProject(updated);
    }
  },

  // Update status
  updateStatus: (projectId: string, status: Project['status']) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      // Set completedAt when status changes to 'completed' and it's not already set
      const completedAt = status === 'completed'
        ? (project.completedAt || new Date().toISOString())
        : project.completedAt;
      const updated = { ...project, status, completedAt };
      get().updateProject(updated);
    }
  },

  // Update deadline
  updateDeadline: (projectId: string, deadline: string | undefined) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = { ...project, deadline };
      get().updateProject(updated);
    }
  },

  // Add browser tab
  addBrowserTab: (projectId: string, url: string, title: string) => {
    const newTab = {
      id: crypto.randomUUID(),
      url,
      title,
      isPinned: false
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = { ...project, browserTabs: [...project.browserTabs, newTab] };
      get().updateProject(updated);
    }
  },

  // Remove browser tab
  removeBrowserTab: (projectId: string, tabId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = {
        ...project,
        browserTabs: project.browserTabs.filter((t: any) => t.id !== tabId)
      };
      get().updateProject(updated);
    }
  },

  // Add todo
  addTodo: (projectId: string, text: string) => {
    const newTodo = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: new Date().toISOString()
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = { ...project, todos: [...(project.todos || []), newTodo] };
      get().updateProject(updated);
    }
  },

  // Toggle todo completed state
  toggleTodo: (projectId: string, todoId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = {
        ...project,
        todos: (project.todos || []).map(t =>
          t.id === todoId ? { ...t, completed: !t.completed } : t
        )
      };
      get().updateProject(updated);
    }
  },

  // Remove todo
  removeTodo: (projectId: string, todoId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = {
        ...project,
        todos: (project.todos || []).filter(t => t.id !== todoId)
      };
      get().updateProject(updated);
    }
  },

  // Add link
  addLink: (projectId: string, url: string, title: string) => {
    const newLink = {
      id: crypto.randomUUID(),
      url,
      title
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = { ...project, links: [...(project.links || []), newLink] };
      get().updateProject(updated);
    }

    return newLink.id;
  },

  // Update link title
  updateLink: (projectId: string, linkId: string, newTitle: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = {
        ...project,
        links: (project.links || []).map(l =>
          l.id === linkId ? { ...l, title: newTitle } : l
        )
      };
      get().updateProject(updated);
    }
  },

  // Remove link
  removeLink: (projectId: string, linkId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = {
        ...project,
        links: (project.links || []).filter(l => l.id !== linkId)
      };
      get().updateProject(updated);
    }
  },

  // Toggle favorite
  toggleFavorite: (projectId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = { ...project, isFavorite: !project.isFavorite };
      get().updateProject(updated);
    }
  },

  // Toggle pin
  togglePin: (projectId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project) {
      const updated = { ...project, isPinned: !project.isPinned };
      get().updateProject(updated);
    }
  },

  // Add client
  addClient: (client: Omit<Client, 'id'> & { id?: string }) => {
    const newClient: Client = {
      id: client.id || crypto.randomUUID(),
      name: client.name,
      color: client.color || generateBrightColor(),
      description: client.description,
      website: client.website,
      telegram: client.telegram,
      instagram: client.instagram,
    };

    set(state => {
      const updatedClients = [...state.clients, newClient];
      if (typeof window !== 'undefined') {
        localStorage.setItem('clients', JSON.stringify(updatedClients));
      }
      return { clients: updatedClients };
    });

    return newClient.id;
  },

  // Update client
  updateClient: (clientId: string, updates: Partial<Client>) => {
    set(state => {
      const updatedClients = state.clients.map(c =>
        c.id === clientId ? { ...c, ...updates } : c
      );
      if (typeof window !== 'undefined') {
        localStorage.setItem('clients', JSON.stringify(updatedClients));
      }
      return { clients: updatedClients };
    });
  },

  // Delete client
  deleteClient: (clientId: string) => {
    set(state => {
      const updatedClients = state.clients.filter(c => c.id !== clientId);
      if (typeof window !== 'undefined') {
        localStorage.setItem('clients', JSON.stringify(updatedClients));
      }
      return { clients: updatedClients };
    });
  },

  // Get client by ID
  getClientById: (clientId: string) => {
    return get().clients.find(c => c.id === clientId);
  },

  // Migration function for projects with shots but no scenes
  migrateProjectToScenes: (project: Project): Project => {
    // Only migrate if project has shots but no scenes
    if (project.hasShots && !project.scenes && project.shots && project.shots.length > 0) {
      console.log(`[Migration] Migrating project "${project.name}" to scene-based structure`);

      // Create Scene 001
      const firstScene = {
        id: crypto.randomUUID(),
        number: 1,
        name: 'Scene 001',
        description: undefined,
        notes: [],
        todos: [],
        browserTabs: [],
        links: []
      };

      // Assign all existing shots to Scene 001
      const migratedShots = project.shots.map(shot => ({
        ...shot,
        sceneId: firstScene.id
      }));

      return {
        ...project,
        scenes: [firstScene],
        currentSceneId: firstScene.id,
        shots: migratedShots,
        updatedAt: new Date().toISOString()
      };
    }

    return project;
  },

  // Scene management
  addScene: async (projectId: string, name?: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      // Count existing numbered scenes (exclude 'Main' scene which has number 0)
      const numberedScenes = (project.scenes || []).filter(s => s.number > 0);
      const sceneNumber = numberedScenes.length + 1;
      const newScene = {
        id: crypto.randomUUID(),
        number: sceneNumber,
        name: name || `Scene ${sceneNumber.toString().padStart(3, '0')}`,
        description: undefined,
        todos: [],
        notes: [],
        browserTabs: [],
        links: []
      };

      // Create scene code for folder creation (sanitize the name)
      const sceneCode = sanitizeFolderName(newScene.name);

      // Create scene folders dynamically
      try {
        await invoke('create_scene_folders', {
          input: {
            projectPath: project.path,
            sceneCode: sceneCode
          }
        });
      } catch (error) {
        console.error('Failed to create scene folders:', error);
      }

      let updatedShots = project.shots || [];
      let newShotId: string | undefined = undefined;

      // If project has shots, create Shot 001 for this scene
      if (project.hasShots) {
        const newShot = {
          id: crypto.randomUUID(),
          sceneId: newScene.id,
          number: 1,
          name: 'Shot 001',
          todos: [],
          notes: [],
          browserTabs: [],
          links: []
        };

        updatedShots = [...updatedShots, newShot];
        newShotId = newShot.id;

        // Create SH001 folders
        try {
          await invoke('create_shot_folders', {
            input: {
              project_path: project.path,
              scene_code: sceneCode,
              shot_code: 'SH001'
            }
          });
        } catch (error) {
          console.error('Failed to create main shot folders:', error);
        }
      }

      const updated = {
        ...project,
        scenes: [...(project.scenes || []), newScene],
        shots: updatedShots,
        currentSceneId: newScene.id,
        currentShotId: newShotId || project.currentShotId
      };
      get().updateProject(updated);
    }
  },

  removeScene: async (projectId: string, sceneId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      // Prevent removing the last scene
      if ((project.scenes || []).length <= 1) {
        console.warn('Cannot remove the last scene');
        return;
      }

      // Find scene to get its number
      const scene = project.scenes?.find(s => s.id === sceneId);
      if (scene) {
        // Delete all version files for this scene
        try {
          const { invoke } = await import('@tauri-apps/api/tauri');
          const deletedCount = await invoke<number>('delete_scene_files', {
            projectPath: project.path,
            sceneNumber: scene.number
          });
          console.log(`Deleted ${deletedCount} files for scene ${scene.number}`);
        } catch (error) {
          console.error('Failed to delete scene files:', error);
        }
      }

      const updated = {
        ...project,
        scenes: (project.scenes || []).filter(s => s.id !== sceneId),
        currentSceneId: project.currentSceneId === sceneId ? (project.scenes?.[0]?.id || undefined) : project.currentSceneId
      };
      get().updateProject(updated);
    }
  },

  renameScene: async (projectId: string, sceneId: string, newName: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const scene = (project.scenes || []).find(s => s.id === sceneId);
      if (!scene) return;

      // Generate sanitized folder names for old and new scene names
      const oldFolderName = sanitizeFolderName(scene.name);
      const newFolderName = sanitizeFolderName(newName);

      // Only rename folders if the sanitized names are different
      if (oldFolderName !== newFolderName) {
        try {
          await invoke('rename_scene_folders', {
            projectPath: project.path,
            oldFolderName: oldFolderName,
            newFolderName: newFolderName
          });
        } catch (error) {
          console.error('Failed to rename scene folders:', error);
          // Don't update metadata if folder rename failed
          return;
        }
      }

      // Update metadata only after successful folder rename (or if no rename was needed)
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s => {
          if (s.id === sceneId) {
            // Extract number from new name (e.g., "Scene 777" -> 777)
            const match = newName.match(/\d+/);
            const newNumber = match ? parseInt(match[0]) : s.number;
            return { ...s, name: newName, number: newNumber };
          }
          return s;
        })
      };
      get().updateProject(updated);
    }
  },

  setSceneDescription: (projectId: string, sceneId: string, description: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s => {
          if (s.id === sceneId) {
            return { ...s, description: description.trim() || undefined };
          }
          return s;
        })
      };
      get().updateProject(updated);
    }
  },

  setCurrentScene: (projectId: string, sceneId: string | null) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      let updatedCurrentShotId = project.currentShotId;

      if (sceneId && project.hasShots) {
        const sceneShotsExist = (project.shots || []).some(s => s.sceneId === sceneId);

        // Check if we have a saved shot preference for this scene
        const savedShotId = project.sceneShotPreferences?.[sceneId];
        const savedShotExists = savedShotId
          ? (project.shots || []).some(s => s.id === savedShotId && s.sceneId === sceneId)
          : false;

        if (savedShotExists) {
          // Restore saved shot selection for this scene
          updatedCurrentShotId = savedShotId;
        } else {
          // No saved preference or shot doesn't exist, check if current shot is in this scene
          const currentShotInScene = project.currentShotId
            ? (project.shots || []).find(s => s.id === project.currentShotId && s.sceneId === sceneId)
            : null;

          if (!currentShotInScene && sceneShotsExist) {
            // Select first shot in this scene
            const firstShot = (project.shots || [])
              .filter(s => s.sceneId === sceneId)
              .sort((a, b) => a.number - b.number)[0];

            if (firstShot) {
              updatedCurrentShotId = firstShot.id;
            }
          }
        }
      }

      const updated = {
        ...project,
        currentSceneId: sceneId || undefined,
        currentShotId: updatedCurrentShotId,
        currentSpecialContextId: undefined // Clear special context when selecting a scene
      };
      get().updateProject(updated);
    }
  },

  toggleSceneCompleted: (projectId: string, sceneId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s => {
          if (s.id === sceneId) {
            // Cycle through: none → wip → completed → none
            if (!s.wip && !s.completed) {
              return { ...s, wip: true, completed: false };
            } else if (s.wip && !s.completed) {
              return { ...s, wip: false, completed: true };
            } else {
              return { ...s, wip: false, completed: false };
            }
          }
          return s;
        })
      };
      get().updateProject(updated);
    }
  },

  addSceneNote: (projectId: string, sceneId: string, content: string) => {
    const newNote = {
      id: crypto.randomUUID(),
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s =>
          s.id === sceneId ? { ...s, notes: [...s.notes, newNote] } : s
        )
      };
      get().updateProject(updated);
    }
  },

  updateSceneNote: (projectId: string, sceneId: string, noteId: string, content: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s =>
          s.id === sceneId
            ? {
                ...s,
                notes: s.notes.map(n =>
                  n.id === noteId ? { ...n, content, updatedAt: new Date().toISOString() } : n
                )
              }
            : s
        )
      };
      get().updateProject(updated);
    }
  },

  deleteSceneNote: (projectId: string, sceneId: string, noteId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s =>
          s.id === sceneId ? { ...s, notes: s.notes.filter(n => n.id !== noteId) } : s
        )
      };
      get().updateProject(updated);
    }
  },

  addSceneTodo: (projectId: string, sceneId: string, text: string) => {
    const newTodo = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s =>
          s.id === sceneId ? { ...s, todos: [...s.todos, newTodo] } : s
        )
      };
      get().updateProject(updated);
    }
  },

  toggleSceneTodo: (projectId: string, sceneId: string, todoId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s =>
          s.id === sceneId
            ? {
                ...s,
                todos: s.todos.map(t =>
                  t.id === todoId ? { ...t, completed: !t.completed } : t
                )
              }
            : s
        )
      };
      get().updateProject(updated);
    }
  },

  removeSceneTodo: (projectId: string, sceneId: string, todoId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s =>
          s.id === sceneId ? { ...s, todos: s.todos.filter(t => t.id !== todoId) } : s
        )
      };
      get().updateProject(updated);
    }
  },

  addSceneBrowserTab: (projectId: string, sceneId: string, url: string, title: string) => {
    const newTab = {
      id: crypto.randomUUID(),
      url,
      title,
      isPinned: false,
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s =>
          s.id === sceneId ? { ...s, browserTabs: [...s.browserTabs, newTab] } : s
        )
      };
      get().updateProject(updated);
    }
  },

  removeSceneBrowserTab: (projectId: string, sceneId: string, tabId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s =>
          s.id === sceneId ? { ...s, browserTabs: s.browserTabs.filter(t => t.id !== tabId) } : s
        )
      };
      get().updateProject(updated);
    }
  },

  addSceneLink: (projectId: string, sceneId: string, url: string, title: string): string => {
    const newLink = {
      id: crypto.randomUUID(),
      url,
      title,
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s =>
          s.id === sceneId ? { ...s, links: [...s.links, newLink] } : s
        )
      };
      get().updateProject(updated);
    }

    return newLink.id;
  },

  updateSceneLink: (projectId: string, sceneId: string, linkId: string, newTitle: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s =>
          s.id === sceneId
            ? {
                ...s,
                links: s.links.map(l =>
                  l.id === linkId ? { ...l, title: newTitle } : l
                )
              }
            : s
        )
      };
      get().updateProject(updated);
    }
  },

  removeSceneLink: (projectId: string, sceneId: string, linkId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasScenes) {
      const updated = {
        ...project,
        scenes: (project.scenes || []).map(s =>
          s.id === sceneId ? { ...s, links: s.links.filter(l => l.id !== linkId) } : s
        )
      };
      get().updateProject(updated);
    }
  },

  // Shot management
  addShot: async (projectId: string, sceneId?: string, name?: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      // Use provided sceneId or current scene
      const targetSceneId = sceneId || project.currentSceneId;

      // In shots-only mode (hasScenes=false), allow empty sceneId
      if (!targetSceneId && project.hasScenes) {
        console.warn('Cannot add shot: no scene specified or selected');
        return;
      }

      // Per-scene shot numbering: count only numbered shots in target scene (or all shots if no scenes)
      const numberedShotsInScene = (project.shots || []).filter(
        s => (targetSceneId ? s.sceneId === targetSceneId : true) && s.number > 0
      );
      const shotNumber = numberedShotsInScene.length + 1;

      const newShot = {
        id: crypto.randomUUID(),
        sceneId: targetSceneId || undefined, // Assign to target scene or undefined in shots-only mode
        number: shotNumber,
        name: name || `Shot ${shotNumber.toString().padStart(3, '0')}`,
        todos: [],
        notes: [],
        browserTabs: [],
        links: []
      };

      // Get scene code for folder creation
      const currentScene = targetSceneId ? (project.scenes || []).find(s => s.id === targetSceneId) : null;
      if (currentScene) {
        const sceneCode = sanitizeFolderName(currentScene.name);
        const shotCode = `SH${shotNumber.toString().padStart(3, '0')}`;

        // Create shot folders dynamically
        try {
          await invoke('create_shot_folders', {
            input: {
              project_path: project.path,
              scene_code: sceneCode,
              shot_code: shotCode
            }
          });
        } catch (error) {
          console.error('Failed to create shot folders:', error);
        }
      } else if (!project.hasScenes) {
        // Shots-only mode: create folders without scene hierarchy
        const shotCode = `SH${shotNumber.toString().padStart(3, '0')}`;
        try {
          await invoke('create_shot_folders', {
            input: {
              project_path: project.path,
              scene_code: '', // Empty scene code for shots-only mode
              shot_code: shotCode
            }
          });
        } catch (error) {
          console.error('Failed to create shot folders:', error);
        }
      }

      const updated = {
        ...project,
        shots: [...(project.shots || []), newShot],
        currentShotId: project.currentShotId || newShot.id
      };
      get().updateProject(updated);
    }
  },

  removeShot: async (projectId: string, shotId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      // Find shots in the same scene as the shot being removed
      const shotToRemove = (project.shots || []).find(s => s.id === shotId);
      if (!shotToRemove) return;

      // In scenes mode, prevent removing the last shot in a scene
      if (project.hasScenes) {
        const shotsInScene = (project.shots || []).filter(s => s.sceneId === shotToRemove.sceneId);

        if (shotsInScene.length <= 1) {
          console.warn('Cannot remove the last shot in a scene');
          return;
        }
      }

      // Find the scene for this shot to get scene number (only in scenes mode)
      const scene = project.hasScenes
        ? (project.scenes || []).find(s => s.id === shotToRemove.sceneId)
        : null;

      if (project.hasScenes && !scene) {
        console.error('Scene not found for shot');
        return;
      }

      // Delete all version files for this shot
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        const deletedCount = await invoke<number>('delete_shot_files', {
          projectPath: project.path,
          shotNumber: shotToRemove.number,
          sceneNumber: scene?.number || 0
        });
        console.log(`Deleted ${deletedCount} files for shot ${shotToRemove.number}`);
      } catch (error) {
        console.error('Failed to delete shot files:', error);
      }

      const updated = {
        ...project,
        shots: (project.shots || []).filter(s => s.id !== shotId),
        currentShotId: project.currentShotId === shotId ? (project.shots?.[0]?.id || undefined) : project.currentShotId
      };
      get().updateProject(updated);
    }
  },

  renameShot: async (projectId: string, shotId: string, newName: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const shot = (project.shots || []).find(s => s.id === shotId);
      if (!shot) return;

      // Extract number from old and new names
      const oldMatch = shot.name.match(/\d+/);
      const newMatch = newName.match(/\d+/);
      const oldNumber = oldMatch ? parseInt(oldMatch[0]) : shot.number;
      const newNumber = newMatch ? parseInt(newMatch[0]) : shot.number;

      // Only rename folders if the number changed
      if (oldNumber !== newNumber) {
        // Generate shot folder names (e.g., "SH001", "SH002")
        const oldShotFolderName = `SH${oldNumber.toString().padStart(3, '0')}`;
        const newShotFolderName = `SH${newNumber.toString().padStart(3, '0')}`;

        // Get scene folder name
        const scene = (project.scenes || []).find(s => s.id === shot.sceneId);
        if (scene) {
          const sceneFolderName = sanitizeFolderName(scene.name);

          try {
            await invoke('rename_shot_folders', {
              projectPath: project.path,
              sceneFolderName: sceneFolderName,
              oldShotFolderName: oldShotFolderName,
              newShotFolderName: newShotFolderName
            });
          } catch (error) {
            console.error('Failed to rename shot folders:', error);
            // Don't update metadata if folder rename failed
            return;
          }
        }
      }

      // Update metadata only after successful folder rename (or if no rename was needed)
      const updated = {
        ...project,
        shots: (project.shots || []).map(s => {
          if (s.id === shotId) {
            return { ...s, name: newName, number: newNumber };
          }
          return s;
        })
      };
      get().updateProject(updated);
    }
  },

  setCurrentShot: (projectId: string, shotId: string | null) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      // Save shot preference for current scene
      let updatedPreferences = { ...(project.sceneShotPreferences || {}) };

      if (shotId && project.currentSceneId) {
        // Find the shot to verify it belongs to current scene
        const shot = (project.shots || []).find(s => s.id === shotId);
        if (shot && shot.sceneId === project.currentSceneId) {
          updatedPreferences[project.currentSceneId] = shotId;
        }
      }

      const updated = {
        ...project,
        currentShotId: shotId || undefined,
        sceneShotPreferences: updatedPreferences,
        currentSpecialContextId: undefined // Clear special context when selecting a shot
      };
      get().updateProject(updated);
    }
  },

  toggleShotCompleted: (projectId: string, shotId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s => {
          if (s.id === shotId) {
            // Cycle through: none → wip → completed → none
            if (!s.wip && !s.completed) {
              return { ...s, wip: true, completed: false };
            } else if (s.wip && !s.completed) {
              return { ...s, wip: false, completed: true };
            } else {
              return { ...s, wip: false, completed: false };
            }
          }
          return s;
        })
      };
      get().updateProject(updated);
    }
  },

  setShotStatus: (projectId: string, shotId: string, status: 'none' | 'wip' | 'done') => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s => {
          if (s.id === shotId) {
            if (status === 'none') {
              return { ...s, wip: false, completed: false };
            } else if (status === 'wip') {
              return { ...s, wip: true, completed: false };
            } else if (status === 'done') {
              return { ...s, wip: false, completed: true };
            }
          }
          return s;
        })
      };
      get().updateProject(updated);
    }
  },

  addShotNote: (projectId: string, shotId: string, content: string) => {
    const newNote = {
      id: crypto.randomUUID(),
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s =>
          s.id === shotId ? { ...s, notes: [...s.notes, newNote] } : s
        )
      };
      get().updateProject(updated);
    }
  },

  updateShotNote: (projectId: string, shotId: string, noteId: string, content: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s =>
          s.id === shotId
            ? {
                ...s,
                notes: s.notes.map(n =>
                  n.id === noteId ? { ...n, content, updatedAt: new Date().toISOString() } : n
                )
              }
            : s
        )
      };
      get().updateProject(updated);
    }
  },

  deleteShotNote: (projectId: string, shotId: string, noteId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s =>
          s.id === shotId ? { ...s, notes: s.notes.filter(n => n.id !== noteId) } : s
        )
      };
      get().updateProject(updated);
    }
  },

  addShotTodo: (projectId: string, shotId: string, text: string) => {
    const newTodo = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: new Date().toISOString()
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s =>
          s.id === shotId ? { ...s, todos: [...s.todos, newTodo] } : s
        )
      };
      get().updateProject(updated);
    }
  },

  toggleShotTodo: (projectId: string, shotId: string, todoId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s =>
          s.id === shotId
            ? {
                ...s,
                todos: s.todos.map(t => (t.id === todoId ? { ...t, completed: !t.completed } : t))
              }
            : s
        )
      };
      get().updateProject(updated);
    }
  },

  removeShotTodo: (projectId: string, shotId: string, todoId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s =>
          s.id === shotId ? { ...s, todos: s.todos.filter(t => t.id !== todoId) } : s
        )
      };
      get().updateProject(updated);
    }
  },

  addShotBrowserTab: (projectId: string, shotId: string, url: string, title: string) => {
    const newTab = {
      id: crypto.randomUUID(),
      url,
      title,
      isPinned: false
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s =>
          s.id === shotId ? { ...s, browserTabs: [...s.browserTabs, newTab] } : s
        )
      };
      get().updateProject(updated);
    }
  },

  removeShotBrowserTab: (projectId: string, shotId: string, tabId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s =>
          s.id === shotId ? { ...s, browserTabs: s.browserTabs.filter(t => t.id !== tabId) } : s
        )
      };
      get().updateProject(updated);
    }
  },

  addShotLink: (projectId: string, shotId: string, url: string, title: string) => {
    const newLink = {
      id: crypto.randomUUID(),
      url,
      title
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s =>
          s.id === shotId ? { ...s, links: [...(s.links || []), newLink] } : s
        )
      };
      get().updateProject(updated);
    }

    return newLink.id;
  },

  updateShotLink: (projectId: string, shotId: string, linkId: string, newTitle: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s =>
          s.id === shotId
            ? {
                ...s,
                links: (s.links || []).map(l => (l.id === linkId ? { ...l, title: newTitle } : l))
              }
            : s
        )
      };
      get().updateProject(updated);
    }
  },

  removeShotLink: (projectId: string, shotId: string, linkId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = {
        ...project,
        shots: (project.shots || []).map(s =>
          s.id === shotId ? { ...s, links: (s.links || []).filter(l => l.id !== linkId) } : s
        )
      };
      get().updateProject(updated);
    }
  },

  // Category management
  addCategory: (name: string) => {
    set(state => {
      if (!state.categories.includes(name)) {
        const updatedCategories = [...state.categories, name];
        if (typeof window !== 'undefined') {
          localStorage.setItem('categories', JSON.stringify(updatedCategories));
        }
        return { categories: updatedCategories };
      }
      return state;
    });
  },

  removeCategory: (name: string) => {
    const updatedCategories = get().categories.filter(c => c !== name);

    if (typeof window !== 'undefined') {
      localStorage.setItem('categories', JSON.stringify(updatedCategories));
    }

    // Move projects from deleted category to "Personal"
    const updatedProjects = get().projects.map(p =>
      p.category === name ? { ...p, category: 'Personal' } : p
    );

    // Update state first
    set({
      categories: updatedCategories,
      selectedCategory: get().selectedCategory === name ? updatedCategories[0] : get().selectedCategory,
      projects: updatedProjects
    });

    // Then save each updated project asynchronously
    updatedProjects.forEach((p) => {
      const originalProject = get().projects.find(orig => orig.id === p.id);
      if (p.category === 'Personal' && originalProject?.category === name) {
        get().updateProject(p);
      }
    });
  },

  renameCategory: (oldName: string, newName: string) => {
    // Update category list
    const updatedCategories = get().categories.map(c => c === oldName ? newName : c);

    if (typeof window !== 'undefined') {
      localStorage.setItem('categories', JSON.stringify(updatedCategories));
    }

    // Update all projects with this category
    const updatedProjects = get().projects.map(p =>
      p.category === oldName ? { ...p, category: newName } : p
    );

    // Update state first
    set({
      categories: updatedCategories,
      selectedCategory: get().selectedCategory === oldName ? newName : get().selectedCategory,
      projects: updatedProjects
    });

    // Then save each updated project asynchronously
    updatedProjects.forEach((p) => {
      const originalProject = get().projects.find(orig => orig.id === p.id);
      if (p.category === newName && originalProject?.category === oldName) {
        get().updateProject(p);
      }
    });
  },

  setSelectedCategory: (category: string) => {
    set({ selectedCategory: category });
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedCategory', category);
    }
  },

  // Time tracking - project data management only
  // Session management moved to src/features/time-tracking
  addManualTimeEntry: (projectId: string, software: SoftwareName, durationMinutes: number, date: string, shotId?: string, notes?: string, countInStats: boolean = true) => {
    // Check if time tracking is enabled
    const timeTrackingEnabled = localStorage.getItem('timeTrackingEnabled');
    const isTimeTrackingEnabled = timeTrackingEnabled !== null ? JSON.parse(timeTrackingEnabled) : true;

    if (!isTimeTrackingEnabled) {
      console.log('[ManualEntry] ⏸️  Time tracking is disabled, rejecting manual entry');
      throw new Error('Time tracking is disabled');
    }

    const project = get().projects.find(p => p.id === projectId);
    if (!project) throw new Error('Project not found');

    const entryId = crypto.randomUUID();
    const timestamp = new Date(date).toISOString();

    // Normalize software name to lowercase to prevent duplicates
    const normalizedSoftware = software.toLowerCase() as SoftwareName;

    const newEntry: TimeEntry = {
      id: entryId,
      projectId,
      shotId,
      software: normalizedSoftware,
      startTime: timestamp,
      endTime: timestamp,
      durationMinutes,
      elapsedSeconds: durationMinutes * 60,  // Manual entries use minutes, convert to seconds
      isActive: false,
      isManual: true,
      notes,
      countedInStats: countInStats
    };

    const updatedEntries = [...(project.timeEntries || []), newEntry];
    const totalMinutesSpent = updatedEntries
      .filter(e => !e.isActive)
      .reduce((sum, e) => sum + e.durationMinutes, 0);

    const hourlyRate = project.cost && totalMinutesSpent > 0
      ? (project.cost / (totalMinutesSpent / 60))
      : undefined;

    const updatedProject = {
      ...project,
      timeEntries: updatedEntries,
      totalMinutesSpent,
      hourlyRate,
      updatedAt: new Date().toISOString()
    };

    get().updateProject(updatedProject);

    // Add time to global software statistics only if checkbox is checked
    if (countInStats) {
      const { addSoftwareTime } = useTimeStatsStore.getState();
      addSoftwareTime(normalizedSoftware, durationMinutes);
      console.log(`[ManualEntry] Added ${durationMinutes}m to ${normalizedSoftware} global stats`);
    } else {
      console.log(`[ManualEntry] Skipped adding ${durationMinutes}m to ${normalizedSoftware} global stats (countInStats=false)`);
    }
  },

  removeTimeEntry: (projectId: string, entryId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) throw new Error('Project not found');

    // Find the entry to get its software and duration for logging
    const entryToRemove = (project.timeEntries || []).find(entry => entry.id === entryId);

    const updatedEntries = (project.timeEntries || []).filter(entry => entry.id !== entryId);
    const totalMinutesSpent = updatedEntries
      .filter(e => !e.isActive)
      .reduce((sum, e) => sum + e.durationMinutes, 0);

    const hourlyRate = project.cost && totalMinutesSpent > 0
      ? (project.cost / (totalMinutesSpent / 60))
      : undefined;

    const updatedProject = {
      ...project,
      timeEntries: updatedEntries,
      totalMinutesSpent,
      hourlyRate,
      updatedAt: new Date().toISOString()
    };

    get().updateProject(updatedProject);

    // Remove from global statistics if this was a manual entry counted in stats
    if (entryToRemove && entryToRemove.isManual && entryToRemove.countedInStats) {
      const { removeSoftwareTime } = useTimeStatsStore.getState();
      removeSoftwareTime(entryToRemove.software, entryToRemove.durationMinutes);
      console.log(`[RemoveEntry] Removed ${entryToRemove.durationMinutes}m from ${entryToRemove.software} global stats`);
    } else if (entryToRemove && !entryToRemove.isActive) {
      console.log(`[RemoveEntry] Removed ${entryToRemove.durationMinutes}m entry from ${entryToRemove.software} (global stats unchanged)`);
    }
  },

  getActiveTimeEntry: (projectId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project || !project.timeEntries) return undefined;

    return project.timeEntries.find(entry => entry.isActive);
  },

  updateTargetHourlyRate: (projectId: string, rate: number) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) throw new Error('Project not found');

    const updatedProject = {
      ...project,
      targetHourlyRate: rate,
      updatedAt: new Date().toISOString()
    };

    get().updateProject(updatedProject);
  },

  // Special context management
  setSpecialContext: (projectId: string, contextType: 'asset' | 'compose', sceneId?: string) => {
    console.log('[setSpecialContext] Called with:', { projectId, contextType, sceneId });
    const project = get().projects.find(p => p.id === projectId);
    if (!project) {
      console.log('[setSpecialContext] Project not found');
      return;
    }

    const contexts = project.specialContexts || [];
    console.log('[setSpecialContext] Existing contexts:', contexts);

    // Try to find existing context for this type and scene
    let contextId: string;
    let updatedContexts = contexts;

    const existingContext = contexts.find(
      ctx => ctx.type === contextType && ctx.sceneId === sceneId
    );

    if (existingContext) {
      console.log('[setSpecialContext] Found existing context:', existingContext.id);
      contextId = existingContext.id;
    } else {
      // Create new context
      const newContext = {
        id: crypto.randomUUID(),
        type: contextType,
        sceneId,
        todos: [],
        notes: [],
        browserTabs: [],
        links: []
      };
      console.log('[setSpecialContext] Creating new context:', newContext);
      contextId = newContext.id;
      updatedContexts = [...contexts, newContext];
    }

    const updated = {
      ...project,
      specialContexts: updatedContexts,
      currentSpecialContextId: contextId,
      // Clear scene/shot selection when entering special context
      currentSceneId: undefined,
      currentShotId: undefined,
      updatedAt: new Date().toISOString()
    };

    console.log('[setSpecialContext] Updating project with currentSpecialContextId:', contextId);
    get().updateProject(updated);
  },

  clearSpecialContext: (projectId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const updated = {
      ...project,
      currentSpecialContextId: undefined,
      updatedAt: new Date().toISOString()
    };

    get().updateProject(updated);
  },

  // Special context data management
  addSpecialContextLink: (projectId: string, contextId: string, url: string, title: string): string => {
    const newLink = {
      id: crypto.randomUUID(),
      url,
      title,
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project && project.specialContexts) {
      const updated = {
        ...project,
        specialContexts: project.specialContexts.map(ctx =>
          ctx.id === contextId ? { ...ctx, links: [...(ctx.links || []), newLink] } : ctx
        )
      };
      get().updateProject(updated);
    }

    return newLink.id;
  },

  updateSpecialContextLink: (projectId: string, contextId: string, linkId: string, newTitle: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.specialContexts) {
      const updated = {
        ...project,
        specialContexts: project.specialContexts.map(ctx =>
          ctx.id === contextId
            ? {
                ...ctx,
                links: (ctx.links || []).map(link =>
                  link.id === linkId ? { ...link, title: newTitle } : link
                )
              }
            : ctx
        )
      };
      get().updateProject(updated);
    }
  },

  removeSpecialContextLink: (projectId: string, contextId: string, linkId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.specialContexts) {
      const updated = {
        ...project,
        specialContexts: project.specialContexts.map(ctx =>
          ctx.id === contextId
            ? { ...ctx, links: (ctx.links || []).filter(link => link.id !== linkId) }
            : ctx
        )
      };
      get().updateProject(updated);
    }
  },

  addSpecialContextTodo: (projectId: string, contextId: string, text: string) => {
    const newTodo = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project && project.specialContexts) {
      const updated = {
        ...project,
        specialContexts: project.specialContexts.map(ctx =>
          ctx.id === contextId ? { ...ctx, todos: [...(ctx.todos || []), newTodo] } : ctx
        )
      };
      get().updateProject(updated);
    }
  },

  toggleSpecialContextTodo: (projectId: string, contextId: string, todoId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.specialContexts) {
      const updated = {
        ...project,
        specialContexts: project.specialContexts.map(ctx =>
          ctx.id === contextId
            ? {
                ...ctx,
                todos: (ctx.todos || []).map(todo =>
                  todo.id === todoId ? { ...todo, completed: !todo.completed } : todo
                )
              }
            : ctx
        )
      };
      get().updateProject(updated);
    }
  },

  removeSpecialContextTodo: (projectId: string, contextId: string, todoId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.specialContexts) {
      const updated = {
        ...project,
        specialContexts: project.specialContexts.map(ctx =>
          ctx.id === contextId
            ? { ...ctx, todos: (ctx.todos || []).filter(todo => todo.id !== todoId) }
            : ctx
        )
      };
      get().updateProject(updated);
    }
  },

  addSpecialContextNote: (projectId: string, contextId: string, content: string) => {
    const newNote = {
      id: crypto.randomUUID(),
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const project = get().projects.find(p => p.id === projectId);
    if (project && project.specialContexts) {
      const updated = {
        ...project,
        specialContexts: project.specialContexts.map(ctx =>
          ctx.id === contextId ? { ...ctx, notes: [...(ctx.notes || []), newNote] } : ctx
        )
      };
      get().updateProject(updated);
    }
  },

  updateSpecialContextNote: (projectId: string, contextId: string, noteId: string, content: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.specialContexts) {
      const updated = {
        ...project,
        specialContexts: project.specialContexts.map(ctx =>
          ctx.id === contextId
            ? {
                ...ctx,
                notes: (ctx.notes || []).map(note =>
                  note.id === noteId ? { ...note, content, updatedAt: new Date().toISOString() } : note
                )
              }
            : ctx
        )
      };
      get().updateProject(updated);
    }
  },

  removeSpecialContextNote: (projectId: string, contextId: string, noteId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.specialContexts) {
      const updated = {
        ...project,
        specialContexts: project.specialContexts.map(ctx =>
          ctx.id === contextId
            ? { ...ctx, notes: (ctx.notes || []).filter(note => note.id !== noteId) }
            : ctx
        )
      };
      get().updateProject(updated);
    }
  },

  // Preview management
  setScenePreview: async (projectId: string, sceneId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project || !project.hasShots) return;

    const scene = project.scenes?.find(s => s.id === sceneId);
    if (!scene) return;

    try {
      // Open file dialog
      const { open } = await import('@tauri-apps/api/dialog');
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
        }]
      });

      if (!selected || Array.isArray(selected)) return;

      // Call Rust command to copy and set preview
      const previewPath = await invoke<string>('set_scene_preview', {
        projectPath: project.path,
        sceneNumber: scene.number,
        imagePath: selected
      });

      // Update project in store
      const updatedScenes = project.scenes!.map(s =>
        s.id === sceneId ? { ...s, preview: previewPath } : s
      );

      const updated = {
        ...project,
        scenes: updatedScenes,
        updatedAt: new Date().toISOString()
      };

      get().updateProject(updated);
    } catch (error) {
      console.error('Failed to set scene preview:', error);
    }
  },

  setShotPreview: async (projectId: string, shotId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project || !project.hasShots) return;

    const shot = project.shots?.find(s => s.id === shotId);
    if (!shot) return;

    const scene = project.scenes?.find(s => s.id === shot.sceneId);
    if (!scene) return;

    try {
      // Open file dialog
      const { open } = await import('@tauri-apps/api/dialog');
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
        }]
      });

      if (!selected || Array.isArray(selected)) return;

      // Call Rust command to copy and set preview
      const previewPath = await invoke<string>('set_shot_preview', {
        projectPath: project.path,
        sceneNumber: scene.number,
        shotNumber: shot.number,
        imagePath: selected
      });

      // Update project in store
      const updatedShots = project.shots!.map(s =>
        s.id === shotId ? { ...s, preview: previewPath } : s
      );

      const updated = {
        ...project,
        shots: updatedShots,
        updatedAt: new Date().toISOString()
      };

      get().updateProject(updated);
    } catch (error) {
      console.error('Failed to set shot preview:', error);
    }
  }
}));

// Subscribe to timeTrackingStore to sync timeEntry updates to projectStore
useTimeTrackingStore.subscribe((state) => {
  const projectStoreState = useProjectStore.getState();

  // Get all active sessions from timeTrackingStore
  const activeSessions = Array.from(state.sessions.values()).filter(s => s.isActive);

  // Group active sessions by project
  const sessionsByProject = new Map<string, typeof activeSessions>();
  activeSessions.forEach(session => {
    const existing = sessionsByProject.get(session.projectId) || [];
    sessionsByProject.set(session.projectId, [...existing, session]);
  });

  // Update each project that has active sessions
  sessionsByProject.forEach((sessions, projectId) => {
    const project = projectStoreState.projects.find(p => p.id === projectId);

    if (project) {
      // Update all active entries for this project
      const updatedEntries = [...(project.timeEntries || [])];
      let hasChanges = false;

      sessions.forEach(session => {
        const entryIndex = updatedEntries.findIndex(e => e.id === session.id);
        if (entryIndex >= 0) {
          // Preserve fields that exist only in projectStore (like widgetVisible)
          const existingEntry = updatedEntries[entryIndex];
          updatedEntries[entryIndex] = {
            ...existingEntry,
            ...session,
            widgetVisible: session.widgetVisible ?? existingEntry.widgetVisible // Prioritize timeTrackingStore
          };
          hasChanges = true;
        }
      });

      if (hasChanges) {
        // Calculate currentProjectTime as sum of all active session durations
        const currentProjectTime = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);

        const updatedProject = {
          ...project,
          timeEntries: updatedEntries,
          currentProjectTime
        };

        // ✅ OPTIMIZATION: Use functional update to maintain array reference stability
        // Only the affected project is updated, rest remain the same object references
        useProjectStore.setState((prev) => ({
          projects: prev.projects.map(p =>
            p.id === project.id ? updatedProject : p
          )
        }));

        // Update local reference for next iteration
        projectStoreState.projects = useProjectStore.getState().projects;
      }
    }
  });
});

// Helper function to get default projects directory (currently unused)
// async function getDefaultProjectsDir(): Promise<string> {
//   try {
//     const { homeDir } = await import('@tauri-apps/api/path');
//     const home = await homeDir();
//     return `${home}/3DProjects`;
//   } catch {
//     return './projects';
//   }
// }