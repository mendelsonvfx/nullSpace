import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { SoftwareIcon } from '../SoftwareIcon';
import type { SoftwareName } from '../../types/project';
import { Film, Eye, FolderOpen, Copy, ChevronDown } from 'lucide-react';
import { writeText } from '@tauri-apps/api/clipboard';
import { outputsCache } from '../../utils/outputsCache';

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
}

export function OutputOverview({ project, currentScene, currentShot }: OutputOverviewProps) {
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate unique cache key for project + scene + shot combination
  const getCacheKey = () => {
    const shotId = currentShot ? `_shot_${currentShot.number}` : '';
    const sceneId = currentScene ? `_scene_${currentScene.name}` : '';
    return `${project.path}${sceneId}${shotId}`;
  };

  // Initialize with empty values - will be set in useLayoutEffect before paint
  const [selectedSoftware, setSelectedSoftware] = useState<string>('');
  const [selectedOutputType, setSelectedOutputType] = useState<'preview' | 'final'>('preview');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; output: OutputFile } | null>(null);
  const [groupContextMenu, setGroupContextMenu] = useState<{ x: number; y: number; groupPath: string } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => outputsCache.getExpandedGroups(project.path));
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const groupContextMenuRef = useRef<HTMLDivElement>(null);
  const isFirstLoadRef = useRef(true);
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
  const updateSelectedSoftware = (software: string) => {
    setSelectedSoftware(software);
    outputsCache.setOutputState(getCacheKey(), software, selectedOutputType);
  };

  // Save selected output type and persist to cache
  const updateSelectedOutputType = (type: 'preview' | 'final') => {
    setSelectedOutputType(type);
    outputsCache.setOutputState(getCacheKey(), selectedSoftware, type);
  };

  // Get scene and shot filter for output scanning
  const getSceneFilter = (): string | null => {
    if (currentScene) {
      // Extract scene code from scene name
      // "Scene 001" → "SC_001", "Scene RIVER" → "SC_RIVER"
      const sceneSuffix = currentScene.name.replace(/^Scene\s+/i, '').trim();
      const sceneCode = sceneSuffix.toUpperCase().replace(/\s+/g, '_');
      return `SC_${sceneCode}`;
    }
    return null;
  };

  const getShotFilter = (): string | null => {
    if (currentShot) {
      if (currentShot.number === 0) {
        return 'SH000';
      }
      return `SH${String(currentShot.number).padStart(3, '0')}`;
    }
    return null;
  };

  const loadOutputs = async (forceReload = false) => {
    // Check cache first if not forcing reload
    if (!forceReload) {
      const cachedOutputs = outputsCache.get(project.path);
      if (cachedOutputs) {
        setOutputs(cachedOutputs);
        setLoading(false);
        isFirstLoadRef.current = false;
        return;
      }
    }

    // Only show loading state for first load
    const shouldShowLoading = isFirstLoadRef.current;
    if (shouldShowLoading) {
      setLoading(true);
      isFirstLoadRef.current = false;
    }

    setError(null);
    try {
      if (!project?.path) {
        throw new Error('Project path is not defined');
      }

      const sceneFilter = getSceneFilter();
      const shotFilter = getShotFilter();

      // Combine scene and shot filters for output scanning
      const combinedFilter = sceneFilter && shotFilter
        ? `${sceneFilter}_${shotFilter}`
        : sceneFilter || shotFilter;

      // Scan for output files in Render/Preview and Render/Final folders
      // Filter by scene/shot folder name if selected
      const result = await invoke<OutputFile[]>('get_project_outputs', {
        projectPath: project.path,
        shotFilter: combinedFilter
      });

      const outputsArray = Array.isArray(result) ? result : [];
      setOutputs(outputsArray);

      // Cache the results
      outputsCache.set(project.path, outputsArray);
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
  }, [project.path, currentShot]);

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
        outputsCache.invalidate(project.path);
        loadOutputs(true);
      }).then((fn) => {
        unlisten = fn;
      });
    });

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

    if (savedState) {
      // Restore saved state for this specific project/scene/shot
      setSelectedSoftware(savedState.selectedSoftware);
      setSelectedOutputType(savedState.selectedOutputType);
    } else {
      // No saved state - try to get from cached outputs
      const cachedOutputs = outputsCache.get(project.path);
      if (cachedOutputs && cachedOutputs.length > 0) {
        const availableSoft = Array.from(new Set(cachedOutputs.map(o => o.software))).sort();
        if (availableSoft.length > 0) {
          setSelectedSoftware(availableSoft[0]);
        } else {
          setSelectedSoftware('');
        }
      } else if (availableSoftware.length > 0) {
        // Use currently loaded outputs
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
  }, [project.path, currentScene?.name, currentShot?.number, availableSoftware]);

  // Validate selected software matches available outputs
  useEffect(() => {
    if (availableSoftware.length > 0) {
      const isValid = availableSoftware.includes(selectedSoftware);
      if (!selectedSoftware || !isValid) {
        isRestoringStateRef.current = true; // Mark as programmatic change
        const firstSoftware = availableSoftware[0];
        setSelectedSoftware(firstSoftware);
        outputsCache.setOutputState(getCacheKey(), firstSoftware as SoftwareName, selectedOutputType);
        setTimeout(() => {
          isRestoringStateRef.current = false;
        }, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSoftware, selectedSoftware, selectedOutputType]);

  // Filter outputs based on selected software and output type
  const filteredOutputs = useMemo(() => {
    const filtered = outputs.filter(output => {
      const matchesSoftware = output.software === selectedSoftware;
      const matchesType = output.render_type === selectedOutputType;
      return matchesSoftware && matchesType;
    });
    return filtered;
  }, [outputs, selectedSoftware, selectedOutputType]);

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
      const pathParts = parts.slice(startIndex + 1);

      // For sequences, include the folder name (last part)
      // For files, exclude the filename (last part)
      const relevantParts = isSequence ? pathParts : pathParts.slice(0, -1);

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
      const pathParts = parts.slice(startIndex + 1);
      return isSequence ? pathParts : pathParts.slice(0, -1);
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
  const toggleGroup = (groupPath: string) => {
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
  };

  // Smart grouping algorithm
  const groupOutputsByPath = (outputs: OutputFile[]) => {
    if (outputs.length === 0) return { grouped: [], ungrouped: [] };

    // Build a map of path prefixes to files
    const pathMap = new Map<string, OutputFile[]>();

    outputs.forEach(output => {
      const pathParts = getPathParts(output.path, output.is_sequence);

      // Try different grouping levels (from 1 to 5)
      if (pathParts.length === 0) {
        // No path parts, add to ungrouped
        const key = '__ungrouped__';
        if (!pathMap.has(key)) pathMap.set(key, []);
        pathMap.get(key)!.push(output);
      } else {
        // Try to find the optimal grouping level
        let added = false;
        for (let depth = Math.min(pathParts.length - 1, 5); depth >= 1; depth--) {
          const prefix = pathParts.slice(0, depth).join(' / ');
          if (!pathMap.has(prefix)) pathMap.set(prefix, []);
          pathMap.get(prefix)!.push(output);
          added = true;
          break;
        }

        if (!added) {
          // Single level or no grouping needed
          const key = '__ungrouped__';
          if (!pathMap.has(key)) pathMap.set(key, []);
          pathMap.get(key)!.push(output);
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
  };

  const handleOutputClick = async (output: OutputFile) => {
    try {
      await invoke('open_file', { filePath: output.path });
    } catch (error) {
      console.error('Failed to open output:', error);
    }
  };

  const handleRevealInExplorer = async (outputPath: string) => {
    try {
      await invoke('reveal_in_explorer', { path: outputPath });
      setContextMenu(null);
    } catch (error) {
      console.error('Failed to reveal in explorer:', error);
    }
  };

  const handleCopyPath = async (outputPath: string) => {
    try {
      await writeText(outputPath);
      setContextMenu(null);
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, output: OutputFile) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, output });
  };

  const handleGroupContextMenu = (e: React.MouseEvent, groupPath: string) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    e.stopPropagation();
    setGroupContextMenu({ x: e.clientX, y: e.clientY, groupPath });
  };

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

    const fallbackPath = `${project.path}\\Render\\${typeFolder}\\${relativePath}`;
    return fallbackPath;
  };

  const handleRevealGroupInExplorer = async (groupPath: string, renderType: 'preview' | 'final') => {
    try {
      const folderPath = getGroupFolderPath(groupPath, renderType);
      await invoke('reveal_in_explorer', { path: folderPath });
      setGroupContextMenu(null);
    } catch (error) {
      console.error('Failed to reveal group in explorer:', error);
    }
  };

  const handleCopyGroupPath = async (groupPath: string, renderType: 'preview' | 'final') => {
    try {
      const folderPath = getGroupFolderPath(groupPath, renderType);
      await writeText(folderPath);
      setGroupContextMenu(null);
    } catch (error) {
      console.error('Failed to copy group path:', error);
    }
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
      if (groupContextMenuRef.current && !groupContextMenuRef.current.contains(e.target as Node)) {
        setGroupContextMenu(null);
      }
    };

    if (contextMenu || groupContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu, groupContextMenu]);

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
        <h3 className="text-sm font-medium text-text-secondary mb-3">Output Overview</h3>
        <div data-output-overview className="bg-card-bg border border-border-primary rounded-med p-4">
          <p className="text-xs text-text-muted text-center">No outputs found. Outputs should be in Render/Preview or Render/Final folders.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-text-secondary mb-3">Output Overview</h3>

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        {/* Software Filter - only show if more than one software */}
        {availableSoftware.length > 1 && (
          <div className="flex gap-1 bg-zinc-800/50 border border-border-primary rounded-button p-1">
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
        )}

        {/* Output Type Filter */}
        <div className="flex gap-1 bg-zinc-800/50 border border-border-primary rounded-button p-1">
          <button
            onClick={() => updateSelectedOutputType('preview')}
            className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 ${
              !isRestoringStateRef.current ? 'transition-colors' : ''
            } ${
              selectedOutputType === 'preview'
                ? 'bg-zinc-700 text-white'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
          <button
            onClick={() => updateSelectedOutputType('final')}
            className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 ${
              !isRestoringStateRef.current ? 'transition-colors' : ''
            } ${
              selectedOutputType === 'final'
                ? 'bg-zinc-700 text-white'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            <Film className="w-3 h-3" />
            Final
          </button>
        </div>
      </div>

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

            {/* Output Types */}
            <div className="p-3 space-y-3">
              {/* Preview Outputs */}
              {selectedOutputType === 'preview' && types.preview.length > 0 && (() => {
                const { grouped, ungrouped } = groupOutputsByPath(types.preview);

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
                  <div>
                    <div className="flex items-center gap-2 mb-2 px-2">
                      <Eye className="w-3.5 h-3.5 text-text-secondary" />
                      <span className="text-xs font-medium text-text-secondary">Preview ({types.preview.length})</span>
                    </div>
                    <div className="space-y-2">
                      {/* Grouped files */}
                      {grouped.map(group => {
                        const isExpanded = expandedGroups.has(group.path);
                        return (
                          <div key={group.path} className="space-y-1">
                            {/* Group header */}
                            <button
                              onClick={() => toggleGroup(group.path)}
                              onContextMenu={(e) => handleGroupContextMenu(e, group.path)}
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
                  </div>
                );
              })()}

              {/* Final Outputs */}
              {selectedOutputType === 'final' && types.final.length > 0 && (() => {
                const { grouped, ungrouped } = groupOutputsByPath(types.final);

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
                  <div>
                    <div className="flex items-center gap-2 mb-2 px-2">
                      <Film className="w-3.5 h-3.5 text-text-secondary" />
                      <span className="text-xs font-medium text-text-secondary">Final ({types.final.length})</span>
                    </div>
                    <div className="space-y-2">
                      {/* Grouped files */}
                      {grouped.map(group => {
                        const isExpanded = expandedGroups.has(group.path);
                        return (
                          <div key={group.path} className="space-y-1">
                            {/* Group header */}
                            <button
                              onClick={() => toggleGroup(group.path)}
                              onContextMenu={(e) => handleGroupContextMenu(e, group.path)}
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
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
      </div>

      {filteredOutputs.length === 0 && (
        <div data-output-overview className="bg-card-bg border border-border-primary rounded-med p-4">
          <p className="text-xs text-text-muted text-center">No outputs match the selected filters.</p>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 z-50 min-w-[180px] animate-context-menu"
          style={{
            top: (() => {
              const menuHeight = contextMenuRef.current?.offsetHeight || 100;
              const windowHeight = window.innerHeight;
              const wouldOverflow = contextMenu.y + menuHeight > windowHeight;
              return wouldOverflow ? windowHeight - menuHeight - 10 : contextMenu.y;
            })(),
            left: (() => {
              const menuWidth = contextMenuRef.current?.offsetWidth || 180;
              const windowWidth = window.innerWidth;
              const wouldOverflow = contextMenu.x + menuWidth > windowWidth;
              return wouldOverflow ? windowWidth - menuWidth - 10 : contextMenu.x;
            })()
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleRevealInExplorer(contextMenu.output.path)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2 text-text-primary"
          >
            <FolderOpen className="w-4 h-4" />
            Reveal in Explorer
          </button>
          <button
            onClick={() => handleCopyPath(contextMenu.output.path)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2 text-text-primary"
          >
            <Copy className="w-4 h-4" />
            Copy Path
          </button>
        </div>
      )}

      {/* Group Context Menu */}
      {groupContextMenu && (
        <div
          ref={groupContextMenuRef}
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 z-50 min-w-[180px] animate-context-menu"
          style={{
            top: (() => {
              const menuHeight = groupContextMenuRef.current?.offsetHeight || 100;
              const windowHeight = window.innerHeight;
              const wouldOverflow = groupContextMenu.y + menuHeight > windowHeight;
              return wouldOverflow ? windowHeight - menuHeight - 10 : groupContextMenu.y;
            })(),
            left: (() => {
              const menuWidth = groupContextMenuRef.current?.offsetWidth || 180;
              const windowWidth = window.innerWidth;
              const wouldOverflow = groupContextMenu.x + menuWidth > windowWidth;
              return wouldOverflow ? windowWidth - menuWidth - 10 : groupContextMenu.x;
            })()
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleRevealGroupInExplorer(groupContextMenu.groupPath, selectedOutputType)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2 text-text-primary"
          >
            <FolderOpen className="w-4 h-4" />
            Reveal in Explorer
          </button>
          <button
            onClick={() => handleCopyGroupPath(groupContextMenu.groupPath, selectedOutputType)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2 text-text-primary"
          >
            <Copy className="w-4 h-4" />
            Copy Path
          </button>
        </div>
      )}
    </div>
  );
}
