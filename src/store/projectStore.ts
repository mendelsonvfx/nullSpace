// src/store/projectStore.ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import type { Project, CreateProjectCommand, LaunchSoftwareCommand, Client } from '../types/project';

interface ProjectStore {
  // State
  projects: Project[];
  selectedProject: Project | null;
  isLoading: boolean;
  error: string | null;
  projectsDirectory: string;
  defaultProjectsPath: string;
  clients: Client[];

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
      await invoke('update_project', { project });
      set(state => ({
        projects: state.projects.map(p => 
          p.id === project.id ? project : p
        ),
        selectedProject: state.selectedProject?.id === project.id 
          ? project 
          : state.selectedProject
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Delete project
  deleteProject: async (projectPath: string) => {
    set({ isLoading: true, error: null });
    try {
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
    try {
      console.log('Launching software with input:', input);
      const result = await invoke<string>('launch_software', { input });
      console.log('Software launched successfully, created file:', result);
    } catch (error) {
      console.error('Failed to launch software:', error);
      set({ error: String(error) });
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

    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = { ...p, notes: [...p.notes, newNote] };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Update note
  updateNote: (projectId: string, noteId: string, content: string) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = {
            ...p,
            notes: p.notes.map(n => 
              n.id === noteId 
                ? { ...n, content, updatedAt: new Date().toISOString() }
                : n
            )
          };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Delete note
  deleteNote: (projectId: string, noteId: string) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = {
            ...p,
            notes: p.notes.filter(n => n.id !== noteId)
          };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Add tag
  addTag: (projectId: string, tag: string) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId && !p.tags.includes(tag)) {
          const updated = { ...p, tags: [...p.tags, tag] };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Remove tag
  removeTag: (projectId: string, tag: string) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = { ...p, tags: p.tags.filter(t => t !== tag) };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Update status
  updateStatus: (projectId: string, status: Project['status']) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = { ...p, status };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Update deadline
  updateDeadline: (projectId: string, deadline: string | undefined) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = { ...p, deadline };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Add browser tab
  addBrowserTab: (projectId: string, url: string, title: string) => {
    const newTab = {
      id: crypto.randomUUID(),
      url,
      title,
      isPinned: false
    };

    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = { ...p, browserTabs: [...p.browserTabs, newTab] };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Remove browser tab
  removeBrowserTab: (projectId: string, tabId: string) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = {
            ...p,
            browserTabs: p.browserTabs.filter((t: any) => t.id !== tabId)
          };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Add todo
  addTodo: (projectId: string, text: string) => {
    const newTodo = {
      id: crypto.randomUUID(),
      text,
      completed: false
    };

    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = { ...p, todos: [...(p.todos || []), newTodo] };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Toggle todo completed state
  toggleTodo: (projectId: string, todoId: string) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = {
            ...p,
            todos: (p.todos || []).map(t =>
              t.id === todoId ? { ...t, completed: !t.completed } : t
            )
          };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Remove todo
  removeTodo: (projectId: string, todoId: string) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = {
            ...p,
            todos: (p.todos || []).filter(t => t.id !== todoId)
          };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Add link
  addLink: (projectId: string, url: string, title: string) => {
    const newLink = {
      id: crypto.randomUUID(),
      url,
      title
    };

    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = { ...p, links: [...(p.links || []), newLink] };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });

    return newLink.id;
  },

  // Update link title
  updateLink: (projectId: string, linkId: string, newTitle: string) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = {
            ...p,
            links: (p.links || []).map(l =>
              l.id === linkId ? { ...l, title: newTitle } : l
            )
          };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Remove link
  removeLink: (projectId: string, linkId: string) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = {
            ...p,
            links: (p.links || []).filter(l => l.id !== linkId)
          };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Toggle favorite
  toggleFavorite: (projectId: string) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = { ...p, isFavorite: !p.isFavorite };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
  },

  // Toggle pin
  togglePin: (projectId: string) => {
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const updated = { ...p, isPinned: !p.isPinned };
          get().updateProject(updated);
          return updated;
        }
        return p;
      });

      return { projects: updatedProjects };
    });
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