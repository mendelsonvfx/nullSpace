import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { SoftwareIcon } from '../SoftwareIcon';
import { versionsCache } from '../../utils/versionsCache';
import { versionMarksCache, type MarkColor } from '../../utils/versionMarksCache';
import { useTimeTrackingStore } from '../../features/time-tracking/stores/timeTrackingStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { FolderOpen, Copy, RefreshCw, Check } from 'lucide-react';
import { writeText } from '@tauri-apps/api/clipboard';
import type { SoftwareName } from '../../types/project';
import { getScenePattern, getShotPattern, parseFileName, hasSuffix } from '../../utils/fileNaming';
import { useBlendThumbnail } from '../../hooks/useBlendThumbnail';
import { usePsdThumbnail } from '../../hooks/usePsdThumbnail';
import { ContextMenu, ContextMenuItem, ContextMenuDivider, ContextMenuColorPicker, VERSION_MARK_COLORS } from '../ui/ContextMenu';
import { useContextMenu } from '../../hooks/useContextMenu';

interface ProjectVersion {
  name: string;
  path: string;
  software: string[];
  created_at: number;  // Unix timestamp in seconds
  modified_at: number; // Unix timestamp in seconds
  is_versioned: boolean; // true if file has _v### pattern
}

interface VersionsOverviewProps {
  project: any;
  currentScene: any;
  currentShot: any;
  specialContextType?: 'asset' | 'compose' | null;
  showNotification: (type: 'success' | 'error' | 'warning' | 'info', message: string, title?: string, duration?: number) => void;
}

