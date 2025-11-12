import { useState, useEffect, useRef } from 'react';
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
}

interface TreeViewProps {
  project: any;
  showHidden: boolean;
  onToggleHidden: () => void;
}

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
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
  const contextMenuRef = useRef<HTMLDivElement>(null);
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

  // Save folder colors to localStorage whenever they change
  useEffect(() => {
    try {
      const colorsArray = Array.from(folderColors.entries());
      localStorage.setItem(`folderColors_${project.path}`, JSON.stringify(colorsArray));
    } catch (error) {
      console.error('Failed to save folder colors to localStorage:', error);
    }
  }, [folderColors, project.path]);

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
  }, [project.path]);

  // Update current project path ref when project changes
  useEffect(() => {
    currentProjectPathRef.current = project.path;
  }, [project.path]);

  // Close context menu when clicking outside or when another menu opens
  useEffect(() => {
    if (activeMenu !== 'tree' && contextMenu) {
      setContextMenu(null);
      setShowColorPicker(false);
    }
  }, [activeMenu]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
        setShowColorPicker(false);
        setActiveMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

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

      // Clear the loading timer if it hasn't fired yet
      if (loadingTimerRef.current !== null) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }

      // Update tree data
      console.log('Setting tree with', filteredResult.length, 'items for project', projectPath);
      setTree(filteredResult);

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

  const toggleHidden = (path: string) => {
    setHiddenPaths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const handleContextMenu = async (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();

    // Auto-copy path on right-click
    try {
      await writeText(node.path);
      setCopiedPath(node.path);
      // Reset after 2 seconds
      setTimeout(() => setCopiedPath(null), 2000);
    } catch (error) {
      console.error('Failed to copy path:', error);
    }

    setActiveMenu('tree');
    setContextMenu({ x: e.clientX, y: e.clientY, node });
    setShowColorPicker(false);
  };

  const copyPath = async (path: string) => {
    try {
      await writeText(path);
      setCopiedPath(path);
      // Reset after 2 seconds
      setTimeout(() => setCopiedPath(null), 2000);
      setContextMenu(null);
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  };

  const openInExplorer = (path: string) => {
    const { openInExplorer } = useProjectStore.getState();
    openInExplorer(path);
    setContextMenu(null);
  };

  const setFolderColor = (path: string, color: string) => {
    setFolderColors(prev => {
      const newMap = new Map(prev);
      newMap.set(path, color);
      return newMap;
    });
    setContextMenu(null);
    setShowColorPicker(false);
  };

  const removeFolderColor = (path: string) => {
    setFolderColors(prev => {
      const newMap = new Map(prev);
      newMap.delete(path);
      return newMap;
    });
    setContextMenu(null);
    setShowColorPicker(false);
  };

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

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path);
    const hasChildren = node.children && node.children.length > 0;
    const fileIcon = !node.is_dir ? getFileIcon(node.name) : null;
    const softwareFolderIcon = node.is_dir ? getSoftwareFolderIcon(node.name) : null;
    const isHidden = hiddenPaths.has(node.path);
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

    // Render hidden items with animation instead of skipping them
    const shouldShow = !isHidden || showHidden;

    return (
      <div
        key={node.path}
        style={{ marginLeft: depth > 0 ? '12px' : '0' }}
        className={`transition-opacity duration-150 ${!shouldShow ? 'opacity-0 h-0 overflow-hidden pointer-events-none' : isHidden ? 'opacity-40' : 'opacity-100'}`}
      >
        <div
          className={`flex items-center gap-2 px-2.5 py-2 text-xs select-none group transition-all cursor-pointer ${
            node.is_dir
              ? `bg-card-bg border border-border-primary rounded-badge hover:bg-hover-bg hover:border-border-secondary ${isExpanded ? 'bg-hover-bg border-border-secondary' : ''}`
              : 'hover:bg-hover-bg/30 rounded'
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
                toggleHidden(node.path);
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
            className={`overflow-hidden transition-all duration-150 ease-out ${
              isExpanded ? 'mt-1 max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
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
              className="p-1 hover:bg-hover-bg rounded transition-colors group"
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
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-card-bg border border-border-secondary rounded-button shadow-lg py-1 z-50 min-w-[180px] animate-context-menu"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 300),
            left: Math.min(contextMenu.x, window.innerWidth - 200)
          }}
        >
          <button
            onClick={() => copyPath(contextMenu.node.path)}
            className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-hover-bg flex items-center gap-2"
          >
            {copiedPath === contextMenu.node.path ? (
              <>
                <IconCircleCheck className="w-4 h-4 text-status-active" stroke={1.5} />
                <span className="text-status-active">Path Copied</span>
              </>
            ) : (
              <>
                <IconCopy className="w-4 h-4" stroke={1.5} />
                Copy Path
              </>
            )}
          </button>
          {contextMenu.node.is_dir && (
            <>
              <button
                onClick={() => openInExplorer(contextMenu.node.path)}
                className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-hover-bg flex items-center gap-2"
              >
                <IconFolderOpen className="w-4 h-4" stroke={1.5} />
                Open in Explorer
              </button>
              {!getSoftwareFolderIcon(contextMenu.node.name) && (
                <>
                  <div className="border-t border-border-primary my-1" />
                  <button
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-hover-bg flex items-center gap-2"
                  >
                    <IconPalette className="w-4 h-4" stroke={1.5} />
                    Set Color
                  </button>
                </>
              )}
              {showColorPicker && (
                <div className="px-2 py-2 space-y-1">
                  <div className="grid grid-cols-3 gap-2">
                    {FOLDER_COLORS.map(color => (
                      <button
                        key={color.value}
                        onClick={() => setFolderColor(contextMenu.node.path, color.value)}
                        className="w-8 h-8 rounded border-2 border-border-secondary hover:border-text-primary transition-colors"
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                  {folderColors.has(contextMenu.node.path) && (
                    <button
                      onClick={() => removeFolderColor(contextMenu.node.path)}
                      className="w-full px-2 py-1 text-xs bg-hover-bg hover:bg-border-hover rounded transition-colors text-text-primary"
                    >
                      Remove Color
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
