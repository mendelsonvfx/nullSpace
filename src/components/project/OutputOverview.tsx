import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { SoftwareIcon } from '../SoftwareIcon';
import type { SoftwareName } from '../../types/project';
import { Film, Eye, FolderOpen, Copy, ChevronDown, RefreshCw } from 'lucide-react';
import { writeText } from '@tauri-apps/api/clipboard';
import { outputsCache } from '../../utils/outputsCache';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from '../ui/ContextMenu';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useNullConverter } from '../../hooks/useNullConverter';
import { NullConverterMenuItem } from '../ui/NullConverterMenuItem';
// Output labels are folder names ("AfterEffects", "UnrealEngine"); the shared helper maps them to display names
import { formatSoftwareName } from '../../features/time-tracking/utils/softwareUtils';

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
  const nullConverter = useNullConverter();
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
    if (specialContextType) return '001';
    if (project.hasScenes && project.hasShots && currentShot) {
      return currentShot.number.toString().padStart(3, '0');
    }
    return null;
  }, [specialContextType, project.hasScenes, project.hasShots, currentShot]);

  // Generate unique cache key for project + scene + shot + specialContext combination
  // Compose outputs depend on which compose software is enabled — reload when it changes
  const composeKey = specialContextType === 'compose' ? `_cs_${(project.composeSoftware || []).join(',')}` : '';

  const cacheKey = useMemo(() => {
    const shotId = currentShot ? `_shot_${currentShot.number}` : '';
    const sceneId = currentScene ? `_scene_${currentScene.name}` : '';
    const specialContextId = specialContextType ? `_context_${specialContextType}` : '';
    return `${project.path}${sceneId}${shotId}${specialContextId}${composeKey}`;
  }, [project.path, currentScene, currentShot, specialContextType, composeKey]);

  // Initialize with empty values - will be set in useLayoutEffect before paint
  const [selectedSoftware, setSelectedSoftware] = useState<SoftwareName | ''>('');
  const [selectedOutputType, setSelectedOutputType] = useState<'preview' | 'final'>('preview');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => outputsCache.getExpandedGroups(project.path));
  const isFirstLoadRef = useRef(true);

  // Context menus using centralized hook
  const { isOpen: isFileMenuOpen, position: fileMenuPosition, data: fileMenuData, openMenu: openFileMenu, closeMenu: closeFileMenu } = useContextMenu<OutputFile>();
  const { isOpen: isGroupMenuOpen, position: groupMenuPosition, data: groupMenuData, openMenu: openGroupMenu, closeMenu: closeGroupMenu } = useContextMenu<{ groupPath: string; renderType: 'preview' | 'final' }>();
  const isRestoringStateRef = useRef(false); // Track if we're restoring state programmatically

  // Save selected software and persist to cache
  const updateSelectedSoftware = (software: SoftwareName) => {
    setSelectedSoftware(software);
    outputsCache.setOutputState(cacheKey, software, selectedOutputType);
  };


  const loadOutputs = async (forceReload = false) => {
    // Increment request ID to invalidate previous requests
    loadRequestIdRef.current += 1;
    const currentRequestId = loadRequestIdRef.current;

    // Check cache first if not forcing reload
    if (!forceReload) {
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
        shotFilter: requestShotFilter,
        specialContext: requestSpecialContext ?? null
      });

      // Check if this request is stale (newer request was made)
      if (currentRequestId !== loadRequestIdRef.current) {
        return;
      }

      let outputsArray = Array.isArray(result) ? result : [];

      // Apply client-side filtering for special contexts
      if (requestSpecialContext === 'asset') {
        outputsArray = outputsArray.filter(output => {
          const nameUpper = output.name.toUpperCase();
          return nameUpper.includes('_ASSET_');
        });
      } else if (requestSpecialContext === 'compose') {
        // Keep only files physically inside _GlobalCompose (backend returns all outputs)
        outputsArray = outputsArray.filter(output =>
          output.path.includes('_GlobalCompose')
        );
      }

      setOutputs(outputsArray);

      // Cache the results
      outputsCache.set(cacheKey, outputsArray);
    } catch (err) {
      console.error('Failed to load outputs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load outputs');
      setOutputs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset outputs immediately to prevent showing stale data from previous context
    setOutputs([]);
    isFirstLoadRef.current = true;
    loadOutputs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path, currentScene, currentShot, specialContextType, composeKey]);

  // Listen for output changes from file system watcher
  useEffect(() => {
    let aborted = false;
    let unlisten: (() => void) | undefined;

    // Import listen function
    import('@tauri-apps/api/event').then(({ listen }) => {
      if (aborted) return; // unmounted before dynamic import resolved
      // Listen to output-changed event (specific for output files)
      listen('output-changed', () => {
        console.log('Output changed detected by file watcher');
        // Invalidate cache and reload immediately
        // No additional debounce needed - backend already debounces at 500ms
        outputsCache.invalidate(cacheKey);
        loadOutputs(true);
      }).then((fn) => {
        if (aborted) fn();
        else unlisten = fn;
      });
    });

    // Note: We don't listen to 'refresh-all' event here because OutputOverview
    // triggers its own refresh when the button is clicked. Listening to the global
    // event causes race conditions when switching contexts during refresh.

    return () => {
      aborted = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path, cacheKey]);

  // Get unique software from outputs and sort alphabetically
  const availableSoftware = useMemo(() => {
    const softwareSet = new Set(outputs.map(o => o.software));
    return Array.from(softwareSet).sort();
  }, [outputs]);

  // Restore filter state BEFORE paint (prevents visual flicker)
  useLayoutEffect(() => {
    // Wait until outputs have loaded — avoids premature reset when availableSoftware is still empty
    if (availableSoftware.length === 0) return;

    isRestoringStateRef.current = true; // Mark that we're restoring state programmatically

    const savedState = outputsCache.getOutputState(cacheKey);

    // Check if saved software exists in available outputs
    const savedSoftwareExists = savedState && availableSoftware.includes(savedState.selectedSoftware as SoftwareName);

    if (savedSoftwareExists) {
      // Restore saved state only if the software still exists in outputs
      setSelectedSoftware(savedState.selectedSoftware);
      setSelectedOutputType(savedState.selectedOutputType);
    } else {
      // No saved state OR saved software doesn't exist - pick from available outputs
      setSelectedSoftware(availableSoftware[0]);
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
  const toggleGroup = useCallback((groupPath: string, renderType: 'preview' | 'final') => {
    const key = `${renderType}:${groupPath}`;
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
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
      // getPathParts with output.is_sequence correctly returns folder parts for both types:
      // - sequence: output.path is the directory (no filename) → returns directory parts
      // - standalone: output.path is the file path → strips filename, returns parent parts
      // Group by top-level folder (depth=1). Files in TEST/sub/ and sequences in TEST/
      // both map to 'TEST', so they always appear in the same group.
      const pathParts = getPathParts(output.path, output.is_sequence);

      if (pathParts.length === 0) {
        if (!pathMap.has('__ungrouped__')) pathMap.set('__ungrouped__', []);
        pathMap.get('__ungrouped__')!.push(output);
        return;
      }

      const folderKey = pathParts[0];
      if (!pathMap.has(folderKey)) pathMap.set(folderKey, []);
      pathMap.get(folderKey)!.push(output);
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
    outputsCache.invalidate(cacheKey);
    await loadOutputs(true);

    // Trigger global refresh event for TreeView and VersionsOverview
    window.dispatchEvent(new CustomEvent('refresh-all'));

    // Stop animation after rotation completes (300ms)
    setTimeout(() => setIsRefreshing(false), 300);
  };

  if (loading) {
    return (
      <div className="mb-6">
        <div data-output-overview className="bg-card-bg border border-border-primary rounded-card p-4">
          {/* Header */}
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-text-secondary">Output Overview</span>
            <div className="flex items-center gap-3">
              <div className="w-[90px] h-8 bg-[#1a1a1a] border border-[#262626] rounded-[6px]" />
              <div className="w-[90px] h-8 bg-[#1a1a1a] border border-[#262626] rounded-[6px]" />
              <div className="w-8 h-8 bg-[#1a1a1a] border border-[#262626] rounded-[6px]" />
            </div>
          </div>

          {/* Skeleton software header */}
          <div className="bg-zinc-800/50 px-4 py-2 flex items-center gap-2 border-b border-zinc-700/50 rounded-t-[10px]">
            <div className="w-4 h-4 bg-[#1a1a1a] rounded" />
            <div className="h-4 bg-[#1a1a1a] rounded w-16" />
            <div className="h-3 bg-[#1a1a1a] rounded w-[70px] ml-auto" />
          </div>

          {/* Skeleton two-column layout */}
          <div className="grid grid-cols-2 divide-x divide-border-secondary">
            {/* Preview column */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-5 pt-3 pb-2">
                <div className="w-[13px] h-[13px] bg-[#1a1a1a] rounded" />
                <div className="h-3 bg-[#1a1a1a] rounded w-20" />
              </div>
              <div className="px-3 pb-3 space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="bg-[#0f0f0f] border border-border-primary rounded-lg p-3 flex flex-col gap-2">
                    <div className="w-[75%] h-3.5 bg-[#1a1a1a] rounded" />
                    <div className="flex gap-3">
                      <div className="w-[60px] h-[11px] bg-[#1a1a1a] rounded" />
                      <div className="w-[60px] h-[11px] bg-[#1a1a1a] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Final column */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-5 pt-3 pb-2">
                <div className="w-[13px] h-[13px] bg-[#1a1a1a] rounded" />
                <div className="h-3 bg-[#1a1a1a] rounded w-16" />
              </div>
              <div className="px-3 pb-3">
                <div className="bg-[#0f0f0f] border border-border-primary rounded-lg p-8 flex justify-center">
                  <div className="w-[120px] h-3.5 bg-[#1a1a1a] rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  if (error) {
    return (
      <div className="mb-6">
        <div data-output-overview className="bg-card-bg border border-border-primary rounded-card p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-text-secondary">Output Overview</span>
          </div>
          <p className="text-xs text-red-400 text-center py-4">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (outputs.length === 0) {
    return (
      <div className="mb-6">
        <div data-output-overview className="bg-card-bg border border-border-primary rounded-card p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-text-secondary">Output Overview</span>
            <button
              onClick={handleRefreshAll}
              className="w-7 h-7 flex items-center justify-center flex-shrink-0 border border-[#262626] rounded-[6px] hover:bg-[#1a1a1a] hover:border-[#3f3f46] transition-colors"
              title="Refresh all (Tree, Versions, Outputs)"
              disabled={isRefreshing}
            >
              <RefreshCw
                className="w-[15px] h-[15px] text-zinc-500"
                style={{
                  transform: isRefreshing ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: isRefreshing ? 'transform 0.3s ease-in-out' : 'none'
                }}
              />
            </button>
          </div>
          <div className="bg-[#0f0f0f] rounded-lg p-4">
            <p className="text-xs text-text-muted text-center py-4">No outputs found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="bg-card-bg border border-border-primary rounded-card p-4 transition-[border-color] duration-200 hover:border-[#262626]">
        {/* Module Header */}
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-medium text-text-secondary">Output Overview</span>
          <div className="flex items-center gap-3">
            {/* Software Tabs */}
            {availableSoftware.map(software => (
              <button
                key={software}
                onClick={() => updateSelectedSoftware(software)}
                className={`px-2.5 h-7 rounded-[6px] text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap border ${!isRestoringStateRef.current ? 'transition-colors' : ''
                  } ${selectedSoftware === software
                    ? 'bg-[#1a1a1a] border-[#3f3f46] text-text-primary'
                    : 'border-[#262626] text-zinc-500 hover:bg-[#1a1a1a] hover:border-[#3f3f46]'
                  }`}
              >
                <SoftwareIcon name={software} className="w-3.5 h-3.5" />
                <span>{formatSoftwareName(software)}</span>
              </button>
            ))}
            <button
              onClick={handleRefreshAll}
              className="w-7 h-7 flex items-center justify-center flex-shrink-0 border border-[#262626] rounded-[6px] hover:bg-[#1a1a1a] hover:border-[#3f3f46] transition-colors"
              title="Refresh all (Tree, Versions, Outputs)"
              disabled={isRefreshing}
            >
              <RefreshCw
                className="w-[15px] h-[15px] text-zinc-500"
                style={{
                  transform: isRefreshing ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: isRefreshing ? 'transform 0.3s ease-in-out' : 'none'
                }}
              />
            </button>
          </div>
        </div>

        {/* Outputs Grid */}
        <div className="space-y-4">
          {Object.entries(groupedOutputs).map(([software, types]) => (
            <div data-output-overview key={software}>
              {/* Software Section Header - hide when only 1 software */}
              {Object.keys(groupedOutputs).length > 1 && (
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                  <SoftwareIcon name={software} className="w-4 h-4" />
                  {formatSoftwareName(software)}
                </div>
                <span className="px-2 py-0.5 bg-[#1e1e1e] rounded text-[11px] font-medium text-text-secondary">
                  {types.preview.length + types.final.length} outputs
                </span>
              </div>
              )}

            {/* Two Column Layout with Divider (Headers + Content) */}
            <div className="grid grid-cols-2 divide-x divide-card-bg bg-[#0f0f0f] rounded-lg">
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
                        className="w-full text-left px-3 py-3 rounded-lg bg-[#181818] hover:bg-[#1e1e1e] transition-colors group"
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
                          const isExpanded = expandedGroups.has(`preview:${group.path}`);
                          return (
                            <div key={group.path}>
                              {/* Group header */}
                              <button
                                onClick={() => toggleGroup(group.path, 'preview')}
                                onContextMenu={(e) => handleGroupContextMenu(e, group.path, 'preview')}
                                className="w-full text-left px-3 py-2 rounded bg-[#181818] hover:bg-[#1e1e1e] transition-colors flex items-center gap-2"
                              >
                                <ChevronDown
                                  className={`w-4 h-4 text-text-secondary transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                                />
                                <span className="text-sm text-text-secondary">{group.path} /</span>
                                <span className="text-xs text-text-muted ml-auto">({group.files.length})</span>
                              </button>

                              {/* Group files */}
                              <div
                                className={`overflow-hidden transition-[max-height] duration-200 ease-in-out ${isExpanded ? 'max-h-[2000px]' : 'max-h-0'
                                  }`}
                              >
                                <div className="pl-6 space-y-2 pt-2">
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
                        className="w-full text-left px-3 py-3 rounded-lg bg-[#181818] hover:bg-[#1e1e1e] transition-colors group"
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
                          const isExpanded = expandedGroups.has(`final:${group.path}`);
                          return (
                            <div key={group.path}>
                              {/* Group header */}
                              <button
                                onClick={() => toggleGroup(group.path, 'final')}
                                onContextMenu={(e) => handleGroupContextMenu(e, group.path, 'final')}
                                className="w-full text-left px-3 py-2 rounded bg-[#181818] hover:bg-[#1e1e1e] transition-colors flex items-center gap-2"
                              >
                                <ChevronDown
                                  className={`w-4 h-4 text-text-secondary transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                                />
                                <span className="text-sm text-text-secondary">{group.path} /</span>
                                <span className="text-xs text-text-muted ml-auto">({group.files.length})</span>
                              </button>

                              {/* Group files */}
                              <div
                                className={`overflow-hidden transition-[max-height] duration-200 ease-in-out ${isExpanded ? 'max-h-[2000px]' : 'max-h-0'
                                  }`}
                              >
                                <div className="pl-6 space-y-2 pt-2">
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
          <div className="py-4">
            <p className="text-xs text-text-muted text-center">No outputs match the selected filters.</p>
          </div>
        )}
      </div>

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
        {fileMenuData?.is_sequence && nullConverter && nullConverter.folder_items.length > 0 && (
          <>
            <ContextMenuDivider />
            <NullConverterMenuItem items={nullConverter.folder_items} exe={nullConverter.exe} input={fileMenuData.path} onClose={closeFileMenu} />
          </>
        )}
        {fileMenuData && !fileMenuData.is_sequence && nullConverter && nullConverter.file_items.length > 0 && (
          <>
            <ContextMenuDivider />
            <NullConverterMenuItem items={nullConverter.file_items} exe={nullConverter.exe} input={fileMenuData.path} onClose={closeFileMenu} />
          </>
        )}
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
        {groupMenuData && nullConverter && nullConverter.folder_items.length > 0 && (
          <>
            <ContextMenuDivider />
            <NullConverterMenuItem items={nullConverter.folder_items} exe={nullConverter.exe} input={groupMenuData.groupPath} onClose={closeGroupMenu} />
          </>
        )}
      </ContextMenu>
    </div>
  );
}
