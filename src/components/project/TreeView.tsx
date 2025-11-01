import { useState, useEffect, useRef } from 'react';
import { File, ChevronRight, ChevronDown, EyeOff, Copy, FolderOpen, Palette, Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';
import { useProjectStore } from '../../store/projectStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { SoftwareIcon } from '../SoftwareIcon';
import { writeText } from '@tauri-apps/api/clipboard';
import SimpleBar from 'simplebar-react';

// Import folder icons
import blenderFolIcon from '/icons/folders/blender_fol.png';
import houdiniFolIcon from '/icons/folders/houdini_fol.png';
import photoshopFolIcon from '/icons/folders/photoshop_fol.png';
import afterEffectsFolIcon from '/icons/folders/after-effects_fol.png';

// Folder SVG component
const FolderIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
}

export function TreeView({ project, showHidden }: TreeViewProps) {
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
  const loadingTimerRef = useRef<number | null>(null);
  const loadingSizeTimerRef = useRef<number | null>(null);
  const isFirstLoadRef = useRef(true);
  const isFirstSizeLoadRef = useRef(true);
  const debounceTimerRef = useRef<number | null>(null);
  const maxWaitTimerRef = useRef<number | null>(null);
  const isPendingReloadRef = useRef(false);
  const currentProjectPathRef = useRef(project.path);
  const contextMenuRef = useRef<HTMLDivElement>(null);

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
      // Open file with default application
      try {
        await invoke('open_file', { filePath: node.path });
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

    // Remove file extension from display name only for project files (with icons)
    const displayName = !node.is_dir && fileIcon && node.name.includes('.')
      ? node.name.substring(0, node.name.lastIndexOf('.'))
      : node.name;

    // Skip hidden items if showHidden is false
    if (isHidden && !showHidden) {
      return null;
    }

    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-1 py-1 hover:bg-zinc-800 rounded text-sm select-none group ${isHidden ? 'opacity-40' : ''}`}
        >
          {/* Left clickable area - includes left padding (8px) + indentation (depth * 16px) + chevron */}
          <div
            className={`flex items-center justify-end gap-1 flex-shrink-0 ${node.is_dir && hasChildren ? 'cursor-pointer' : ''}`}
            style={{ paddingLeft: '8px', width: `${depth * 16 + 8 + 12 + 4}px` }}
            onClick={node.is_dir && hasChildren ? (e) => {
              e.stopPropagation();
              toggleDir(node.path);
            } : undefined}
          >
            {node.is_dir ? (
              <>
                {hasChildren ? (
                  isExpanded ?
                    <ChevronDown className="w-3 h-3" /> :
                    <ChevronRight className="w-3 h-3" />
                ) : (
                  <div className="w-3 h-3" />
                )}
              </>
            ) : (
              <div className="w-3 h-3" />
            )}
          </div>
          {/* Icon and name area - double-click to open, right-click for context menu */}
          <div
            className="flex items-center gap-1 flex-1 cursor-pointer min-w-0 pr-2"
            onDoubleClick={(e) => handleDoubleClick(e, node)}
            onContextMenu={(e) => handleContextMenu(e, node)}
          >
            {node.is_dir ? (
              softwareFolderIcon ? (
                <img
                  src={softwareFolderIcon}
                  alt={node.name}
                  className="w-7 h-7 flex-shrink-0"
                />
              ) : (
                <FolderIcon color={folderColor || '#60a5fa'} />
              )
            ) : (
              <>
                {fileIcon ? (
                  <SoftwareIcon name={fileIcon} className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <File className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                )}
              </>
            )}
            <span className="truncate">{displayName}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleHidden(node.path);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-zinc-700 rounded"
            title={isHidden ? "Show" : "Hide"}
          >
            <EyeOff className="w-3 h-3 text-zinc-400" />
          </button>
        </div>
        {node.is_dir && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
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

  // Separate software folders from global folders
  const softwareFolderNames = ['blender', 'aftereffects', 'photoshop', 'houdini', 'maya', 'cinema4d', 'substance', 'unreal', 'unity', 'zbrush', 'marmoset'];
  const softwareFolders = tree.filter(node =>
    node.is_dir && softwareFolderNames.includes(node.name.toLowerCase())
  );
  const globalFolders = tree.filter(node =>
    !softwareFolderNames.includes(node.name.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <SimpleBar className="custom-scrollbar" autoHide={false} style={{ height: 'calc(100% - 40px)' }}>
        <div className="space-y-1">
        {tree.length > 0 ? (
          <>
            {/* Software folders first */}
            {softwareFolders.map(node => renderNode(node))}

            {/* Separator between software and global folders */}
            {softwareFolders.length > 0 && globalFolders.length > 0 && (
              <div className="my-2 mx-12 border-t border-zinc-800" />
            )}

            {/* Global folders */}
            {globalFolders.map(node => renderNode(node))}
          </>
        ) : (
          <p className="text-xs text-zinc-500">No files found</p>
        )}
        </div>
      </SimpleBar>
      <div className="mt-4 pt-3 border-t border-zinc-800 text-xs text-zinc-500">
        {loadingSize ? (
          <span style={{ marginBottom: '-2px' }}>Calculating size...</span>
        ) : directorySize !== null ? (
          <span style={{ marginBottom: '-8px' }}>Project size: {formatSize(directorySize)}</span>
        ) : null}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 z-50 min-w-[180px] animate-context-menu"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 300),
            left: Math.min(contextMenu.x, window.innerWidth - 200)
          }}
        >
          <button
            onClick={() => copyPath(contextMenu.node.path)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            {copiedPath === contextMenu.node.path ? (
              <>
                <Check className="w-4 h-4 text-green-500" />
                <span className="text-green-500">Path Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Path
              </>
            )}
          </button>
          {contextMenu.node.is_dir && (
            <>
              <button
                onClick={() => openInExplorer(contextMenu.node.path)}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                Open in Explorer
              </button>
              {!getSoftwareFolderIcon(contextMenu.node.name) && (
                <>
                  <div className="border-t border-zinc-700 my-1" />
                  <button
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
                  >
                    <Palette className="w-4 h-4" />
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
                        className="w-8 h-8 rounded border-2 border-zinc-600 hover:border-white transition-colors"
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                  {folderColors.has(contextMenu.node.path) && (
                    <button
                      onClick={() => removeFolderColor(contextMenu.node.path)}
                      className="w-full px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
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
