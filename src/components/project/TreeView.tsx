import { useState, useEffect, useRef, useCallback } from 'react';
import {
  IconFile,
  IconChevronRight,
  IconEye,
  IconEyeOff,
  IconCopy,
  IconCircleCheck,
  IconFolderOpen,
  IconPalette,
  IconFolder
} from '@tabler/icons-react';
import { RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';
import { useProjectStore } from '../../store/projectStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { SoftwareIcon } from '../SoftwareIcon';
import { writeText } from '@tauri-apps/api/clipboard';
import { useTimeTrackingStore } from '../../features/time-tracking/stores/timeTrackingStore';
import type { SoftwareName } from '../../types/project';
import SimpleBar from 'simplebar-react';
import { isVersioned, extractVersion } from '../../utils/fileNaming';
import { ContextMenu, ContextMenuItem, ContextMenuDivider, ContextMenuColorPicker } from '../ui/ContextMenu';
import { useContextMenu } from '../../hooks/useContextMenu';

// Import folder icons
import blenderFolIcon from '/icons/folders/blender_fol.png';
import houdiniFolIcon from '/icons/folders/houdini_fol.png';
import photoshopFolIcon from '/icons/folders/photoshop_fol.png';
import afterEffectsFolIcon from '/icons/folders/after-effects_fol.png';

// Folder SVG component
const FolderIcon = ({ color, size = 16 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 6V16.8C3 17.9201 3 18.4798 3.21799 18.9076C3.40973 19.2839 3.71547 19.5905 4.0918 19.7822C4.5192 20 5.07899 20 6.19691 20H17.8031C18.921 20 19.48 20 19.9074 19.7822C20.2837 19.5905 20.5905 19.2841 20.7822 18.9078C21.0002 18.48 21.0002 17.9199 21.0002 16.7998L21.0002 9.19978C21.0002 8.07967 21.0002 7.51962 20.7822 7.0918C20.5905 6.71547 20.2839 6.40973 19.9076 6.21799C19.4798 6 18.9201 6 17.8 6H12M3 6H12M3 6C3 4.89543 3.89543 4 5 4H8.67452C9.1637 4 9.40886 4 9.63904 4.05526C9.84311 4.10425 10.0379 4.18526 10.2168 4.29492C10.4186 4.41857 10.5918 4.59182 10.9375 4.9375L12 6"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Predefined folder colors
const FOLDER_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Yellow', value: '#f59e0b' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
];

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
  isVersionGroup?: boolean;
  versions?: FileNode[];
  versionCount?: number;
}

interface TreeViewProps {
  project: any;
  showHidden: boolean;
  onToggleHidden: () => void;
}

const AUTO_HIDDEN_NAMES = ['backup'];

const PROJECT_FILE_EXTENSIONS = [
  'blend', 'hip', 'hiplc', 'hipnc',
  'ma', 'mb', 'aep', 'psd', 'psb',
  'c4d', 'spp', 'uproject', 'unity',
  'zpr', 'tbscene'
];

const sanitizeFolderName = (name: string): string =>
  name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();

const getSoftwareDirName = (software: string): string => {
  switch (software.toLowerCase()) {
    case 'blender': return 'Blender';
    case 'houdini': return 'Houdini';
    case 'maya': return 'Maya';
    case 'after-effects':
    case 'after effects': return 'AfterEffects';
    case 'photoshop': return 'Photoshop';
    case 'cinema4d':
    case 'cinema 4d': return 'Cinema4D';
    case 'substance':
    case 'substance painter': return 'Substance';
    case 'unreal':
    case 'unreal engine': return 'Unreal';
    case 'unity': return 'Unity';
    case 'zbrush': return 'ZBrush';
    case 'marmoset':
    case 'marmoset toolbag': return 'Marmoset';
    default: return software;
  }
};


const normPath = (p: string) => p.replace(/\\/g, '/').toLowerCase();

export function TreeView({ project, showHidden, onToggleHidden }: TreeViewProps) {
  const { activeMenu, setActiveMenu } = useContextMenuStore();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`expandedDirs_${project.path}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (error) {
      console.error('Failed to load expanded dirs from localStorage:', error);
      return new Set();
    }
  });
  const [directorySize, setDirectorySize] = useState<number | null>(null);
  const [loadingSize, setLoadingSize] = useState(true);
  const [hiddenPaths, setHiddenPaths] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`hiddenPaths_${project.path}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (error) {
      console.error('Failed to load hidden paths from localStorage:', error);
      return new Set();
    }
  });
  const [explicitlyShownPaths, setExplicitlyShownPaths] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`explicitlyShownPaths_${project.path}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (error) {
      console.error('Failed to load explicitly shown paths from localStorage:', error);
      return new Set();
    }
  });
  const [autoHideProjectFiles, setAutoHideProjectFiles] = useState(() => {
    const saved = localStorage.getItem('autoHideProjectFiles');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [expandedVersionGroups, setExpandedVersionGroups] = useState<Set<string>>(new Set());
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Context menu using centralized hook
  const { isOpen: isContextMenuOpen, position: contextMenuPosition, data: contextMenuNode, openMenu: openContextMenu, closeMenu: closeContextMenu } = useContextMenu<FileNode>();
  const [folderColors, setFolderColors] = useState<Map<string, string>>(() => {
    try {
      const stored = localStorage.getItem(`folderColors_${project.path}`);
      return stored ? new Map(JSON.parse(stored)) : new Map();
    } catch (error) {
      console.error('Failed to load folder colors from localStorage:', error);
      return new Map();
    }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadingTimerRef = useRef<number | null>(null);
  const loadingSizeTimerRef = useRef<number | null>(null);
  const isFirstLoadRef = useRef(true);
  const isFirstSizeLoadRef = useRef(true);
  const debounceTimerRef = useRef<number | null>(null);
  const maxWaitTimerRef = useRef<number | null>(null);
  const isPendingReloadRef = useRef(false);
  const currentProjectPathRef = useRef(project.path);
  const startSession = useTimeTrackingStore(state => state.startSession);

  // Save expanded dirs to localStorage whenever they change
  useEffect(() => {
    try {
      const dirsArray = Array.from(expandedDirs);
      localStorage.setItem(`expandedDirs_${project.path}`, JSON.stringify(dirsArray));
    } catch (error) {
      console.error('Failed to save expanded dirs to localStorage:', error);
    }
  }, [expandedDirs, project.path]);

  // Save hidden paths to localStorage whenever they change
  useEffect(() => {
    try {
      const pathsArray = Array.from(hiddenPaths);
      localStorage.setItem(`hiddenPaths_${project.path}`, JSON.stringify(pathsArray));
    } catch (error) {
      console.error('Failed to save hidden paths to localStorage:', error);
    }
  }, [hiddenPaths, project.path]);

  // Save explicitly shown paths to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(`explicitlyShownPaths_${project.path}`, JSON.stringify([...explicitlyShownPaths]));
    } catch (error) {
      console.error('Failed to save explicitly shown paths to localStorage:', error);
    }
  }, [explicitlyShownPaths, project.path]);

  // Save folder colors to localStorage whenever they change
  useEffect(() => {
    try {
      const colorsArray = Array.from(folderColors.entries());
      localStorage.setItem(`folderColors_${project.path}`, JSON.stringify(colorsArray));
    } catch (error) {
      console.error('Failed to save folder colors to localStorage:', error);
    }
  }, [folderColors, project.path]);

  // Sync autoHideProjectFiles setting from SettingsPanel
  useEffect(() => {
    const handler = () => {
      const saved = localStorage.getItem('autoHideProjectFiles');
      setAutoHideProjectFiles(saved !== null ? JSON.parse(saved) : true);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Reset expanded version groups when project changes (auto-collapse stacks)
  useEffect(() => {
    setExpandedVersionGroups(new Set());
  }, [project.path]);

  // Load hidden paths when project changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`hiddenPaths_${project.path}`);
      if (stored) {
        setHiddenPaths(new Set(JSON.parse(stored)));
      } else {
        setHiddenPaths(new Set());
      }
    } catch (error) {
      console.error('Failed to load hidden paths from localStorage:', error);
      setHiddenPaths(new Set());
    }
    try {
      const storedShown = localStorage.getItem(`explicitlyShownPaths_${project.path}`);
      setExplicitlyShownPaths(storedShown ? new Set(JSON.parse(storedShown)) : new Set());
    } catch (error) {
      console.error('Failed to load explicitly shown paths from localStorage:', error);
      setExplicitlyShownPaths(new Set());
    }
  }, [project.path]);

  // Update current project path ref when project changes
  useEffect(() => {
    currentProjectPathRef.current = project.path;
  }, [project.path]);

  // Close context menu when another menu opens
  useEffect(() => {
    if (activeMenu !== 'tree' && isContextMenuOpen) {
      closeContextMenu();
      setShowColorPicker(false);
    }
  }, [activeMenu, isContextMenuOpen, closeContextMenu]);

  // Compute highlighted paths based on selected scene/shot
  const highlightedPaths = ((): Set<string> => {
    const paths = new Set<string>();
    if (!project.software?.length) return paths;

    const base = normPath(project.path.replace(/[/\\]+$/, ''));

    // Scene-level highlight
    const scene = project.scenes?.find((s: any) => s.id === project.currentSceneId);
    if (scene) {
      const sceneFolder = sanitizeFolderName(scene.name).toLowerCase();
      for (const sw of project.software) {
        const swDir = getSoftwareDirName(sw.name).toLowerCase();
        const swPath = `${base}/${swDir}`;
        paths.add(`${swPath}/${sceneFolder}`);
      }
    }

    return paths;
  })();

  // Fade-out animation for paths that just lost their highlight
  const [fadingOutPaths, setFadingOutPaths] = useState<Set<string>>(new Set());
  const prevHighlightedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const prev = prevHighlightedRef.current;
    const removed = [...prev].filter(p => !highlightedPaths.has(p));
    prevHighlightedRef.current = highlightedPaths;
    if (removed.length > 0) {
      setFadingOutPaths(s => new Set([...s, ...removed]));
      const timer = setTimeout(() => {
        setFadingOutPaths(s => {
          const next = new Set(s);
          removed.forEach(p => next.delete(p));
          return next;
        });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [project.currentSceneId]);

  // Group versioned files into stacks
  const groupVersionsInTree = (nodes: FileNode[]): FileNode[] => {
    return nodes.map(node => {
      if (node.is_dir && node.children) {
        // Recursively process directories
        return {
          ...node,
          children: groupVersionsInTree(node.children)
        };
      }
      return node;
    }).reduce((acc: FileNode[], node) => {
      // Only group files, not directories
      if (!node.is_dir && isVersioned(node.name)) {
        // Extract base name (without version and extension)
        const baseName = node.name.replace(/_v\d+\.[^.]+$/, '');

        // Find existing group for this base name
        const existingGroupIndex = acc.findIndex(
          n => n.isVersionGroup && n.name.startsWith(baseName)
        );

        if (existingGroupIndex !== -1) {
          // Add to existing group
          const group = acc[existingGroupIndex];
          group.versions = [...(group.versions || []), node];
          group.versionCount = group.versions.length;
          // Update group name with new count
          group.name = `${baseName} (${group.versionCount} versions)`;
          // Sort versions by version number descending (newest first)
          group.versions.sort((a, b) => {
            const versionA = parseInt((extractVersion(a.name) || '0').toString(), 10);
            const versionB = parseInt((extractVersion(b.name) || '0').toString(), 10);
            return versionB - versionA;
          });
        } else {
          // Create new group (will be converted back to single file if only 1 version)
          acc.push({
            name: `${baseName} (1 version)`,
            path: node.path,
            is_dir: false,
            isVersionGroup: true,
            versions: [node],
            versionCount: 1
          });
        }
      } else {
        // Non-versioned file or directory
        acc.push(node);
      }
      return acc;
    }, []).flatMap(node => {
      // Post-process: Convert single-version groups back to regular files
      if (node.isVersionGroup && node.versionCount === 1 && node.versions) {
        return node.versions[0]; // Return the single file instead of the group
      }
      return node;
    });
  };

  const loadTree = async () => {
    // Clear any existing timer first
    if (loadingTimerRef.current !== null) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }

    // Remember if this is first load before changing the flag
    const isFirstLoad = isFirstLoadRef.current;

    // Only show loading state for first load or after 300ms delay
    if (isFirstLoad) {
      setLoading(true);
      isFirstLoadRef.current = false;
    } else {
      // Set a delayed loading state to prevent flickering on updates
      loadingTimerRef.current = window.setTimeout(() => {
        setLoading(true);
        loadingTimerRef.current = null;
      }, 300);
    }

    try {
      const projectPath = currentProjectPathRef.current;
      console.log('Loading tree for project:', projectPath);
      const result = await invoke<FileNode[]>('get_folder_structure', { path: projectPath });
      console.log('Received tree structure:', result.length, 'items');

      // Check if project changed while loading
      if (projectPath !== currentProjectPathRef.current) {
        console.log('Project changed during load, discarding results');
        return;
      }

      // Filter out system files starting with .
      const filterSystemFiles = (nodes: FileNode[]): FileNode[] => {
        return nodes
          .filter(node => !node.name.startsWith('.'))
          .map(node => ({
            ...node,
            children: node.children ? filterSystemFiles(node.children) : undefined
          }));
      };
      const filteredResult = filterSystemFiles(result);

      // Group versioned files into stacks
      const groupedResult = groupVersionsInTree(filteredResult);

      // Clear the loading timer if it hasn't fired yet
      if (loadingTimerRef.current !== null) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }

      // Update tree data
      console.log('Setting tree with', groupedResult.length, 'items for project', projectPath);
      setTree(groupedResult);

      // Auto-expand software folders on first load
      if (isFirstLoad) {
        const storedExpanded = localStorage.getItem(`expandedDirs_${projectPath}`);
        // If no saved state OR saved state is empty, auto-expand top-level folders
        if (!storedExpanded || JSON.parse(storedExpanded).length === 0) {
          const autoExpandSoftwareFolders = (nodes: FileNode[]) => {
            const newExpanded = new Set<string>();
            nodes.forEach(node => {
              if (node.is_dir && node.children && node.children.length > 0) {
                newExpanded.add(node.path);
              }
            });
            setExpandedDirs(newExpanded);
          };
          autoExpandSoftwareFolders(filteredResult);
        } else {
          // Restore saved expanded state
          setExpandedDirs(new Set(JSON.parse(storedExpanded)));
        }
      }
      // On subsequent loads, expandedDirs state is already preserved from React state
      setLoading(false);
    } catch (error) {
      console.error('Failed to load folder structure:', error);
      // Clear the loading timer on error
      if (loadingTimerRef.current !== null) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      setLoading(false);
    }
  };

  // Initial load and reset state on project change
  useEffect(() => {
    // Don't clear tree immediately - keep showing old tree until new one loads
    // This prevents "No files found" flash when switching projects
    setLoading(false); // Don't show loading immediately
    setLoadingSize(false); // Don't show size loading immediately
    isFirstLoadRef.current = false; // Treat as subsequent load to use delay
    isFirstSizeLoadRef.current = false; // Treat size load as subsequent to use delay

    // Clear all timers when switching projects
    if (loadingTimerRef.current !== null) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    if (loadingSizeTimerRef.current !== null) {
      clearTimeout(loadingSizeTimerRef.current);
      loadingSizeTimerRef.current = null;
    }
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (maxWaitTimerRef.current !== null) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
    isPendingReloadRef.current = false;

    loadTree();
    loadDirectorySize();
  }, [project.path]);

  // Listen for version changes from file system watcher
  useEffect(() => {
    let unlisten: any;

    listen('version-changed', () => {
      console.log('Version changed detected - updating folder tree');
      debouncedReload();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
      // Clear all timers on unmount
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (maxWaitTimerRef.current !== null) {
        clearTimeout(maxWaitTimerRef.current);
        maxWaitTimerRef.current = null;
      }
      isPendingReloadRef.current = false;
    };
  }, [project.path]);

  // Listen for version updates from launch_software
  useEffect(() => {
    const handleVersionUpdate = () => {
      console.log('Version update event received - updating folder tree');
      debouncedReload();
    };

    window.addEventListener('version-created', handleVersionUpdate);
    return () => {
      window.removeEventListener('version-created', handleVersionUpdate);
    };
  }, [project.path]);

  // Listen for tree refresh requests (e.g., when adding/removing software)
  useEffect(() => {
    const handleTreeRefresh = () => {
      console.log('Tree refresh event received - updating folder tree');
      debouncedReload();
    };

    const handleRefreshAll = () => {
      console.log('Refresh all event received - updating folder tree');
      debouncedReload();
    };

    window.addEventListener('tree-refresh', handleTreeRefresh);
    window.addEventListener('refresh-all', handleRefreshAll);
    return () => {
      window.removeEventListener('tree-refresh', handleTreeRefresh);
      window.removeEventListener('refresh-all', handleRefreshAll);
    };
  }, [project.path]);

  const loadDirectorySize = async () => {
    // Clear any existing timer first
    if (loadingSizeTimerRef.current !== null) {
      clearTimeout(loadingSizeTimerRef.current);
      loadingSizeTimerRef.current = null;
    }

    // Only show loading state for first load or after 300ms delay
    const isFirstLoad = isFirstSizeLoadRef.current;
    if (isFirstLoad) {
      setLoadingSize(true);
      isFirstSizeLoadRef.current = false;
    } else {
      // Set a delayed loading state to prevent flickering on updates
      loadingSizeTimerRef.current = window.setTimeout(() => {
        setLoadingSize(true);
        loadingSizeTimerRef.current = null;
      }, 300);
    }

    try {
      const projectPath = currentProjectPathRef.current;
      const size = await invoke<number>('get_directory_size', { path: projectPath });

      // Check if project changed while loading
      if (projectPath !== currentProjectPathRef.current) {
        console.log('Project changed during size load, discarding results');
        return;
      }

      // Clear the loading timer if it hasn't fired yet
      if (loadingSizeTimerRef.current !== null) {
        clearTimeout(loadingSizeTimerRef.current);
        loadingSizeTimerRef.current = null;
      }

      setDirectorySize(size);
      setLoadingSize(false);
    } catch (error) {
      console.error('Failed to load directory size:', error);
      // Clear the loading timer on error
      if (loadingSizeTimerRef.current !== null) {
        clearTimeout(loadingSizeTimerRef.current);
        loadingSizeTimerRef.current = null;
      }
      setLoadingSize(false);
    }
  };

  // Debounced reload function to prevent excessive reloads
  const debouncedReload = () => {
    // If this is the first call in a sequence, set maxWait timer
    if (!isPendingReloadRef.current) {
      isPendingReloadRef.current = true;

      // Max wait timer ensures reload happens within 2 seconds max
      maxWaitTimerRef.current = window.setTimeout(() => {
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        loadTree();
        loadDirectorySize();
        isPendingReloadRef.current = false;
        maxWaitTimerRef.current = null;
      }, 2000);
    }

    // Clear existing debounce timer
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer (300ms delay)
    debounceTimerRef.current = window.setTimeout(() => {
      // Clear max wait timer since we're executing now
      if (maxWaitTimerRef.current !== null) {
        clearTimeout(maxWaitTimerRef.current);
        maxWaitTimerRef.current = null;
      }

      loadTree();
      loadDirectorySize();
      debounceTimerRef.current = null;
      isPendingReloadRef.current = false;
    }, 300);
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      await Promise.all([loadTree(), loadDirectorySize()]);
    } finally {
      // Add a small delay to show the animation
      setTimeout(() => {
        setIsRefreshing(false);
      }, 300);
    }
  };

  const toggleDir = (path: string) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedDirs(newExpanded);
  };

  const handleDoubleClick = async (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();

    if (node.is_dir) {
      // Open folder in explorer
      const { openInExplorer } = useProjectStore.getState();
      openInExplorer(node.path);
    } else {
      // Open file with time tracking
      try {
        // Detect software from file extension
        const ext = node.path.toLowerCase().split('.').pop() || '';
        const extToSoftware: Record<string, { name: string; key: SoftwareName }> = {
          'blend': { name: 'Blender', key: 'blender' },
          'aep': { name: 'After Effects', key: 'after-effects' },
          'hip': { name: 'Houdini', key: 'houdini' },
          'hiplc': { name: 'Houdini', key: 'houdini' },
          'hipnc': { name: 'Houdini', key: 'houdini' },
          'psd': { name: 'Photoshop', key: 'photoshop' },
          'psb': { name: 'Photoshop', key: 'photoshop' },
          'mb': { name: 'Maya', key: 'maya' },
          'ma': { name: 'Maya', key: 'maya' },
          'c4d': { name: 'Cinema 4D', key: 'cinema4d' },
          'uproject': { name: 'Unreal Engine', key: 'unreal' },
          'unity': { name: 'Unity', key: 'unity' },
          'spp': { name: 'Substance Painter', key: 'substance' },
          'sbs': { name: 'Substance Designer', key: 'substance' },
          'ztl': { name: 'ZBrush', key: 'zbrush' },
          'zpr': { name: 'ZBrush', key: 'zbrush' },
          'tbscene': { name: 'Marmoset', key: 'marmoset' }
        };

        const softwareMapping = extToSoftware[ext];

        if (!softwareMapping) {
          // Unknown file type - just open with default application
          await invoke('open_file', { filePath: node.path });
          return;
        }

        // Get software info from project
        const softwareInfo = project.software?.find((s: any) => s.name === softwareMapping.name);
        if (!softwareInfo) {
          // Software not in project - fallback to regular open
          await invoke('open_file', { filePath: node.path });
          return;
        }

        // Get executable path from project or fallback to global settings
        let executablePath = softwareInfo.path || softwareInfo.executable_path || softwareInfo.executablePath;

        // If still empty, try to get from global localStorage settings
        if (!executablePath) {
          const savedPaths = localStorage.getItem('softwarePaths');
          if (savedPaths) {
            const paths = JSON.parse(savedPaths);
            executablePath = paths[softwareMapping.key];
          }
        }

        if (!executablePath) {
          // No executable path configured - fallback to regular open
          await invoke('open_file', { filePath: node.path });
          return;
        }

        // Launch file with time tracking
        const result = await invoke<{ file_name: string; pid: number }>('open_file_with_tracking', {
          filePath: node.path,
          executablePath: executablePath
        });

        // Start time tracking
        await startSession({
          projectId: project.id,
          projectPath: project.path,
          software: softwareMapping.key,
          pid: result.pid
        });
      } catch (error) {
        console.error('Failed to open file:', error);
      }
    }
  };

  const toggleHidden = (path: string, nodeName: string) => {
    const isAutoHiddenDir = AUTO_HIDDEN_NAMES.includes(nodeName.toLowerCase());
    const ext = nodeName.split('.').pop()?.toLowerCase() ?? '';
    const isAutoHiddenFile = autoHideProjectFiles && PROJECT_FILE_EXTENSIONS.includes(ext);
    const isAutoManaged = isAutoHiddenDir || isAutoHiddenFile;

    const currentlyHidden = hiddenPaths.has(path) ||
      (isAutoManaged && !explicitlyShownPaths.has(path));

    if (isAutoManaged) {
      // Clean up manual hide if exists (edge case: was manually hidden before setting was enabled)
      if (hiddenPaths.has(path)) {
        setHiddenPaths(prev => { const s = new Set(prev); s.delete(path); return s; });
      }
      setExplicitlyShownPaths(prev => {
        const s = new Set(prev);
        if (currentlyHidden) s.add(path); else s.delete(path);
        return s;
      });
    } else {
      setHiddenPaths(prev => {
        const s = new Set(prev);
        if (s.has(path)) s.delete(path); else s.add(path);
        return s;
      });
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    setActiveMenu('tree');
    openContextMenu(e, node);
    setShowColorPicker(false);
  }, [setActiveMenu, openContextMenu]);

  const copyPath = useCallback(async (path: string) => {
    try {
      await writeText(path);
      setCopiedPath(path);
      // Reset after 2 seconds
      setTimeout(() => setCopiedPath(null), 2000);
      closeContextMenu();
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  }, [closeContextMenu]);

  const openInExplorerHandler = useCallback((path: string) => {
    const { openInExplorer } = useProjectStore.getState();
    openInExplorer(path);
    closeContextMenu();
  }, [closeContextMenu]);

  const revealInExplorerHandler = useCallback(async (path: string) => {
    try {
      await invoke('reveal_in_explorer', { path });
    } catch (error) {
      console.error('Failed to reveal in explorer:', error);
    }
    closeContextMenu();
  }, [closeContextMenu]);

  const handleSetFolderColor = useCallback((path: string, color: string) => {
    setFolderColors(prev => {
      const newMap = new Map(prev);
      newMap.set(path, color);
      return newMap;
    });
    closeContextMenu();
    setShowColorPicker(false);
  }, [closeContextMenu]);

  const handleRemoveFolderColor = useCallback((path: string) => {
    setFolderColors(prev => {
      const newMap = new Map(prev);
      newMap.delete(path);
      return newMap;
    });
    closeContextMenu();
    setShowColorPicker(false);
  }, [closeContextMenu]);

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'blend':
        return 'Blender';
      case 'aep':
        return 'After Effects';
      case 'psd':
      case 'psb':
        return 'Photoshop';
      case 'hip':
      case 'hiplc':
      case 'hipnc':
        return 'Houdini';
      case 'ma':
      case 'mb':
        return 'Maya';
      case 'c4d':
        return 'Cinema 4D';
      case 'spp':
        return 'Substance';
      case 'uproject':
        return 'Unreal';
      case 'unity':
        return 'Unity';
      case 'zpr':
        return 'ZBrush';
      case 'tbscene':
        return 'Marmoset';
      default:
        return null;
    }
  };

  const getSoftwareFolderIcon = (folderName: string) => {
    const name = folderName.toLowerCase();

    // Map folder names to custom icon file names
    if (name === 'blender') return blenderFolIcon;
    if (name === 'aftereffects') return afterEffectsFolIcon;
    if (name === 'photoshop') return photoshopFolIcon;
    if (name === 'houdini') return houdiniFolIcon;
    // For folders without custom icons, return null
    return null;
  };

  const toggleVersionGroup = (groupPath: string) => {
    setExpandedVersionGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupPath)) {
        newSet.delete(groupPath);
      } else {
        newSet.add(groupPath);
      }
      return newSet;
    });
  };

  const renderVersionGroup = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedVersionGroups.has(node.path);
    const topThree = (node.versions || []).slice(0, 3);

    // Calculate version range
    const getVersionRange = () => {
      if (!node.versions || node.versions.length === 0) return '';

      const versions = node.versions
        .map(v => extractVersion(v.name))
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);

      if (versions.length === 0) return '';

      const minVersion = versions[0];
      const maxVersion = versions[versions.length - 1];

      // Get base name (without version)
      const baseName = node.versions[0].name.replace(/_v\d+\.[^.]+$/, '');

      // If only one version, show single version number
      if (minVersion === maxVersion) {
        return `${baseName} (v${String(minVersion).padStart(3, '0')})`;
      }

      // Multiple versions: show range
      return `${baseName} (v${String(minVersion).padStart(3, '0')}-v${String(maxVersion).padStart(3, '0')})`;
    };

    if (isExpanded) {
      // Expanded: Show all versions as separate cards
      return (
        <div
          key={node.path}
          style={{ marginLeft: depth > 0 ? '12px' : '0' }}
        >
          {/* All versions as cards */}
          <div className="space-y-1">
            {node.versions?.map((version) => (
              <div
                key={version.path}
                className="h-[36px] flex items-center gap-2 px-2.5 text-xs select-none bg-card-bg border border-border-primary rounded-badge hover:bg-hover-bg hover:border-border-secondary cursor-pointer"
                onDoubleClick={(e) => handleDoubleClick(e, version)}
                onContextMenu={(e) => handleContextMenu(e, version)}
              >
                <div className="w-[18px] flex items-center justify-center flex-shrink-0">
                  {getFileIcon(version.name) ? (
                    <SoftwareIcon name={getFileIcon(version.name)!} className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <IconFile className="w-4 h-4 text-text-secondary flex-shrink-0" stroke={1.5} />
                  )}
                </div>
                <span className="text-text-primary font-medium flex-1">
                  {version.name.substring(0, version.name.lastIndexOf('.'))}
                </span>
              </div>
            ))}
          </div>
          {/* Collapse button */}
          <div className="flex items-center gap-2 px-2.5 py-2 text-xs select-none">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleVersionGroup(node.path);
              }}
              className="flex items-center gap-1 text-text-muted hover:text-white transition-colors"
            >
              <IconChevronRight className="w-3 h-3 -rotate-90 transition-transform duration-200" stroke={1.5} />
              <span>Collapse ({node.versionCount})</span>
            </button>
          </div>
        </div>
      );
    }

    // Collapsed: Show stacked visual (3 separate cards)
    const stackOffset = 10; // offset between cards in pixels
    // Use consistent padding for all groups: middle card offset + small buffer (2px for hover)
    const maxOffset = topThree[2]
      ? stackOffset * 1.555 + 28 - 36   // ≈ 7.55px
      : topThree[1]
        ? stackOffset * 1.15 + 28 - 36  // = 3.5px
        : 0;

    return (
      <div
        key={node.path}
        style={{
          marginLeft: depth > 0 ? '12px' : '0',
          paddingBottom: maxOffset > 0 ? `${maxOffset}px` : '0'
        }}
        className="relative cursor-pointer version-stack group"
        onClick={() => toggleVersionGroup(node.path)}
        onContextMenu={(e) => handleContextMenu(e, topThree[0])}
      >
        {/* Card 3 (bottom - oldest of top 3) */}
        {topThree[2] && (
          <div
            className="absolute left-1/2 -translate-x-1/2 h-[28px] bg-zinc-800/90 rounded border border-zinc-700 pointer-events-none flex items-center px-2.5 gap-2 stack-ghost-card transition-transform duration-200 group-hover:translate-y-0.5"
            style={{
              top: `${stackOffset * 1.555}px`,
              width: '96%',
              zIndex: 0
            }}
          >
            <div className="w-[18px] flex items-center justify-center flex-shrink-0">
              {getFileIcon(topThree[2].name) ? (
                <SoftwareIcon name={getFileIcon(topThree[2].name)!} className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
              ) : (
                <IconFile className="w-3.5 h-3.5 text-text-secondary flex-shrink-0 opacity-50" stroke={1.5} />
              )}
            </div>
            <span className="text-[11px] text-text-secondary opacity-70">
              {topThree[2].name.substring(0, topThree[2].name.lastIndexOf('.'))}
            </span>
          </div>
        )}

        {/* Card 2 (middle) */}
        {topThree[1] && (
          <div
            className="absolute left-1/2 -translate-x-1/2 h-[28px] bg-zinc-800/95 rounded border border-zinc-600 pointer-events-none flex items-center px-2.5 gap-2 shadow-md stack-ghost-card transition-transform duration-200 group-hover:translate-y-px"
            style={{
              top: `${stackOffset * 1.15}px`,
              width: '98%',
              zIndex: 1
            }}
          >
            <div className="w-[18px] flex items-center justify-center flex-shrink-0">
              {getFileIcon(topThree[1].name) ? (
                <SoftwareIcon name={getFileIcon(topThree[1].name)!} className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
              ) : (
                <IconFile className="w-3.5 h-3.5 text-text-secondary flex-shrink-0 opacity-70" stroke={1.5} />
              )}
            </div>
            <span className="text-[11px] text-text-secondary opacity-80">
              {topThree[1].name.substring(0, topThree[1].name.lastIndexOf('.'))}
            </span>
          </div>
        )}

        {/* Card 1 (top - newest) */}
        <div className="relative h-[36px] flex items-center gap-2 px-2.5 text-xs select-none bg-card-bg border border-border-primary rounded-badge hover:bg-hover-bg hover:border-border-secondary shadow-lg" style={{ zIndex: 10 }}>
          <div className="w-[18px] flex items-center justify-center flex-shrink-0">
            {topThree[0] && getFileIcon(topThree[0].name) ? (
              <SoftwareIcon name={getFileIcon(topThree[0].name)!} className="w-4 h-4 flex-shrink-0" />
            ) : (
              <IconFile className="w-4 h-4 text-text-secondary flex-shrink-0" stroke={1.5} />
            )}
          </div>
          <span className="text-text-primary font-medium flex-1">
            {getVersionRange()}
          </span>
          <div className="bg-zinc-800 text-zinc-400 text-[9px] font-bold rounded-full w-[18px] h-[18px] flex items-center justify-center flex-shrink-0">
            {node.versionCount}
          </div>
        </div>
      </div>
    );
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    // Handle version groups
    if (node.isVersionGroup) {
      const versionExt = node.versions?.[0]?.name.split('.').pop()?.toLowerCase() ?? '';
      const isVersionGroupHidden = autoHideProjectFiles && PROJECT_FILE_EXTENSIONS.includes(versionExt);
      if (isVersionGroupHidden && !showHidden) return null;
      if (isVersionGroupHidden && showHidden) {
        return <div key={node.path} className="opacity-40">{renderVersionGroup(node, depth)}</div>;
      }
      return renderVersionGroup(node, depth);
    }

    const isExpanded = expandedDirs.has(node.path);
    const hasChildren = node.children && node.children.length > 0;
    const fileIcon = !node.is_dir ? getFileIcon(node.name) : null;
    const softwareFolderIcon = node.is_dir ? getSoftwareFolderIcon(node.name) : null;
    const fileExt = !node.is_dir ? node.name.split('.').pop()?.toLowerCase() ?? '' : '';
    const isAutoHiddenFile = !node.is_dir && autoHideProjectFiles && PROJECT_FILE_EXTENSIONS.includes(fileExt);
    const isHidden = hiddenPaths.has(node.path) ||
      (node.is_dir && AUTO_HIDDEN_NAMES.includes(node.name.toLowerCase()) && !explicitlyShownPaths.has(node.path)) ||
      (isAutoHiddenFile && !explicitlyShownPaths.has(node.path));
    const isHighlighted = node.is_dir && highlightedPaths.has(normPath(node.path));
    const isFadingOut = node.is_dir && !isHighlighted && fadingOutPaths.has(normPath(node.path));
    const folderColor = node.is_dir ? folderColors.get(node.path) : null;

    // Format display name
    let displayName = node.name;

    // Remove file extension from display name only for project files (with icons)
    if (!node.is_dir && fileIcon && node.name.includes('.')) {
      displayName = node.name.substring(0, node.name.lastIndexOf('.'));
    }

    // Add space to "AfterEffects" folder name
    if (node.is_dir && node.name.toLowerCase() === 'aftereffects') {
      displayName = 'After Effects';
    }

    // Skip rendering hidden items when showHidden is false
    if (isHidden && !showHidden) {
      return null;
    }

    return (
      <div
        key={node.path}
        style={{ marginLeft: depth > 0 ? '12px' : '0' }}
        className={`transition-opacity duration-150 ${isHidden ? 'opacity-40' : 'opacity-100'}`}
      >
        <div
          className={`flex items-center gap-2 px-2.5 py-2 text-xs select-none group transition-all cursor-pointer ${node.is_dir
              ? `bg-card-bg border border-border-primary rounded-badge hover:bg-hover-bg hover:border-border-secondary ${isExpanded ? 'bg-hover-bg border-border-secondary' : ''} ${isHighlighted ? 'folder-highlighted' : isFadingOut ? 'folder-highlighted-out' : ''}`
              : 'bg-card-bg border border-border-primary rounded-badge hover:bg-hover-bg hover:border-border-secondary'
            }`}
          onDoubleClick={(e) => handleDoubleClick(e, node)}
          onContextMenu={(e) => handleContextMenu(e, node)}
        >
          {/* Icon */}
          {node.is_dir ? (
            softwareFolderIcon ? (
              <img
                src={softwareFolderIcon}
                alt={node.name}
                className="w-6 h-6 flex-shrink-0 object-contain"
                draggable={false}
              />
            ) : (
              <div className="w-[18px] flex items-center justify-center flex-shrink-0">
                <FolderIcon color={folderColor || '#a1a1aa'} />
              </div>
            )
          ) : (
            <div className="w-[18px] flex items-center justify-center flex-shrink-0">
              {fileIcon ? (
                <SoftwareIcon name={fileIcon} className="w-4 h-4 flex-shrink-0" />
              ) : (
                <IconFile className="w-4 h-4 text-text-secondary flex-shrink-0" stroke={1.5} />
              )}
            </div>
          )}

          {/* Name */}
          <span className={`truncate flex-1 text-text-primary ${node.is_dir ? 'font-medium' : ''}`}>{displayName}</span>

          {/* Right side: Hide button + Chevron */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleHidden(node.path, node.name);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-zinc-700 rounded"
              title={isHidden ? "Show" : "Hide"}
            >
              {isHidden ? (
                <IconEye className="w-3 h-3 text-zinc-400" stroke={1.5} />
              ) : (
                <IconEyeOff className="w-3 h-3 text-zinc-400" stroke={1.5} />
              )}
            </button>
            {node.is_dir && hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDir(node.path);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                }}
                className="text-text-dim hover:text-text-secondary py-1.5 pl-2 pr-4 -mr-2.5 transition-colors"
              >
                <IconChevronRight className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} stroke={1.5} />
              </button>
            )}
          </div>
        </div>
        {node.is_dir && node.children && (
          <div
            className={`transition-all duration-150 ease-out ${isExpanded ? 'mt-1 max-h-[2000px] opacity-100 overflow-visible' : 'max-h-0 opacity-0 overflow-hidden'
              }`}
          >
            <div className="flex flex-col gap-1">
              {node.children.map(child => renderNode(child, depth + 1))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  // Separate items: normal items (without underscore) and underscore items
  const normalItems = tree.filter(node => !node.name.startsWith('_'));
  const underscoreItems = tree.filter(node => node.name.startsWith('_'));

  return (
    <div className="flex flex-col h-full relative">
      {/* Panel Title */}
      <div className="flex items-center gap-2 mb-4 justify-between">
        <div className="flex items-center gap-2.5">
          <IconFolder className="w-5 h-5 text-text-secondary flex-shrink-0" stroke={1.5} />
          <h3 className="text-section-title font-semibold text-text-primary leading-none">Project Structure</h3>
        </div>
        <button
          onClick={onToggleHidden}
          className="p-1 hover:bg-hover-bg rounded transition-colors group"
          title={showHidden ? "Hide hidden items" : "Show hidden items"}
        >
          {showHidden ? (
            <IconEye className="w-4 h-4 text-text-secondary group-hover:text-text-secondary" stroke={1.5} />
          ) : (
            <IconEyeOff className="w-4 h-4 text-text-muted group-hover:text-text-secondary" stroke={1.5} />
          )}
        </button>
      </div>

      <SimpleBar className="custom-scrollbar" autoHide={false} style={{ height: 'calc(100% - 40px)', paddingBottom: '45px' }}>
        <div className="flex flex-col">
          {tree.length > 0 ? (
            <>
              {/* Normal items (without underscore) */}
              <div className="flex flex-col gap-1">
                {normalItems.map(node => renderNode(node))}
              </div>

              {/* Separator between normal and underscore items */}
              {normalItems.length > 0 && underscoreItems.length > 0 && (
                <div className="my-2 mx-12 border-t border-border-secondary" />
              )}

              {/* Underscore items (starting with _) */}
              <div className="flex flex-col gap-1">
                {underscoreItems.map(node => renderNode(node))}
              </div>
            </>
          ) : (
            <p className="text-xs text-text-muted">No files found</p>
          )}
        </div>
      </SimpleBar>

      {/* Project Size Info Bar - Absolute positioned */}
      <div className="absolute -bottom-1 left-0 right-0 pt-2.5">
        <div className="bg-card-bg border border-border-primary rounded-button px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="text-xs">
              <span className="text-text-muted">Project size:</span>{' '}
              {loadingSize ? (
                <span className="text-text-secondary">Calculating...</span>
              ) : directorySize !== null ? (
                <span className="text-text-primary font-medium">{formatSize(directorySize)}</span>
              ) : (
                <span className="text-text-secondary">Unknown</span>
              )}
            </div>
            <button
              onClick={handleRefresh}
              className="hover:bg-hover-bg rounded transition-colors group"
              title="Refresh tree and size"
              disabled={isRefreshing}
            >
              <RefreshCw
                className="w-3.5 h-3.5 text-text-secondary group-hover:text-white transition-colors"
                style={{
                  transform: isRefreshing ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: isRefreshing ? 'transform 0.3s ease-in-out' : 'none'
                }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      <ContextMenu
        isOpen={isContextMenuOpen}
        position={contextMenuPosition}
        onClose={() => {
          closeContextMenu();
          setShowColorPicker(false);
          setActiveMenu(null);
        }}
        menuId="tree"
      >
        <ContextMenuItem
          icon={copiedPath === contextMenuNode?.path
            ? <IconCircleCheck className="w-4 h-4 text-status-active" stroke={1.5} />
            : <IconCopy className="w-4 h-4" stroke={1.5} />
          }
          onClick={() => contextMenuNode && copyPath(contextMenuNode.path)}
        >
          {copiedPath === contextMenuNode?.path ? (
            <span className="text-status-active">Path Copied</span>
          ) : (
            'Copy Path'
          )}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<IconFolderOpen className="w-4 h-4" stroke={1.5} />}
          onClick={() => contextMenuNode && (contextMenuNode.is_dir
            ? openInExplorerHandler(contextMenuNode.path)
            : revealInExplorerHandler(contextMenuNode.path)
          )}
        >
          {contextMenuNode?.is_dir ? 'Open in Explorer' : 'Reveal in Explorer'}
        </ContextMenuItem>
        {contextMenuNode?.is_dir && !getSoftwareFolderIcon(contextMenuNode.name) && (
          <>
            <ContextMenuDivider />
            <ContextMenuItem
              icon={<IconPalette className="w-4 h-4" stroke={1.5} />}
              onClick={() => setShowColorPicker(!showColorPicker)}
            >
              Set Color
            </ContextMenuItem>
          </>
        )}
        {showColorPicker && contextMenuNode?.is_dir && (
          <ContextMenuColorPicker
            colors={FOLDER_COLORS}
            label="Set Color"
            onSelect={(color: string) => handleSetFolderColor(contextMenuNode.path, color)}
            onClear={folderColors.has(contextMenuNode.path) ? () => handleRemoveFolderColor(contextMenuNode.path) : undefined}
          />
        )}
      </ContextMenu>
    </div>
  );
}
