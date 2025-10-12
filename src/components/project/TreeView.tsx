import { useState, useEffect, useRef } from 'react';
import { Folder, File, ChevronRight, ChevronDown, EyeOff } from 'lucide-react';
import { invoke } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';
import { useProjectStore } from '../../store/projectStore';
import { SoftwareIcon } from '../SoftwareIcon';

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
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
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
  const clickTimerRef = useRef<number | null>(null);
  const loadingTimerRef = useRef<number | null>(null);
  const isFirstLoadRef = useRef(true);
  const debounceTimerRef = useRef<number | null>(null);
  const maxWaitTimerRef = useRef<number | null>(null);
  const isPendingReloadRef = useRef(false);
  const currentProjectPathRef = useRef(project.path);

  // Save hidden paths to localStorage whenever they change
  useEffect(() => {
    try {
      const pathsArray = Array.from(hiddenPaths);
      localStorage.setItem(`hiddenPaths_${project.path}`, JSON.stringify(pathsArray));
    } catch (error) {
      console.error('Failed to save hidden paths to localStorage:', error);
    }
  }, [hiddenPaths, project.path]);

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
      }
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
    // Reset state when project changes
    setTree([]);
    setLoading(true);
    isFirstLoadRef.current = true;

    // Clear all timers when switching projects
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
    setLoadingSize(true);
    try {
      const projectPath = currentProjectPathRef.current;
      const size = await invoke<number>('get_directory_size', { path: projectPath });

      // Check if project changed while loading
      if (projectPath !== currentProjectPathRef.current) {
        console.log('Project changed during size load, discarding results');
        return;
      }

      setDirectorySize(size);
    } catch (error) {
      console.error('Failed to load directory size:', error);
    } finally {
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

  const handleClick = (node: FileNode) => {
    if (!node.is_dir) return;

    // Clear any existing timer
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    // Set a new timer for single click action
    clickTimerRef.current = window.setTimeout(() => {
      toggleDir(node.path);
      clickTimerRef.current = null;
    }, 200); // 200ms delay to distinguish from double click
  };

  const handleDoubleClick = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();

    // Clear the single click timer to prevent toggle
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    if (node.is_dir) {
      const { openInExplorer } = useProjectStore.getState();
      openInExplorer(node.path);
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

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'blend':
        return 'Blender';
      case 'aep':
        return 'After Effects';
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

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path);
    const hasChildren = node.children && node.children.length > 0;
    const fileIcon = !node.is_dir ? getFileIcon(node.name) : null;
    const isHidden = hiddenPaths.has(node.path);

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
          className={`flex items-center gap-1 px-2 py-1 hover:bg-zinc-800 rounded text-sm select-none group ${isHidden ? 'opacity-40' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 24}px` }}
        >
          <div
            className="flex items-center gap-1 flex-1 cursor-pointer"
            onClick={() => handleClick(node)}
            onDoubleClick={(e) => handleDoubleClick(e, node)}
          >
            {node.is_dir ? (
              <>
                {hasChildren ? (
                  isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                ) : (
                  <div className="w-3 h-3" />
                )}
                <Folder className="w-4 h-4 text-blue-400" />
              </>
            ) : (
              <>
                <div className="w-3 h-3" />
                {fileIcon ? (
                  <SoftwareIcon name={fileIcon} className="w-4 h-4" />
                ) : (
                  <File className="w-4 h-4 text-zinc-400" />
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto space-y-1">
        {tree.length > 0 ? (
          tree.map(node => renderNode(node))
        ) : (
          <p className="text-xs text-zinc-500">No files found</p>
        )}
      </div>
      <div className="mt-4 pt-3 border-t border-zinc-800 text-xs text-zinc-500">
        {loadingSize ? (
          <span>Calculating size...</span>
        ) : directorySize !== null ? (
          <span>Project size: {formatSize(directorySize)}</span>
        ) : null}
      </div>
    </div>
  );
}
