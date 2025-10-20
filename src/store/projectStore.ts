// src/store/projectStore.ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import type { Project, CreateProjectCommand, LaunchSoftwareCommand, Client } from '../types/project';
import { thumbnailCache } from '../utils/thumbnailCache';

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
}

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
      set({ projects, isLoading: false });
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

      // If project has shots, automatically create Shot 001
      if (project.hasShots) {
        const shot001 = {
          id: crypto.randomUUID(),
          number: 1,
          name: 'Shot 001',
          notes: [],
          todos: [],
          browserTabs: [],
          links: []
        };
        project.shots = [shot001];
        project.currentShotId = shot001.id;

        // Save the updated project with Shot 001
        await invoke('update_project', { project });
      }

      set(state => ({
        projects: [project, ...state.projects],
        isLoading: false
      }));
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // Update existing project
  updateProject: async (project: Project) => {
    try {
      // Clear thumbnail cache if thumbnail changed
      const oldProject = get().projects.find(p => p.id === project.id);
      if (oldProject && oldProject.thumbnail !== project.thumbnail) {
        if (oldProject.thumbnail) {
          thumbnailCache.clear(oldProject.path, oldProject.thumbnail);
        }
      }

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
      throw error;
    }
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
      const result = await invoke<string>('launch_software', { input });
      console.log('Software launched successfully, created file:', result);

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
      color: client.color,
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
      const shotNumber = (project.shots?.length || 0) + 1;
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
  }
}));

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