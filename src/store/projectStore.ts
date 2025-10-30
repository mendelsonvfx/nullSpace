// src/store/projectStore.ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import type { Project, CreateProjectCommand, LaunchSoftwareCommand, Client, TimeEntry, SoftwareName } from '../types/project';
import { thumbnailCache } from '../utils/thumbnailCache';
import { useTimeStatsStore, useTimeTrackingStore } from '../features/time-tracking';
import { generateProjectColor, generateBrightColor } from '../utils/colorUtils';

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
  // Shot management
  addShot: (projectId: string, name?: string) => void;
  removeShot: (projectId: string, shotId: string) => void;
  renameShot: (projectId: string, shotId: string, newName: string) => void;
  setCurrentShot: (projectId: string, shotId: string | null) => void;
  toggleShotCompleted: (projectId: string, shotId: string) => void;
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

      // Clean up stale active sessions (processes that no longer exist)
      const cleanedProjects = await Promise.all(
        projects.map(async (project) => {
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

      // If project has shots, automatically create 'Main' shot
      if (project.hasShots) {
        const mainShot = {
          id: crypto.randomUUID(),
          number: 0,
          name: 'Main',
          notes: [],
          todos: [],
          browserTabs: [],
          links: []
        };
        project.shots = [mainShot];
        project.currentShotId = mainShot.id;
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
          const shotId = input.shotNumber
            ? project.shots?.find(s => s.number === input.shotNumber)?.id
            : undefined;

          // input.software is already lowercase SoftwareName from Software.name
          const softwareKey = input.software as SoftwareName;
          console.log('[TimeTracking] Starting tracking for software:', softwareKey, 'PID:', result.pid, 'Shot:', shotId);

          // Use new time-tracking module
          const { startSession, getSession } = useTimeTrackingStore.getState();
          const entryId = await startSession({
            projectId: project.id,
            projectPath: project.path,
            software: softwareKey,
            pid: result.pid,
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

  // Shot management
  addShot: (projectId: string, name?: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      // Count existing numbered shots (exclude 'main' shot which has number 0)
      const numberedShots = (project.shots || []).filter(s => s.number > 0);
      const shotNumber = numberedShots.length + 1;
      const newShot = {
        id: crypto.randomUUID(),
        number: shotNumber,
        name: name || `Shot ${shotNumber.toString().padStart(3, '0')}`,
        todos: [],
        notes: [],
        browserTabs: [],
        links: []
      };
      const updated = {
        ...project,
        shots: [...(project.shots || []), newShot],
        currentShotId: project.currentShotId || newShot.id
      };
      get().updateProject(updated);
    }
  },

  removeShot: (projectId: string, shotId: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      // Prevent removing 'Main' shot
      const shotToRemove = (project.shots || []).find(s => s.id === shotId);
      if (shotToRemove?.name === 'Main') {
        console.warn('Cannot remove Main shot');
        return;
      }

      const updated = {
        ...project,
        shots: (project.shots || []).filter(s => s.id !== shotId),
        currentShotId: project.currentShotId === shotId ? (project.shots?.[0]?.id || undefined) : project.currentShotId
      };
      get().updateProject(updated);
    }
  },

  renameShot: (projectId: string, shotId: string, newName: string) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      // Prevent renaming 'Main' shot
      const shotToRename = (project.shots || []).find(s => s.id === shotId);
      if (shotToRename?.name === 'Main') {
        console.warn('Cannot rename Main shot');
        return;
      }

      const updated = {
        ...project,
        shots: (project.shots || []).map(s => {
          if (s.id === shotId) {
            // Extract number from new name (e.g., "Shot 777" -> 777)
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

  setCurrentShot: (projectId: string, shotId: string | null) => {
    const project = get().projects.find(p => p.id === projectId);
    if (project && project.hasShots) {
      const updated = { ...project, currentShotId: shotId || undefined };
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
            return { ...s, completed: !s.completed };
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
            widgetVisible: existingEntry.widgetVisible // Preserve widget visibility
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