import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { SoftwareIcon } from '../SoftwareIcon';
import type { SoftwareName } from '../../types/project';
import { Film, Eye, FolderOpen, Copy, ChevronDown, RefreshCw } from 'lucide-react';
import { writeText } from '@tauri-apps/api/clipboard';
import { outputsCache } from '../../utils/outputsCache';
import { ContextMenu, ContextMenuItem } from '../ui/ContextMenu';
import { useContextMenu } from '../../hooks/useContextMenu';

interface OutputFile {
  name: string;
  path: string;
  software: SoftwareName;
  render_type: 'preview' | 'final';
  created_at: number;
  size: number;
  is_sequence: boolean;
  frame_range?: string;
  frame_count?: number;
  missing_frames?: string;
}

// Image sequence formats that should be checked for missing frames
const IMAGE_SEQUENCE_FORMATS = [
  'png', 'jpg', 'jpeg', 'exr', 'dpx', 'tif', 'tiff',
  'tga', 'bmp', 'hdr', 'pic', 'psd', 'sgi', 'rgb'
];

interface OutputOverviewProps {
  project: any;
  currentScene: any;
  currentShot: any;
  specialContextType?: 'asset' | 'compose' | null;
}

export function OutputOverview({ project, currentScene, currentShot, specialContextType }: OutputOverviewProps) {
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadRequestIdRef = useRef(0); // Track load requests to ignore stale ones

  // Compute filter values from props (not state, to avoid race conditions)
  const currentSceneFilter = useMemo(() => {
    if (specialContextType) return 'MAIN';
    if (project.hasScenes && currentScene) return currentScene.name;
    return null;
  }, [specialContextType, project.hasScenes, currentScene]);

  const currentShotFilter = useMemo(() => {
    if (specialContextType) return 'SH001';
    if (project.hasScenes && project.hasShots && currentShot) {
      return `SH${currentShot.number.toString().padStart(3, '0')}`;
    }
    return null;
  }, [specialContextType, project.hasScenes, project.hasShots, currentShot]);

  // Generate unique cache key for project + scene + shot + specialContext combination
  const getCacheKey = () => {
    const shotId = currentShot ? `_shot_${currentShot.number}` : '';
    const sceneId = currentScene ? `_scene_${currentScene.name}` : '';
    const specialContextId = specialContextType ? `_context_${specialContextType}` : '';
    return `${project.path}${sceneId}${shotId}${specialContextId}`;
  };

  // Initialize with empty values - will be set in useLayoutEffect before paint
  const [selectedSoftware, setSelectedSoftware] = useState<SoftwareName | ''>('');
  const [selectedOutputType, setSelectedOutputType] = useState<'preview' | 'final'>('preview');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => outputsCache.getExpandedGroups(project.path));
  const isFirstLoadRef = useRef(true);

  // Context menus using centralized hook
  const { isOpen: isFileMenuOpen, position: fileMenuPosition, data: fileMenuData, openMenu: openFileMenu, closeMenu: closeFileMenu } = useContextMenu<OutputFile>();
  const { isOpen: isGroupMenuOpen, position: groupMenuPosition, data: groupMenuData, openMenu: openGroupMenu, closeMenu: closeGroupMenu } = useContextMenu<{ groupPath: string; renderType: 'preview' | 'final' }>();
  const isRestoringStateRef = useRef(false); // Track if we're restoring state programmatically

  // Format software name for display
  const formatSoftwareName = (software: string): string => {
    if (software === 'after-effects') {
      return 'After Effects';
    }
    return software
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Save selected software and persist to cache
  const updateSelectedSoftware = (software: SoftwareName) => {
    setSelectedSoftware(software);
    outputsCache.setOutputState(getCacheKey(), software, selectedOutputType);
  };

  // Save selected output type and persist to cache
  // const updateSelectedOutputType = (type: 'preview' | 'final') => {
  //   setSelectedOutputType(type);
  //   if (selectedSoftware) {
  //     outputsCache.setOutputState(getCacheKey(), selectedSoftware, type);
  //   }
  // };

  const loadOutputs = async (forceReload = false) => {
    // Increment request ID to invalidate previous requests
    loadRequestIdRef.current += 1;
    const currentRequestId = loadRequestIdRef.current;

    // Check cache first if not forcing reload
    if (!forceReload) {
      const cacheKey = getCacheKey();
      const cachedOutputs = outputsCache.get(cacheKey);
      if (cachedOutputs) {
        setOutputs(cachedOutputs);
        setLoading(false);
        isFirstLoadRef.current = false;
        return;
      }
    }

    // Only show loading state for first load - keep old content visible during refresh
    if (isFirstLoadRef.current) {
      setLoading(true);
      isFirstLoadRef.current = false;
    }

    setError(null);
    try {
      if (!project?.path) {
        throw new Error('Project path is not defined');
      }

      // Capture filter values at the time of request
      const requestSceneFilter = currentSceneFilter;
      const requestShotFilter = currentShotFilter;
      const requestSpecialContext = specialContextType;

      // Use computed filter values from useMemo
      const result = await invoke<OutputFile[]>('get_project_outputs', {
        projectPath: project.path,
        sceneFilter: requestSceneFilter,
        shotFilter: requestShotFilter
      });

      // Check if this request is stale (newer request was made)
      if (currentRequestId !== loadRequestIdRef.current) {
        return;
      }

      let outputsArray = Array.isArray(result) ? result : [];

      // Apply client-side filtering for special contexts (ASSET/COMP)
      if (requestSpecialContext) {
        const contextSuffix = requestSpecialContext === 'asset' ? 'ASSET' : 'COMP';
        outputsArray = outputsArray.filter(output => {
          // Check if the output filename contains the special context suffix
          // Format: PROJECT_SCENE_*_ASSET_* or PROJECT_SCENE_*_COMP_*
          const nameUpper = output.name.toUpperCase();
          return nameUpper.includes(`_${contextSuffix}_`);
        });
      }

      setOutputs(outputsArray);

      // Cache the results
      outputsCache.set(getCacheKey(), outputsArray);
    } catch (err) {
      console.error('Failed to load outputs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load outputs');
      setOutputs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOutputs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path, currentScene, currentShot, specialContextType]);

  // Listen for output changes from file system watcher
  useEffect(() => {
    let unlisten: any;

    // Import listen function
    import('@tauri-apps/api/event').then(({ listen }) => {
      // Listen to output-changed event (specific for output files)
      listen('output-changed', () => {
        console.log('Output changed detected by file watcher');
        // Invalidate cache and reload immediately
        // No additional debounce needed - backend already debounces at 500ms
        outputsCache.invalidate(getCacheKey());
        loadOutputs(true);
      }).then((fn) => {
        unlisten = fn;
      });
    });

    // Note: We don't listen to 'refresh-all' event here because OutputOverview
    // triggers its own refresh when the button is clicked. Listening to the global
    // event causes race conditions when switching contexts during refresh.

    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  // Get unique software from outputs and sort alphabetically
  const availableSoftware = useMemo(() => {
    const softwareSet = new Set(outputs.map(o => o.software));
    return Array.from(softwareSet).sort();
  }, [outputs]);

  // Restore filter state BEFORE paint (prevents visual flicker)
  useLayoutEffect(() => {
    isRestoringStateRef.current = true; // Mark that we're restoring state programmatically

    const cacheKey = getCacheKey();
    const savedState = outputsCache.getOutputState(cacheKey);

    // Check if saved software exists in available outputs
    const savedSoftwareExists = savedState && availableSoftware.includes(savedState.selectedSoftware as SoftwareName);

    if (savedSoftwareExists) {
      // Restore saved state only if the software still exists in outputs
      setSelectedSoftware(savedState.selectedSoftware);
      setSelectedOutputType(savedState.selectedOutputType);
    } else {
      // No saved state OR saved software doesn't exist - pick from available outputs
      if (availableSoftware.length > 0) {
        setSelectedSoftware(availableSoftware[0]);
      } else {
        setSelectedSoftware('');
      }
      setSelectedOutputType('preview');
    }

    // Reset the flag after state updates are committed
    setTimeout(() => {
      isRestoringStateRef.current = false;
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path, currentScene?.name, currentShot?.number, outputs, availableSoftware]);

  // Filter outputs based on selected software only (not output type, since UI shows both Preview and Final columns)
  const filteredOutputs = useMemo(() => {
    return outputs.filter(output => output.software === selectedSoftware);
  }, [outputs, selectedSoftware]);

  // Group outputs by software and output type
  const groupedOutputs = useMemo(() => {
    const groups: Record<string, Record<'preview' | 'final', OutputFile[]>> = {};

    filteredOutputs.forEach(output => {
      if (!groups[output.software]) {
        groups[output.software] = { preview: [], final: [] };
      }
      groups[output.software][output.render_type].push(output);
    });

    // Sort outputs by creation time (newest first)
    Object.keys(groups).forEach(software => {
      groups[software].preview.sort((a, b) => b.created_at - a.created_at);
      groups[software].final.sort((a, b) => b.created_at - a.created_at);
    });

    return groups;
  }, [filteredOutputs]);


  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getFolderName = (path: string, isSequence: boolean): string | null => {
    // Extract the full path from Final/Preview folder to the file
    const parts = path.replace(/\\/g, '/').split('/').filter(p => p.length > 0);

    // Find the index of "Final" or "Preview" folder
    const finalIndex = parts.findIndex(p => p.toLowerCase() === 'final');
    const previewIndex = parts.findIndex(p => p.toLowerCase() === 'preview');
    const startIndex = finalIndex !== -1 ? finalIndex : previewIndex;

    if (startIndex !== -1 && parts.length > startIndex + 1) {
      // Get all parts after Final/Preview
      let pathParts = parts.slice(startIndex + 1);

      // For sequences, include the folder name (last part)
      // For files, exclude the filename (last part)
      let relevantParts = isSequence ? pathParts : pathParts.slice(0, -1);

      // Remove scene and shot folders from display if they match current filters
      // (since files are guaranteed to be in those folders when filtering is active)
      if ((currentSceneFilter && project.hasScenes) || (currentShotFilter && project.hasShots)) {
        relevantParts = relevantParts.filter(part => {
          const partNormalized = part.toUpperCase().replace(/\s/g, '');

          // Check if part matches scene filter
          if (currentSceneFilter && project.hasScenes) {
            const sceneNormalized = currentSceneFilter.toUpperCase().replace(/\s/g, '');
            if (partNormalized === sceneNormalized) return false;
          }

          // Check if part matches shot filter (strip "SH" prefix to match folder name)
          if (currentShotFilter && project.hasShots) {
            const shotNormalized = currentShotFilter.toUpperCase().replace(/\s/g, '').replace(/^SH/, '');
            if (partNormalized === shotNormalized) return false;
          }

          return true;
        });
      }

      return relevantParts.length > 0 ? relevantParts.join(' / ') : null;
    }

    return null;
  };

  // Extract path parts after Final/Preview for grouping
  const getPathParts = (path: string, isSequence: boolean): string[] => {
    const parts = path.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
    const finalIndex = parts.findIndex(p => p.toLowerCase() === 'final');
    const previewIndex = parts.findIndex(p => p.toLowerCase() === 'preview');
    const startIndex = finalIndex !== -1 ? finalIndex : previewIndex;

    if (startIndex !== -1 && parts.length > startIndex + 1) {
      let pathParts = parts.slice(startIndex + 1);
      let relevantParts = isSequence ? pathParts : pathParts.slice(0, -1);

      // Remove scene and shot folders from path parts for grouping
      if ((currentSceneFilter && project.hasScenes) || (currentShotFilter && project.hasShots)) {
        relevantParts = relevantParts.filter(part => {
          const partNormalized = part.toUpperCase().replace(/\s/g, '');

          // Check if part matches scene filter
          if (currentSceneFilter && project.hasScenes) {
            const sceneNormalized = currentSceneFilter.toUpperCase().replace(/\s/g, '');
            if (partNormalized === sceneNormalized) return false;
          }

          // Check if part matches shot filter (strip "SH" prefix to match folder name)
          if (currentShotFilter && project.hasShots) {
            const shotNormalized = currentShotFilter.toUpperCase().replace(/\s/g, '').replace(/^SH/, '');
            if (partNormalized === shotNormalized) return false;
          }

          return true;
        });
      }

      return relevantParts;
    }
    return [];
  };

  // Get relative path from group prefix (for displaying inside groups)
  const getRelativePathInGroup = (output: OutputFile, groupPrefix: string): string => {
    const pathParts = getPathParts(output.path, output.is_sequence);
    const groupParts = groupPrefix.split(' / ').filter(p => p.length > 0);

    // Get parts after the group prefix
    const relativeParts = pathParts.slice(groupParts.length);

    if (relativeParts.length > 0) {
      return relativeParts.join(' / ') + ' / ';
    }

    return '';
  };

  // Toggle group expanded/collapsed state
  const toggleGroup = useCallback((groupPath: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupPath)) {
        newSet.delete(groupPath);
      } else {
        newSet.add(groupPath);
      }
      // Save to cache
      outputsCache.setExpandedGroups(project.path, newSet);
      return newSet;
    });
  }, [project.path]);

  // Smart grouping algorithm (memoized for performance)
  const groupOutputsByPath = useCallback((outputs: OutputFile[]) => {
    if (outputs.length === 0) return { grouped: [], ungrouped: [] };

    // Build a map of path prefixes to files
    const pathMap = new Map<string, OutputFile[]>();

    outputs.forEach(output => {
      const pathParts = getPathParts(output.path, output.is_sequence);

      // Try different grouping levels (from 1 to 5)
      if (pathParts.length === 0 || pathParts.length === 1) {
        // No path parts or single level - don't group, add to ungrouped
        const key = '__ungrouped__';
        if (!pathMap.has(key)) pathMap.set(key, []);
        pathMap.get(key)!.push(output);
      } else {
        // Multiple path levels - try to find the optimal grouping level
        // Start from pathParts.length - 1 to avoid grouping by the deepest folder
        for (let depth = Math.min(pathParts.length - 1, 5); depth >= 1; depth--) {
          const prefix = pathParts.slice(0, depth).join(' / ');
          if (!pathMap.has(prefix)) pathMap.set(prefix, []);
          pathMap.get(prefix)!.push(output);
          break;
        }
      }
    });

    // Separate grouped and ungrouped
    const grouped: { path: string; files: OutputFile[] }[] = [];
    const ungrouped: OutputFile[] = [];

    pathMap.forEach((files, key) => {
      if (key === '__ungrouped__') {
        ungrouped.push(...files);
      } else if (files.length >= 2) {
        // Only group if there are 2+ files
        grouped.push({ path: key, files });
      } else {
        // Single file, add to ungrouped
        ungrouped.push(...files);
      }
    });

    // Sort groups by path
    grouped.sort((a, b) => a.path.localeCompare(b.path));

    // Sort files within each group by creation time (newest first)
    grouped.forEach(group => {
      group.files.sort((a, b) => b.created_at - a.created_at);
    });

    // Sort ungrouped files by creation time
    ungrouped.sort((a, b) => b.created_at - a.created_at);

    return { grouped, ungrouped };
  }, [currentSceneFilter, currentShotFilter, project.hasScenes, project.hasShots]);

  // Memoized grouped outputs by path for each software type (MAJOR PERFORMANCE OPTIMIZATION)
  // This prevents re-grouping 380+ files on every render
  const groupedByPath = useMemo(() => {
    const result: Record<string, { preview: ReturnType<typeof groupOutputsByPath>; final: ReturnType<typeof groupOutputsByPath> }> = {};

    Object.entries(groupedOutputs).forEach(([software, types]) => {
      result[software] = {
        preview: groupOutputsByPath(types.preview),
        final: groupOutputsByPath(types.final)
      };
    });

    return result;
  }, [groupedOutputs, groupOutputsByPath, currentSceneFilter, currentShotFilter]);

  const handleOutputClick = useCallback(async (output: OutputFile) => {
    try {
      await invoke('open_file', { filePath: output.path });
    } catch (error) {
      console.error('Failed to open output:', error);
    }
  }, []);

  const handleRevealInExplorer = useCallback(async (outputPath: string) => {
    try {
      await invoke('reveal_in_explorer', { path: outputPath });
      closeFileMenu();
    } catch (error) {
      console.error('Failed to reveal in explorer:', error);
    }
  }, [closeFileMenu]);

  const handleCopyPath = useCallback(async (outputPath: string) => {
    try {
      await writeText(outputPath);
      closeFileMenu();
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  }, [closeFileMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, output: OutputFile) => {
    openFileMenu(e, output);
  }, [openFileMenu]);

  const handleGroupContextMenu = useCallback((e: React.MouseEvent, groupPath: string, renderType: 'preview' | 'final') => {
    openGroupMenu(e, { groupPath, renderType });
  }, [openGroupMenu]);

  const getGroupFolderPath = (groupPath: string, renderType: 'preview' | 'final'): string => {
    const typeFolder = renderType === 'preview' ? 'Preview' : 'Final';
    const relativePath = groupPath.replace(/\s*\/\s*/g, '\\'); // Convert to backslashes and remove spaces

    // Get the software from outputs to find the correct folder
    const firstOutput = filteredOutputs.find(o => {
      const pathParts = getPathParts(o.path, o.is_sequence);
      const outputPrefix = pathParts.slice(0, Math.min(pathParts.length - 1, 5)).join(' / ');
      return outputPrefix === groupPath || pathParts.join(' / ').startsWith(groupPath);
    });

    if (firstOutput) {
      // Extract the actual folder path from the first file in the group
      const parts = firstOutput.path.replace(/\\/g, '/').split('/');
      const finalIndex = parts.findIndex(p => p.toLowerCase() === 'final');
      const previewIndex = parts.findIndex(p => p.toLowerCase() === 'preview');
      const startIndex = finalIndex !== -1 ? finalIndex : previewIndex;

      if (startIndex !== -1) {
        // For sequences, the path IS the folder
        // For files, get the parent directory
        const endIndex = firstOutput.is_sequence ? parts.length : parts.length - 1;
        const folderPath = parts.slice(0, endIndex).join('\\');
        return folderPath;
      }
    }

    // Fallback path depends on whether project has scenes
    let fallbackPath: string;
    if (project.hasScenes && currentScene) {
      // New hierarchy: Software/SCENE_CODE/Render/Preview/
      fallbackPath = `${project.path}\\Blender\\${currentScene.name}\\Render\\${typeFolder}\\${relativePath}`;
    } else {
      // Flat hierarchy: Software/Render/Preview/
      fallbackPath = `${project.path}\\Blender\\Render\\${typeFolder}\\${relativePath}`;
    }
    return fallbackPath;
  };

  const handleRevealGroupInExplorer = async (groupPath: string, renderType: 'preview' | 'final') => {
    try {
      const folderPath = getGroupFolderPath(groupPath, renderType);
      await invoke('reveal_in_explorer', { path: folderPath });
      closeGroupMenu();
    } catch (error) {
      console.error('Failed to reveal group in explorer:', error);
    }
  };

  const handleCopyGroupPath = async (groupPath: string, renderType: 'preview' | 'final') => {
    try {
      const folderPath = getGroupFolderPath(groupPath, renderType);
      await writeText(folderPath);
      closeGroupMenu();
    } catch (error) {
      console.error('Failed to copy group path:', error);
    }
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);

    // Invalidate cache and trigger reload
    outputsCache.invalidate(getCacheKey());
    await loadOutputs(true);

    // Trigger global refresh event for TreeView and VersionsOverview
    window.dispatchEvent(new CustomEvent('refresh-all'));

    // Stop animation after rotation completes (300ms)
    setTimeout(() => setIsRefreshing(false), 300);
  };

  if (loading) {
    return (
      <div className="mb-6">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Output Overview</h3>
        <div data-output-overview className="bg-card-bg border border-border-primary rounded-med p-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Output Overview</h3>
        <div data-output-overview className="bg-card-bg border border-border-primary rounded-med p-4">
          <p className="text-xs text-red-400 text-center">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (outputs.length === 0) {
    return (
      <div className="mb-6">
        {/* Header with title and refresh button */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-text-secondary">Output Overview</h3>
          <button
            onClick={handleRefreshAll}
            className="p-1.5 hover:bg-hover-bg rounded-lg transition-colors group"
            title="Refresh all (Tree, Versions, Outputs)"
            disabled={isRefreshing}
          >
            <RefreshCw
              className="w-4 h-4 text-text-secondary group-hover:text-white transition-colors"
              style={{
                transform: isRefreshing ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: isRefreshing ? 'transform 0.3s ease-in-out' : 'none'
              }}
            />
          </button>
        </div>
        <div data-output-overview className="bg-card-bg border border-border-primary rounded-med p-4">
          <p className="text-xs text-text-muted text-center">No outputs found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      {/* Header with title and refresh button */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-secondary">Output Overview</h3>
        <button
          onClick={handleRefreshAll}
          className="p-1.5 hover:bg-hover-bg rounded-lg transition-colors group"
          title="Refresh all (Tree, Versions, Outputs)"
          disabled={isRefreshing}
        >
          <RefreshCw
            className="w-4 h-4 text-text-secondary group-hover:text-white transition-colors"
            style={{
              transform: isRefreshing ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: isRefreshing ? 'transform 0.3s ease-in-out' : 'none'
            }}
          />
        </button>
      </div>

      {/* Filters */}
      {availableSoftware.length > 1 && (
        <div className="flex gap-2 mb-3 items-stretch">
          {/* Software Filter - only show if more than one software */}
          <div className="flex gap-1 bg-zinc-800/50 border border-border-primary rounded-button p-1 flex-shrink-0">
            {availableSoftware.map(software => (
              <button
                key={software}
                onClick={() => updateSelectedSoftware(software)}
                className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 ${
                  !isRestoringStateRef.current ? 'transition-colors' : ''
                } ${
                  selectedSoftware === software
                    ? 'bg-zinc-700 text-white'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                <SoftwareIcon name={software} className="w-3.5 h-3.5" />
                <span>{formatSoftwareName(software)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Outputs Grid */}
      <div className="space-y-4">
        {Object.entries(groupedOutputs).map(([software, types]) => (
          <div data-output-overview key={software} className="bg-card-bg border border-border-primary rounded-med overflow-hidden">
            {/* Software Header */}
            <div className="bg-zinc-800/50 px-4 py-2 flex items-center gap-2 border-b border-zinc-700/50">
              <SoftwareIcon name={software} className="w-4 h-4" />
              <span className="text-sm font-medium text-text-primary">{formatSoftwareName(software)}</span>
              <span className="text-xs text-text-muted ml-auto">
                {types.preview.length + types.final.length} outputs
              </span>
            </div>

            {/* Two Column Layout with Divider (Headers + Content) */}
            <div className="grid grid-cols-2 divide-x divide-border-secondary">
              {/* Preview Column */}
              <div className="flex flex-col">
                {/* Preview Header */}
                <div className="flex items-center gap-2 px-5 pt-3 pb-2">
                  <Eye className="w-3.5 h-3.5 text-text-secondary" />
                  <span className="text-xs font-medium text-text-secondary">Preview ({types.preview.length})</span>
                </div>
                {/* Preview Content - Scrollable */}
                <div className="px-3 pb-3 space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar">
                      {(() => {
                        const { grouped, ungrouped } = groupedByPath[software]?.preview || { grouped: [], ungrouped: [] };

                        const renderOutputButton = (output: OutputFile, groupPrefix?: string) => (
                  <button
                    key={output.path}
                    onDoubleClick={() => handleOutputClick(output)}
                    onContextMenu={(e) => handleContextMenu(e, output)}
                    className="w-full text-left px-3 py-2 rounded bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-text-primary group-hover:text-white transition-colors truncate block">
                          {groupPrefix ? (
                            <span className="text-text-muted">{getRelativePathInGroup(output, groupPrefix)}</span>
                          ) : (
                            getFolderName(output.path, output.is_sequence) && (
                              <span className="text-text-muted">{getFolderName(output.path, output.is_sequence)} / </span>
                            )
                          )}
                          {output.name}
                        </span>
                        {output.is_sequence && output.frame_count && (() => {
                          // Check if this is an image sequence format
                          const ext = output.name.split('.').pop()?.toLowerCase() || '';
                          const isImageSequence = IMAGE_SEQUENCE_FORMATS.includes(ext);

                          // Only show frame info for image sequences
                          if (!isImageSequence) return null;

                          return (
                            <span className="text-xs text-text-muted">
                              {output.frame_count} frames
                              {output.missing_frames && (
                                <> | <span className="text-amber-500">Missing: {output.missing_frames}</span></>
                              )}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-muted flex-shrink-0">
                        <span>{formatFileSize(output.size)}</span>
                        <span>{formatDate(output.created_at)}</span>
                      </div>
                    </div>
                  </button>
                );

                return (
                  <div className="space-y-2">
                      {/* Grouped files */}
                      {grouped.map(group => {
                        const isExpanded = expandedGroups.has(group.path);
                        return (
                          <div key={group.path} className="space-y-1">
                            {/* Group header */}
                            <button
                              onClick={() => toggleGroup(group.path)}
                              onContextMenu={(e) => handleGroupContextMenu(e, group.path, 'preview')}
                              className="w-full text-left px-3 py-2 rounded bg-zinc-700/30 hover:bg-zinc-700/50 transition-colors flex items-center gap-2"
                            >
                              <ChevronDown
                                className={`w-4 h-4 text-text-secondary transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                              />
                              <span className="text-sm text-text-secondary">{group.path} /</span>
                              <span className="text-xs text-text-muted ml-auto">({group.files.length})</span>
                            </button>

                            {/* Group files */}
                            <div
                              className={`overflow-hidden transition-[max-height] duration-200 ease-in-out ${
                                isExpanded ? 'max-h-[2000px]' : 'max-h-0'
                              }`}
                            >
                              <div className="pl-6 space-y-1 pt-1">
                                {group.files.map(output => renderOutputButton(output, group.path))}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                        {/* Ungrouped files */}
                        {ungrouped.map(output => renderOutputButton(output))}
                      </div>
                      );
                      })()}
                  {types.preview.length === 0 && (
                    <div className="p-4 text-center text-xs text-text-muted">No preview outputs</div>
                  )}
                </div>
              </div>

              {/* Final Column */}
              <div className="flex flex-col">
                {/* Final Header */}
                <div className="flex items-center gap-2 px-5 pt-3 pb-2">
                  <Film className="w-3.5 h-3.5 text-text-secondary" />
                  <span className="text-xs font-medium text-text-secondary">Final ({types.final.length})</span>
                </div>
                {/* Final Content - Scrollable */}
                <div className="px-3 pb-3 space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar">
                      {(() => {
                const { grouped, ungrouped } = groupedByPath[software]?.final || { grouped: [], ungrouped: [] };

                const renderOutputButton = (output: OutputFile, groupPrefix?: string) => (
                  <button
                    key={output.path}
                    onDoubleClick={() => handleOutputClick(output)}
                    onContextMenu={(e) => handleContextMenu(e, output)}
                    className="w-full text-left px-3 py-2 rounded bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-text-primary group-hover:text-white transition-colors truncate block">
                          {groupPrefix ? (
                            <span className="text-text-muted">{getRelativePathInGroup(output, groupPrefix)}</span>
                          ) : (
                            getFolderName(output.path, output.is_sequence) && (
                              <span className="text-text-muted">{getFolderName(output.path, output.is_sequence)} / </span>
                            )
                          )}
                          {output.name}
                        </span>
                        {output.is_sequence && output.frame_count && (() => {
                          // Check if this is an image sequence format
                          const ext = output.name.split('.').pop()?.toLowerCase() || '';
                          const isImageSequence = IMAGE_SEQUENCE_FORMATS.includes(ext);

                          // Only show frame info for image sequences
                          if (!isImageSequence) return null;

                          return (
                            <span className="text-xs text-text-muted">
                              {output.frame_count} frames
                              {output.missing_frames && (
                                <> | <span className="text-amber-500">Missing: {output.missing_frames}</span></>
                              )}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-muted flex-shrink-0">
                        <span>{formatFileSize(output.size)}</span>
                        <span>{formatDate(output.created_at)}</span>
                      </div>
                    </div>
                  </button>
                );

                return (
                  <div className="space-y-2">
                      {/* Grouped files */}
                      {grouped.map(group => {
                        const isExpanded = expandedGroups.has(group.path);
                        return (
                          <div key={group.path} className="space-y-1">
                            {/* Group header */}
                            <button
                              onClick={() => toggleGroup(group.path)}
                              onContextMenu={(e) => handleGroupContextMenu(e, group.path, 'final')}
                              className="w-full text-left px-3 py-2 rounded bg-zinc-700/30 hover:bg-zinc-700/50 transition-colors flex items-center gap-2"
                            >
                              <ChevronDown
                                className={`w-4 h-4 text-text-secondary transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                              />
                              <span className="text-sm text-text-secondary">{group.path} /</span>
                              <span className="text-xs text-text-muted ml-auto">({group.files.length})</span>
                            </button>

                            {/* Group files */}
                            <div
                              className={`overflow-hidden transition-[max-height] duration-200 ease-in-out ${
                                isExpanded ? 'max-h-[2000px]' : 'max-h-0'
                              }`}
                            >
                              <div className="pl-6 space-y-1 pt-1">
                                {group.files.map(output => renderOutputButton(output, group.path))}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                        {/* Ungrouped files */}
                        {ungrouped.map(output => renderOutputButton(output))}
                      </div>
                      );
                      })()}
                  {types.final.length === 0 && (
                    <div className="p-4 text-center text-xs text-text-muted">No final outputs</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && !isRefreshing && filteredOutputs.length === 0 && (
        <div data-output-overview className="bg-card-bg border border-border-primary rounded-med p-4">
          <p className="text-xs text-text-muted text-center">No outputs match the selected filters.</p>
        </div>
      )}

      {/* File Context Menu */}
      <ContextMenu
        isOpen={isFileMenuOpen}
        position={fileMenuPosition}
        onClose={closeFileMenu}
        menuId="output-file"
      >
        <ContextMenuItem
          icon={<FolderOpen className="w-4 h-4" />}
          onClick={() => fileMenuData && handleRevealInExplorer(fileMenuData.path)}
        >
          Reveal in Explorer
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Copy className="w-4 h-4" />}
          onClick={() => fileMenuData && handleCopyPath(fileMenuData.path)}
        >
          Copy Path
        </ContextMenuItem>
      </ContextMenu>

      {/* Group Context Menu */}
      <ContextMenu
        isOpen={isGroupMenuOpen}
        position={groupMenuPosition}
        onClose={closeGroupMenu}
        menuId="output-group"
      >
        <ContextMenuItem
          icon={<FolderOpen className="w-4 h-4" />}
          onClick={() => groupMenuData && handleRevealGroupInExplorer(groupMenuData.groupPath, groupMenuData.renderType)}
        >
          Reveal in Explorer
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Copy className="w-4 h-4" />}
          onClick={() => groupMenuData && handleCopyGroupPath(groupMenuData.groupPath, groupMenuData.renderType)}
        >
          Copy Path
        </ContextMenuItem>
      </ContextMenu>
    </div>
  );
}