export const VersionsOverview = memo(function VersionsOverview({ project, currentScene, currentShot, specialContextType, showNotification }: VersionsOverviewProps) {
  const [allVersions, setAllVersions] = useState<ProjectVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSoftware, setSelectedSoftware] = useState<string>('all');
  const [showOnlyUnversioned, setShowOnlyUnversioned] = useState(false);
  const [showShotSubmenu, setShowShotSubmenu] = useState(false);
  const [submenuAction, setSubmenuAction] = useState<'move' | 'copy' | null>(null);
  const [activeSceneSubmenu, setActiveSceneSubmenu] = useState<string | null>(null);
  const [activeSceneTop, setActiveSceneTop] = useState<number>(0);
  const [lastActionResult, setLastActionResult] = useState<'copied' | 'moved' | null>(null);
  const actionResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [versionMarks, setVersionMarks] = useState<Record<string, MarkColor>>({});
  const [blendPreviewsEnabled, setBlendPreviewsEnabled] = useState(() => {
    const saved = localStorage.getItem('blendPreviewsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingTimerRef = useRef<number | null>(null);
  const isFirstLoadRef = useRef(true);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const shotSubmenuRef = useRef<HTMLDivElement>(null);
  const submenuCloseTimeoutRef = useRef<number | null>(null);
  const skipFilterSaveRef = useRef(false);
  // Access startSession via getState() to avoid subscribing to store updates (timer ticks every second)
  const { activeMenu, setActiveMenu } = useContextMenuStore();

  // Context menu using centralized hook
  const { isOpen: isContextMenuOpen, position: contextMenuPosition, data: contextMenuVersion, openMenu: openContextMenu, closeMenu: closeContextMenuHook } = useContextMenu<ProjectVersion>();

  const loadVersions = async (skipCleanup = false, forceReload = false) => {
    // Clear any existing timer first
    if (loadingTimerRef.current !== null) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }

    // Check cache first if not forcing reload
    if (!forceReload) {
      const cachedVersions = versionsCache.get(project.path);
      if (cachedVersions) {
        console.log('Using cached versions:', cachedVersions.length);
        setAllVersions(cachedVersions);
        setLoading(false);
        isFirstLoadRef.current = false;
        return;
      }
    }

    // Only show loading state for first load or after 200ms delay
    const shouldShowLoading = isFirstLoadRef.current;
    if (shouldShowLoading) {
      setLoading(true);
      isFirstLoadRef.current = false;
    } else {
      // Set a delayed loading state to prevent flickering on updates
      loadingTimerRef.current = window.setTimeout(() => {
        setLoading(true);
        loadingTimerRef.current = null;
      }, 200);
    }

    const autoDelete = localStorage.getItem('autoDeleteBlend1Backups') === 'true';
    try {
      // Clean up backup files only if not skipped and setting is enabled
      if (!skipCleanup && autoDelete) {
        await invoke<number>('cleanup_backup_files', {
          projectPath: project.path
        });
      }

      const result = await invoke<ProjectVersion[]>('get_project_versions', {
        projectPath: project.path
      });
      console.log('Loaded versions:', result);

      // Clear the loading timer if it hasn't fired yet
      if (loadingTimerRef.current !== null) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }

      // Update data and cache it
      setAllVersions(result);
      versionsCache.set(project.path, result);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load versions:', error);
      // Clear the loading timer on error
      if (loadingTimerRef.current !== null) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      setLoading(false);
    }
  };

  // Load all versions and start watcher when project changes
  useEffect(() => {
    // Reset context menu when project changes
    closeContextMenuHook();
    setShowShotSubmenu(false);
    setSubmenuAction(null);

    loadVersions();

    // ✅ RE-ENABLED: File watcher now has proper shutdown mechanism
    // Start watching the project directory
    const autoDeleteWatcher = localStorage.getItem('autoDeleteBlend1Backups') === 'true';
    invoke('start_watching_project', {
      projectPath: project.path,
      autoDeleteBackups: autoDeleteWatcher
    }).catch((err) => {
      console.error('Failed to start watching project:', err);
    });

    // Cleanup watcher on unmount
    return () => {
      invoke('stop_watching_project').catch((err) => {
        console.error('Failed to stop watching project:', err);
      });
    };
  }, [project.path]);

  useEffect(() => {
    return () => {
      if (actionResultTimeoutRef.current) clearTimeout(actionResultTimeoutRef.current);
    };
  }, []);

  // Load version marks when project changes
  useEffect(() => {
    const marks = versionMarksCache.getProjectMarks(project.path);
    setVersionMarks(marks);
  }, [project.path]);

  // Restore filter state when project changes
  useEffect(() => {
    skipFilterSaveRef.current = true;
    const saved = versionsCache.getFilter(project.path);
    if (saved) {
      setSelectedSoftware(saved.selectedSoftware);
      setShowOnlyUnversioned(saved.showOnlyUnversioned);
    } else {
      setSelectedSoftware('all');
      setShowOnlyUnversioned(false);
    }
  }, [project.path]);

  // Persist filter state on change (skip during restore to avoid race condition)
  useEffect(() => {
    if (skipFilterSaveRef.current) {
      skipFilterSaveRef.current = false;
      return;
    }
    versionsCache.setFilter(project.path, { selectedSoftware, showOnlyUnversioned });
  }, [selectedSoftware, showOnlyUnversioned, project.path]);

  // Listen for blend previews setting changes
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('blendPreviewsEnabled');
      if (saved !== null) {
        setBlendPreviewsEnabled(JSON.parse(saved));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Listen for version changes from file system watcher
  // ✅ RE-ENABLED: File watcher now works properly
  useEffect(() => {
    let unlisten: any;

    listen('version-changed', () => {
      console.log('Version changed detected by file watcher');
      // Invalidate cache and reload
      versionsCache.invalidate(project.path);
      // Skip cleanup since watcher already did it, force reload
      loadVersions(true, true);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [project.path]);

  // Listen for version updates from launch_software
  useEffect(() => {
    const handleVersionUpdate = (event: any) => {
      // Check if this event is for the current project
      const eventProjectPath = event.detail?.projectPath;

      // If no projectPath in event (backward compatibility) or matches current project
      if (!eventProjectPath || eventProjectPath === project.path) {
        console.log('Version update event received from launch for project:', project.path);
        // Invalidate cache and reload
        versionsCache.invalidate(project.path);
        loadVersions(false, true);
      }
    };

    const handleRefreshAll = () => {
      console.log('Refresh all event received - reloading versions');
      versionsCache.invalidate(project.path);
      loadVersions(false, true);
    };

    window.addEventListener('version-created', handleVersionUpdate);
    window.addEventListener('refresh-all', handleRefreshAll);
    return () => {
      window.removeEventListener('version-created', handleVersionUpdate);
      window.removeEventListener('refresh-all', handleRefreshAll);
    };
  }, [project.path]);

  // Close menu when another menu opens
  useEffect(() => {
    if (activeMenu && activeMenu !== 'version-context-menu' && isContextMenuOpen) {
      closeContextMenuHook();
      setShowShotSubmenu(false);
      setSubmenuAction(null);
    }
  }, [activeMenu, isContextMenuOpen, closeContextMenuHook]);

  // Extract version number from filename (e.g., "file_v001.blend" → 1)
  const extractVersionNumber = (filename: string): number => {
    const match = filename.match(/_v(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  };

  // Filter versions by scene and shot, then sort: versioned files first (by version number), then non-versioned files (by date)
  const versions = useMemo(() => {
    let filtered = allVersions;

    // Check if we're in special context mode (mutually exclusive with regular scene/shot filtering)
    if (specialContextType) {
      // Map context type to file suffix: 'asset' -> 'ASSET', 'compose' -> 'COMP'
      const contextSuffixMap = {
        'asset': 'ASSET',
        'compose': 'COMP'
      } as const;
      const expectedSuffix = contextSuffixMap[specialContextType];

      filtered = filtered.filter(v => {
        const parsed = parseFileName(v.name);

        // Check if file has the special context suffix
        if (parsed?.specialContext !== expectedSuffix) {
          return false;
        }

        // If special context is tied to a scene, also filter by scene
        if (currentScene) {
          const scenePrefix = getScenePattern(project.name, currentScene.name);
          if (!v.name.startsWith(scenePrefix)) {
            return false;
          }
        }

        return true;
      });
    } else {
      // Regular scene/shot filtering (only when NOT in special context)

      // Filter by scene if selected
      if (currentScene) {
        filtered = filtered.filter(v => {
          // Use file naming utility to get scene pattern: PROJECT_SCENE_
          const scenePrefix = getScenePattern(project.name, currentScene.name);

          // Include file if it starts with the scene prefix (more precise than includes)
          return v.name.startsWith(scenePrefix);
        });
      }

      // Filter by shot if selected
      if (currentShot) {
        filtered = filtered.filter(v => {
          // Use file naming utility to get shot pattern: PROJECT_SCENE_SHOT_
          const shotPrefix = getShotPattern(project.name, currentScene?.name || '', currentShot.number);

          // Include file if it starts with the shot prefix (more precise than includes)
          return v.name.startsWith(shotPrefix);
        });
      }
    }

    // Sort: versioned files first (by version number DESC - newest to oldest), then non-versioned files (by date desc)
    const sorted = [...filtered].sort((a, b) => {
      // First, sort by versioned status (versioned files first)
      if (a.is_versioned !== b.is_versioned) {
        return a.is_versioned ? -1 : 1;
      }

      // For versioned files, sort by version number (highest first)
      if (a.is_versioned && b.is_versioned) {
        const versionA = extractVersionNumber(a.name);
        const versionB = extractVersionNumber(b.name);
        return versionB - versionA; // Descending order: v003, v002, v001
      }

      // For non-versioned files, sort by creation date (newest first)
      return b.created_at - a.created_at;
    });

    return sorted;
  }, [allVersions, currentScene, currentShot, specialContextType, project.name]);

  // Reset selectedSoftware if it's not available in current context (e.g., after switching projects)
  useEffect(() => {
    // Skip if "all" is selected - always valid
    if (selectedSoftware === 'all') return;

    // Skip if showing only unversioned - software filter not active
    if (showOnlyUnversioned) return;

    // Get unique software from versions (already filtered by scene/shot)
    const availableSoftware = Array.from(new Set(versions.flatMap(v => v.software)));

    // If selected software is not available, reset to 'all'
    if (availableSoftware.length > 0 && !availableSoftware.includes(selectedSoftware)) {
      setSelectedSoftware('all');
    }
  }, [versions, selectedSoftware, showOnlyUnversioned]);

  // Group shots by scenes for nested menu
  const shotsByScene = useMemo(() => {
    if (!project.shots || !project.scenes) return {};

    // Exclude only the exact current shot by ID (not all shots with same number)
    const currentShotId = currentShot?.id || null;

    // Group shots by scene_id
    const grouped: Record<string, { scene: any; shots: any[] }> = {};

    project.shots.forEach((shot: any) => {
      // Exclude current shot by ID
      if (shot.id === currentShotId) return;

      const sceneId = shot.sceneId;
      if (!grouped[sceneId]) {
        const scene = project.scenes.find((s: any) => s.id === sceneId);
        if (scene) {
          grouped[sceneId] = { scene, shots: [] };
        }
      }
      if (grouped[sceneId]) {
        grouped[sceneId].shots.push(shot);
      }
    });

    // Sort scenes alphabetically
    const sorted = Object.entries(grouped).sort(([, a], [, b]) =>
      a.scene.name.localeCompare(b.scene.name)
    );

    // Sort shots within each scene by number
    sorted.forEach(([, group]) => {
      group.shots.sort((a, b) => a.number - b.number);
    });

    return Object.fromEntries(sorted);
  }, [project.shots, project.scenes, currentShot]);

  const handleVersionDoubleClick = async (versionPath: string, softwareList: string[]) => {
    try {
      // Determine which software to use (prefer first in list)
      const softwareName = softwareList.length > 0 ? softwareList[0] : 'Blender';

      // Get software info from project
      const softwareInfo = project.software?.find((s: any) => s.name === softwareName);
      if (!softwareInfo) {
        // Fallback to just opening the file without tracking
        await invoke('open_file', { filePath: versionPath });
        return;
      }

      // Get executable path from project or fallback to global settings
      let executablePath = softwareInfo.path || softwareInfo.executable_path || softwareInfo.executablePath;

      // If still empty, try to get from global localStorage settings
      if (!executablePath) {
        const savedPaths = localStorage.getItem('softwarePaths');
        if (savedPaths) {
          const paths = JSON.parse(savedPaths);
          const softwareKey = softwareName.toLowerCase().replace(/\s+/g, '-');
          executablePath = paths[softwareKey];
        }
      }

      if (!executablePath) {
        // Show notification that path is not set
        showNotification('warning', `Path not set for ${softwareName}. Please configure it in Settings.`);
        return;
      }

      // Launch file with time tracking
      const result = await invoke<{ file_name: string; pid: number }>('open_file_with_tracking', {
        filePath: versionPath,
        executablePath: executablePath
      });

      // Convert software name to SoftwareName key
      const nameToKey: Record<string, SoftwareName> = {
        'Blender': 'blender',
        'Houdini': 'houdini',
        'Maya': 'maya',
        'Cinema 4D': 'cinema4d',
        'Substance Painter': 'substance',
        'Substance Designer': 'substance',
        'ZBrush': 'zbrush',
        'After Effects': 'after-effects',
        'Unreal Engine': 'unreal',
        'Unity': 'unity',
        'Marmoset': 'marmoset',
        'Photoshop': 'photoshop'
      };

      const softwareKey = nameToKey[softwareName] || 'blender';

      // Start time tracking
      await useTimeTrackingStore.getState().startSession({
        projectId: project.id,
        projectPath: project.path,
        software: softwareKey,
        pid: result.pid,
        shotId: currentShot?.id
      });
    } catch (error) {
      console.error('Failed to open version:', error);
    }
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [versions]);

  const handleContextMenu = (e: React.MouseEvent, version: ProjectVersion) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    e.stopPropagation();

    if (actionResultTimeoutRef.current) {
      clearTimeout(actionResultTimeoutRef.current);
      actionResultTimeoutRef.current = null;
    }
    setLastActionResult(null);
    openContextMenu(e, version);
    setShowShotSubmenu(false);
    setSubmenuAction(null);
    setActiveMenu('version-context-menu');
  };

  const handleRevealInExplorer = async (versionPath: string) => {
    try {
      await invoke('reveal_in_explorer', { path: versionPath });
      closeContextMenuHook();
      setShowShotSubmenu(false);
      setSubmenuAction(null);
      setActiveMenu(null);
    } catch (error) {
      console.error('Failed to reveal in explorer:', error);
    }
  };

  const handleCopyPath = async (versionPath: string) => {
    try {
      await writeText(versionPath);
      closeContextMenuHook();
      setShowShotSubmenu(false);
      setSubmenuAction(null);
      setActiveMenu(null);
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  };

  const handleMoveToShot = async (shotId: string) => {
    if (!contextMenuVersion) return;

    try {
      await invoke('move_version_to_shot', {
        versionPath: contextMenuVersion.path,
        projectPath: project.path,
        targetShotId: shotId
      });

      // Reload versions after moving
      versionsCache.invalidate(project.path);
      await loadVersions(false, true);

      setShowShotSubmenu(false);
      setActiveSceneSubmenu(null);
      setSubmenuAction(null);
      setLastActionResult('moved');
      actionResultTimeoutRef.current = setTimeout(() => {
        closeContextMenuHook();
        setActiveMenu(null);
        setLastActionResult(null);
        actionResultTimeoutRef.current = null;
      }, 700);
    } catch (error) {
      console.error('Failed to move version to shot:', error);
      showNotification('error', `Failed to move version: ${error}`);
    }
  };

  const handleCopyToShot = async (shotId: string) => {
    if (!contextMenuVersion) return;

    try {
      await invoke('copy_version_to_shot', {
        versionPath: contextMenuVersion.path,
        projectPath: project.path,
        targetShotId: shotId
      });

      // Reload versions after copying
      versionsCache.invalidate(project.path);
      await loadVersions(false, true);

      setShowShotSubmenu(false);
      setActiveSceneSubmenu(null);
      setSubmenuAction(null);
      setLastActionResult('copied');
      actionResultTimeoutRef.current = setTimeout(() => {
        closeContextMenuHook();
        setActiveMenu(null);
        setLastActionResult(null);
        actionResultTimeoutRef.current = null;
      }, 700);
    } catch (error) {
      console.error('Failed to copy version to shot:', error);
      showNotification('error', `Failed to copy version: ${error}`);
    }
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);

    // Invalidate all caches and trigger reload
    versionsCache.invalidate(project.path);
    await loadVersions(false, true);

    // Trigger global refresh event for TreeView and OutputOverview
    window.dispatchEvent(new CustomEvent('refresh-all'));

    // Stop animation after rotation completes (300ms)
    setTimeout(() => setIsRefreshing(false), 300);
  };

  const handleSetMark = (versionPath: string, color: MarkColor) => {
    versionMarksCache.setMark(project.path, versionPath, color);
    setVersionMarks(prev => {
      const updated = { ...prev };
      if (color === null) {
        delete updated[versionPath];
      } else {
        updated[versionPath] = color;
      }
      return updated;
    });
    closeContextMenuHook();
    setShowShotSubmenu(false);
    setSubmenuAction(null);
    setActiveMenu(null);
  };

  // Only show loading spinner if there's no data yet
  if (loading && versions.length === 0) {
    return (
      <div className="mb-6">
        <div className="bg-card-bg border border-border-primary rounded-card p-4">
          {/* Header */}
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-text-secondary">Versions Overview</span>
            <div className="flex items-center gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-[90px] h-8 bg-[#1a1a1a] border border-[#262626] rounded-[6px]" />
              ))}
              <div className="w-8 h-8 bg-[#1a1a1a] border border-[#262626] rounded-[6px]" />
            </div>
          </div>
          {/* Skeleton version cards */}
          <div className="grid grid-cols-4 gap-3.5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="aspect-square bg-[#0f0f0f] border border-border-primary rounded-[10px] p-3.5 flex flex-col gap-3">
                <div className="flex-1 bg-[#1a1a1a] rounded-[6px]" />
                <div className="w-[60%] h-3.5 bg-[#1a1a1a] rounded mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Only show "no versions" if not loading and truly no data
  if (!loading && versions.length === 0) {
    return (
      <div className="mb-6">
        <div data-versions-overview className="bg-card-bg border border-border-primary rounded-card p-4">
          {/* Header */}
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-text-secondary">Versions Overview</span>
            <button
              onClick={handleRefreshAll}
              className="w-7 h-7 flex items-center justify-center border border-[#262626] rounded-[6px] hover:bg-[#1a1a1a] hover:border-[#3f3f46] transition-colors"
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
            <p className="text-xs text-text-muted text-center py-4">No versions found</p>
          </div>
        </div>
      </div>
    );
  }

  // Remove file extension from version name
  const getVersionNameWithoutExtension = (fullName: string) => {
    return fullName.replace(/\.[^/.]+$/, '');
  };

  // Extract only version number from full name (remove project name and shot info)
  // For assets with custom name, show "ASSETNAME v001" format
  const getVersionDisplayName = (fullName: string) => {
    const parsed = parseFileName(fullName);
    if (parsed) {
      const versionStr = `v${parsed.version.toString().padStart(3, '0')}`;

      // Show suffix if present (e.g., "v001 TESTEXPORT")
      if (parsed.suffix) {
        return `${versionStr} ${parsed.suffix}`;
      }

      // Show asset/comp name if present (e.g., "CAR v001" instead of just "v001")
      if (parsed.assetName) {
        return `${parsed.assetName} ${versionStr}`;
      }
      return versionStr;
    }
    // Fallback to regex extraction
    const nameWithoutExt = getVersionNameWithoutExtension(fullName);
    // Match version with optional suffix: _v001 or _v001_TEST
    const versionMatch = nameWithoutExt.match(/_v(\d+)(?:[\s_](.+))?$/i);
    if (versionMatch) {
      const versionStr = `v${versionMatch[1]}`;
      // Include suffix if present
      if (versionMatch[2]) {
        return `${versionStr} ${versionMatch[2]}`;
      }
      return versionStr;
    }
    return nameWithoutExt;
  };

  // Get unique software list and sort alphabetically
  const uniqueSoftware = Array.from(
    new Set(versions.flatMap((v) => v.software))
  ).sort();

  // Filter versions by selected software and versioned status
  const filteredVersions = versions
    .filter((v) => {
      // Filter by software
      if (selectedSoftware !== 'all' && !v.software.includes(selectedSoftware)) {
        return false;
      }
      // Filter by versioned status: show files with suffix OR unversioned files
      if (showOnlyUnversioned) {
        const fileSuffix = hasSuffix(v.name);
        if (!fileSuffix && v.is_versioned) {
          return false;
        }
      }
      return true;
    });

  // Format timestamp to readable date/time
  const formatDateTime = (timestamp: number) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Version Card Component with optional Blender thumbnail
  const VersionCard = ({ version, isBlendFile, isPsdFile, versionMark, onDoubleClick, onContextMenu }: {
    version: ProjectVersion;
    isBlendFile: boolean;
    isPsdFile: boolean;
    versionMark?: MarkColor;
    onDoubleClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
  }) => {
    const willShowBlendThumb = isBlendFile && blendPreviewsEnabled;
    const willShowPsdThumb   = isPsdFile  && blendPreviewsEnabled;
    const willShowThumbnail  = willShowBlendThumb || willShowPsdThumb;

    const blendThumbnail  = useBlendThumbnail(willShowBlendThumb ? version.path : undefined);
    const psdThumbnail    = usePsdThumbnail(willShowPsdThumb ? version.path : undefined);
    const thumbnail       = blendThumbnail || psdThumbnail;
    const softwareForIcon = isBlendFile ? 'Blender' : 'Photoshop';

    // Build tooltip with file dates
    const tooltip = `${version.name}\nCreated: ${formatDateTime(version.created_at)}\nModified: ${formatDateTime(version.modified_at)}`;

    return (
      <div
        className={`relative flex flex-col flex-shrink-0 ${willShowThumbnail ? 'w-36' : 'w-32'} cursor-pointer hover:bg-hover-bg rounded-lg p-2 transition-colors select-none`}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        title={tooltip}
      >
        {/* Color mark indicator */}
        {versionMark && (
          <div
            className={`absolute ${willShowThumbnail ? 'top-1 right-1' : 'top-1'} w-1.5 h-1.5 rounded-full ${versionMark === 'red' ? 'bg-red-500' :
              versionMark === 'green' ? 'bg-green-500' :
                'bg-blue-500'
              }`}
            style={willShowThumbnail ? undefined : { right: '40px' }}
            title={`Marked as ${versionMark}`}
          />
        )}

        {/* Thumbnail preview area (fixed size) or software icons */}
        {willShowThumbnail ? (
          <div className="mb-2 rounded overflow-hidden bg-zinc-800 border border-border-primary relative h-16">
            {thumbnail && (
              <img
                src={thumbnail}
                alt="Preview"
                className="w-full h-full object-cover"
                draggable={false}
              />
            )}
            {/* Software icon overlay in bottom-right corner */}
            <div className="absolute bottom-1 right-1 w-5 h-5">
              <SoftwareIcon name={softwareForIcon} />
            </div>
          </div>
        ) : (
          /* Software icons (when no thumbnail) */
          <div className="flex gap-1 mb-2 justify-center items-center flex-wrap flex-1">
            {version.software.length > 0 ? (
              version.software.map((sw) => (
                <div key={sw} className="w-5 h-5">
                  <SoftwareIcon name={sw} />
                </div>
              ))
            ) : (
              <div className="w-5 h-5 bg-zinc-700 rounded" />
            )}
          </div>
        )}

        {/* Version name without extension */}
        <div className="text-xs text-center font-medium truncate" title={version.name}>
          {getVersionDisplayName(version.name)}
        </div>
      </div>
    );
  };

  return (
    <div className="mb-6 overflow-hidden">
      <div data-versions-overview className="bg-card-bg border border-border-primary rounded-card p-4 transition-[border-color] duration-200 hover:border-[#262626]">
        {/* Module Header */}
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-medium text-text-secondary">Versions Overview</span>
          <div className="flex items-center gap-3">
            {/* Software Tabs */}
            {uniqueSoftware.length > 0 && (
              <>
                {uniqueSoftware.length > 1 && uniqueSoftware.map((software) => (
                  <button
                    key={software}
                    onClick={() => {
                      setSelectedSoftware(software);
                      setShowOnlyUnversioned(false);
                    }}
                    className={`px-2.5 py-[5px] rounded-[6px] text-[11px] font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 border ${selectedSoftware === software && !showOnlyUnversioned
                      ? 'bg-[#1a1a1a] border-[#3f3f46] text-text-primary'
                      : 'border-[#262626] text-zinc-500 hover:bg-[#1a1a1a] hover:border-[#3f3f46]'
                      }`}
                  >
                    <SoftwareIcon name={software} className="w-3.5 h-3.5" />
                    {software}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setSelectedSoftware('all');
                    setShowOnlyUnversioned(false);
                  }}
                  className={`px-2.5 py-[5px] rounded-[6px] text-[11px] font-medium transition-colors whitespace-nowrap border ${selectedSoftware === 'all' && !showOnlyUnversioned
                    ? 'bg-[#1a1a1a] border-[#3f3f46] text-text-primary'
                    : 'border-[#262626] text-zinc-500 hover:bg-[#1a1a1a] hover:border-[#3f3f46]'
                    }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setShowOnlyUnversioned(!showOnlyUnversioned);
                    setSelectedSoftware('all');
                  }}
                  className={`px-2.5 py-[5px] rounded-[6px] text-[11px] font-medium transition-colors whitespace-nowrap border ${showOnlyUnversioned
                    ? 'bg-[#1a1a1a] border-[#3f3f46] text-text-primary'
                    : 'border-[#262626] text-zinc-500 hover:bg-[#1a1a1a] hover:border-[#3f3f46]'
                    }`}
                >
                  Other
                </button>
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
              </>
            )}
          </div>
        </div>

        {/* Version Cards */}
        <div
          ref={scrollContainerRef}
          className="versions-scroll-container overflow-x-auto bg-[#0f0f0f] rounded-lg p-4">
          {filteredVersions.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-8">No versions found for {selectedSoftware}</p>
          ) : (
            <div className="flex gap-3 w-max">
              {filteredVersions.map((version) => {
                const isBlendFile = version.software.includes('Blender');
                const isPsdFile   = version.software.includes('Photoshop');
                return (
                  <VersionCard
                    key={version.path}
                    version={version}
                    isBlendFile={isBlendFile}
                    isPsdFile={isPsdFile}
                    versionMark={versionMarks[version.path]}
                    onDoubleClick={() => handleVersionDoubleClick(version.path, version.software)}
                    onContextMenu={(e) => handleContextMenu(e, version)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Context Menu */}
      <ContextMenu
        ref={contextMenuRef}
        isOpen={isContextMenuOpen}
        position={contextMenuPosition}
        onClose={() => {
          closeContextMenuHook();
          setShowShotSubmenu(false);
          setSubmenuAction(null);
          setActiveMenu(null);
        }}
        menuId="version-context-menu"
      >
        <div>
          <ContextMenuItem
            icon={<FolderOpen className="w-4 h-4" />}
            onClick={() => contextMenuVersion && handleRevealInExplorer(contextMenuVersion.path)}
          >
            Reveal in Explorer
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Copy className="w-4 h-4" />}
            onClick={() => contextMenuVersion && handleCopyPath(contextMenuVersion.path)}
          >
            Copy Path
          </ContextMenuItem>

          {/* Mark Color Section */}
          <ContextMenuDivider />
          <ContextMenuColorPicker
            colors={VERSION_MARK_COLORS}
            selectedColor={contextMenuVersion ? versionMarks[contextMenuVersion.path] : null}
            onSelect={(color) => contextMenuVersion && handleSetMark(contextMenuVersion.path, color as MarkColor)}
            onClear={() => contextMenuVersion && handleSetMark(contextMenuVersion.path, null)}
          />

          {/* Show shot menu only for versioned files and if shots exist */}
          {contextMenuVersion?.is_versioned && project.shots && project.shots.length > 0 && (
            <>
              <ContextMenuDivider />
              <div
                className="relative"
                onMouseEnter={() => {
                  if (submenuCloseTimeoutRef.current) {
                    clearTimeout(submenuCloseTimeoutRef.current);
                    submenuCloseTimeoutRef.current = null;
                  }
                  setShowShotSubmenu(true);
                  setSubmenuAction('move');
                }}
                onMouseLeave={() => {
                  submenuCloseTimeoutRef.current = window.setTimeout(() => {
                    setShowShotSubmenu(false);
                    setActiveSceneSubmenu(null);
                  }, 300);
                }}
              >
                <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover-bg rounded-md flex items-center justify-between text-text-primary transition-colors">
                  {lastActionResult === 'moved' ? <span className="flex items-center gap-1.5 text-green-500"><Check size={14} />Moved</span> : <span>Move to shot...</span>}
                  <span className="text-text-muted">›</span>
                </button>
                {/* Shot Submenu - Level 1: Scenes (for Move) */}
                {showShotSubmenu && submenuAction === 'move' && (
                  <div
                    ref={shotSubmenuRef}
                    className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 bg-card-bg border border-border-secondary rounded-xl shadow-2xl p-1.5 min-w-[140px] max-w-[160px] z-[101]"
                    onMouseEnter={() => {
                      if (submenuCloseTimeoutRef.current) {
                        clearTimeout(submenuCloseTimeoutRef.current);
                        submenuCloseTimeoutRef.current = null;
                      }
                    }}
                  >
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {Object.entries(shotsByScene).length === 0 ? (
                        <div className="px-4 py-2 text-xs text-text-muted">No shots available</div>
                      ) : (
                        Object.entries(shotsByScene).map(([sceneId, { scene }]) => (
                          <div key={sceneId} className="relative">
                            <button
                              data-scene-id={sceneId}
                              className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover-bg rounded-md flex items-center justify-between text-text-primary transition-colors"
                              onMouseEnter={(e) => {
                                if (submenuCloseTimeoutRef.current) {
                                  clearTimeout(submenuCloseTimeoutRef.current);
                                  submenuCloseTimeoutRef.current = null;
                                }
                                setActiveSceneSubmenu(sceneId);
                                const button = e.currentTarget;
                                const container = shotSubmenuRef.current;
                                if (button && container) {
                                  const buttonRect = button.getBoundingClientRect();
                                  const containerRect = container.getBoundingClientRect();
                                  setActiveSceneTop(buttonRect.top - containerRect.top);
                                }
                              }}
                              onMouseLeave={() => {
                                submenuCloseTimeoutRef.current = window.setTimeout(() => {
                                  setActiveSceneSubmenu(null);
                                }, 300);
                              }}
                            >
                              <span className="truncate">{scene.name}</span>
                              <span className="text-text-muted ml-2">›</span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    {/* Shot Submenu - Level 2: Shots in Scene (rendered outside scroll container) */}
                    {activeSceneSubmenu && shotsByScene[activeSceneSubmenu] && (
                      <div
                        className="absolute left-full -ml-1 pl-2 z-[102]"
                        style={{ top: `${activeSceneTop}px` }}
                        onMouseEnter={() => {
                          if (submenuCloseTimeoutRef.current) {
                            clearTimeout(submenuCloseTimeoutRef.current);
                            submenuCloseTimeoutRef.current = null;
                          }
                        }}
                        onMouseLeave={() => {
                          submenuCloseTimeoutRef.current = window.setTimeout(() => {
                            setShowShotSubmenu(false);
                            setActiveSceneSubmenu(null);
                          }, 300);
                        }}
                      >
                        <div
                          className="bg-card-bg border border-border-secondary rounded-xl shadow-2xl p-1.5 min-w-[140px] max-w-[160px]"
                          style={{ maxHeight: '300px', overflowY: 'hidden' }}
                        >
                          {shotsByScene[activeSceneSubmenu].shots.map((shot: any) => (
                            <button
                              key={shot.id}
                              className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover-bg rounded-md text-text-primary transition-colors"
                              onMouseEnter={() => {
                                if (submenuCloseTimeoutRef.current) {
                                  clearTimeout(submenuCloseTimeoutRef.current);
                                  submenuCloseTimeoutRef.current = null;
                                }
                              }}
                              onClick={() => handleMoveToShot(shot.id)}
                            >
                              Shot {shot.number.toString().padStart(3, '0')}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div
                className="relative"
                onMouseEnter={() => {
                  if (submenuCloseTimeoutRef.current) {
                    clearTimeout(submenuCloseTimeoutRef.current);
                    submenuCloseTimeoutRef.current = null;
                  }
                  setShowShotSubmenu(true);
                  setSubmenuAction('copy');
                }}
                onMouseLeave={() => {
                  submenuCloseTimeoutRef.current = window.setTimeout(() => {
                    setShowShotSubmenu(false);
                    setActiveSceneSubmenu(null);
                  }, 300);
                }}
              >
                <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover-bg rounded-md flex items-center justify-between text-text-primary transition-colors">
                  {lastActionResult === 'copied' ? <span className="flex items-center gap-1.5 text-green-500"><Check size={14} />Copied</span> : <span>Copy to shot...</span>}
                  <span className="text-text-muted">›</span>
                </button>
                {/* Shot Submenu - Level 1: Scenes (for Copy) */}
                {showShotSubmenu && submenuAction === 'copy' && (
                  <div
                    ref={shotSubmenuRef}
                    className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 bg-card-bg border border-border-secondary rounded-xl shadow-2xl p-1.5 min-w-[140px] max-w-[160px] z-[101]"
                    onMouseEnter={() => {
                      if (submenuCloseTimeoutRef.current) {
                        clearTimeout(submenuCloseTimeoutRef.current);
                        submenuCloseTimeoutRef.current = null;
                      }
                    }}
                  >
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {Object.entries(shotsByScene).length === 0 ? (
                        <div className="px-4 py-2 text-xs text-text-muted">No shots available</div>
                      ) : (
                        Object.entries(shotsByScene).map(([sceneId, { scene }]) => (
                          <div key={sceneId} className="relative">
                            <button
                              data-scene-id={sceneId}
                              className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover-bg rounded-md flex items-center justify-between text-text-primary transition-colors"
                              onMouseEnter={(e) => {
                                if (submenuCloseTimeoutRef.current) {
                                  clearTimeout(submenuCloseTimeoutRef.current);
                                  submenuCloseTimeoutRef.current = null;
                                }
                                setActiveSceneSubmenu(sceneId);
                                const button = e.currentTarget;
                                const container = shotSubmenuRef.current;
                                if (button && container) {
                                  const buttonRect = button.getBoundingClientRect();
                                  const containerRect = container.getBoundingClientRect();
                                  setActiveSceneTop(buttonRect.top - containerRect.top);
                                }
                              }}
                              onMouseLeave={() => {
                                submenuCloseTimeoutRef.current = window.setTimeout(() => {
                                  setActiveSceneSubmenu(null);
                                }, 300);
                              }}
                            >
                              <span className="truncate">{scene.name}</span>
                              <span className="text-text-muted ml-2">›</span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    {/* Shot Submenu - Level 2: Shots in Scene (rendered outside scroll container) */}
                    {activeSceneSubmenu && shotsByScene[activeSceneSubmenu] && (
                      <div
                        className="absolute left-full -ml-1 pl-2 z-[102]"
                        style={{ top: `${activeSceneTop}px` }}
                        onMouseEnter={() => {
                          if (submenuCloseTimeoutRef.current) {
                            clearTimeout(submenuCloseTimeoutRef.current);
                            submenuCloseTimeoutRef.current = null;
                          }
                        }}
                        onMouseLeave={() => {
                          submenuCloseTimeoutRef.current = window.setTimeout(() => {
                            setShowShotSubmenu(false);
                            setActiveSceneSubmenu(null);
                          }, 300);
                        }}
                      >
                        <div
                          className="bg-card-bg border border-border-secondary rounded-xl shadow-2xl p-1.5 min-w-[140px] max-w-[160px]"
                          style={{ maxHeight: '300px', overflowY: 'hidden' }}
                        >
                          {shotsByScene[activeSceneSubmenu].shots.map((shot: any) => (
                            <button
                              key={shot.id}
                              className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover-bg rounded-md text-text-primary transition-colors"
                              onMouseEnter={() => {
                                if (submenuCloseTimeoutRef.current) {
                                  clearTimeout(submenuCloseTimeoutRef.current);
                                  submenuCloseTimeoutRef.current = null;
                                }
                              }}
                              onClick={() => handleCopyToShot(shot.id)}
                            >
                              Shot {shot.number.toString().padStart(3, '0')}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </ContextMenu>
    </div>
  );
});
