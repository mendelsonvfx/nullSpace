import { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { SoftwareIcon } from '../SoftwareIcon';
import { versionsCache } from '../../utils/versionsCache';
import { useTimeTrackingStore } from '../../features/time-tracking/stores/timeTrackingStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { FolderOpen, Copy, RefreshCw } from 'lucide-react';
import { writeText } from '@tauri-apps/api/clipboard';
import type { SoftwareName } from '../../types/project';

interface ProjectVersion {
  name: string;
  path: string;
  software: string[];
  created_at: number; // Unix timestamp in seconds
  is_versioned: boolean; // true if file has _v### pattern
}

interface VersionsOverviewProps {
  project: any;
  currentScene: any;
  currentShot: any;
}

export function VersionsOverview({ project, currentScene, currentShot }: VersionsOverviewProps) {
  const [allVersions, setAllVersions] = useState<ProjectVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSoftware, setSelectedSoftware] = useState<string>('all');
  const [showOnlyUnversioned, setShowOnlyUnversioned] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; version: ProjectVersion } | null>(null);
  const [showShotSubmenu, setShowShotSubmenu] = useState(false);
  const [submenuAction, setSubmenuAction] = useState<'move' | 'copy' | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingTimerRef = useRef<number | null>(null);
  const isFirstLoadRef = useRef(true);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const startSession = useTimeTrackingStore(state => state.startSession);
  const { activeMenu, setActiveMenu } = useContextMenuStore();

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

    try {
      // Clean up backup files only if not skipped
      if (!skipCleanup) {
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
    setContextMenu(null);
    setShowShotSubmenu(false);
    setSubmenuAction(null);

    loadVersions();

    // ✅ RE-ENABLED: File watcher now has proper shutdown mechanism
    // Start watching the project directory
    invoke('start_watching_project', {
      projectPath: project.path
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

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
        setShowShotSubmenu(false);
        setSubmenuAction(null);
        if (activeMenu === 'version-context-menu') {
          setActiveMenu(null);
        }
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu, activeMenu, setActiveMenu]);

  // Close menu when another menu opens
  useEffect(() => {
    if (activeMenu && activeMenu !== 'version-context-menu') {
      setContextMenu(null);
      setShowShotSubmenu(false);
      setSubmenuAction(null);
    }
  }, [activeMenu]);

  // Extract version number from filename (e.g., "file_v001.blend" → 1)
  const extractVersionNumber = (filename: string): number => {
    const match = filename.match(/_v(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  };

  // Filter versions by scene and shot, then sort: versioned files first (by version number), then non-versioned files (by date)
  const versions = useMemo(() => {
    let filtered = allVersions;

    // Filter by scene if selected
    if (currentScene) {
      filtered = filtered.filter(v => {
        // Extract scene code from scene name
        // "Scene 001" → "001", "Scene RIVER" → "RIVER"
        const sceneSuffix = currentScene.name.replace(/^Scene\s+/i, '').trim();
        const sceneCode = sceneSuffix.toUpperCase().replace(/\s+/g, '_');
        const scenePrefix = `_SC_${sceneCode}_`;

        // Include file if: (1) it has the scene prefix, OR (2) it's unversioned (unversioned files show in all scenes)
        return v.name.includes(scenePrefix) || !v.is_versioned;
      });
    }

    // Filter by shot if selected
    if (currentShot) {
      filtered = filtered.filter(v => {
        const shotPrefix = currentShot.number === 0
          ? '_SH000_'
          : `_SH${currentShot.number.toString().padStart(3, '0')}_`;
        // Include file if: (1) it has the shot prefix, OR (2) it's unversioned (unversioned files show in all shots)
        return v.name.includes(shotPrefix) || !v.is_versioned;
      });
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
  }, [allVersions, currentScene, currentShot]);

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
        await invoke('open_file', { filePath: versionPath });
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
        'Marmoset': 'marmoset'
      };

      const softwareKey = nameToKey[softwareName] || 'blender';

      // Start time tracking
      await startSession({
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

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    e.stopPropagation();
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, version: ProjectVersion) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    e.stopPropagation();

    setContextMenu({ x: e.clientX, y: e.clientY, version });
    setShowShotSubmenu(false);
    setSubmenuAction(null);
    setActiveMenu('version-context-menu');
  };

  const handleRevealInExplorer = async (versionPath: string) => {
    try {
      await invoke('reveal_in_explorer', { path: versionPath });
      setContextMenu(null);
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
      setContextMenu(null);
      setShowShotSubmenu(false);
      setSubmenuAction(null);
      setActiveMenu(null);
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  };

  const handleMoveToShot = async (shotNumber: number) => {
    if (!contextMenu) return;

    try {
      await invoke('move_version_to_shot', {
        versionPath: contextMenu.version.path,
        projectPath: project.path,
        targetShotNumber: shotNumber
      });

      // Reload versions after moving
      versionsCache.invalidate(project.path);
      await loadVersions(false, true);

      setContextMenu(null);
      setShowShotSubmenu(false);
      setSubmenuAction(null);
      setActiveMenu(null);
    } catch (error) {
      console.error('Failed to move version to shot:', error);
      alert(`Failed to move version: ${error}`);
    }
  };

  const handleCopyToShot = async (shotNumber: number) => {
    if (!contextMenu) return;

    try {
      await invoke('copy_version_to_shot', {
        versionPath: contextMenu.version.path,
        projectPath: project.path,
        targetShotNumber: shotNumber
      });

      // Reload versions after copying
      versionsCache.invalidate(project.path);
      await loadVersions(false, true);

      setContextMenu(null);
      setShowShotSubmenu(false);
      setSubmenuAction(null);
      setActiveMenu(null);
    } catch (error) {
      console.error('Failed to copy version to shot:', error);
      alert(`Failed to copy version: ${error}`);
    }
  };

  // Only show loading spinner if there's no data yet
  if (loading && versions.length === 0) {
    return (
      <div className="mb-6">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Versions Overview</h3>
        <div className="bg-card-bg border border-border-primary rounded-med p-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // Only show "no versions" if not loading and truly no data
  if (!loading && versions.length === 0) {
    return (
      <div className="mb-6">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Versions Overview</h3>
        <div data-versions-overview className="bg-card-bg border border-border-primary rounded-med p-4">
          <p className="text-xs text-text-muted text-center">No versions found (looking for folders like ProjectName_v001)</p>
        </div>
      </div>
    );
  }

  // Remove file extension from version name
  const getVersionNameWithoutExtension = (fullName: string) => {
    return fullName.replace(/\.[^/.]+$/, '');
  };

  // Extract only version number from full name (remove project name and shot info)
  const getVersionDisplayName = (fullName: string) => {
    const nameWithoutExt = getVersionNameWithoutExtension(fullName);
    // Match pattern like "ProjectName_Shot001_v001" or "ProjectName_v001"
    // Extract only the version part (v001, v002, etc.)
    const versionMatch = nameWithoutExt.match(/_v(\d+)$/i);
    if (versionMatch) {
      return `v${versionMatch[1]}`;
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
      // Filter by versioned status
      if (showOnlyUnversioned && v.is_versioned) {
        return false;
      }
      return true;
    });

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

  return (
    <div className="mb-6 overflow-hidden">
      <h3 className="text-sm font-medium text-text-secondary mb-3">Versions Overview</h3>

      {/* Software Tabs */}
      {uniqueSoftware.length > 0 && (
        <div className="flex gap-2 mb-3 items-stretch">
          {/* Software Filter - only show if more than one software */}
          {uniqueSoftware.length > 1 && (
            <div className="flex gap-1 bg-zinc-800/50 border border-border-primary rounded-button p-1 flex-shrink-0">
              {uniqueSoftware.map((software) => (
                <button
                  key={software}
                  onClick={() => {
                    setSelectedSoftware(software);
                    setShowOnlyUnversioned(false);
                  }}
                  className={`px-3 py-1.5 rounded text-xs transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    selectedSoftware === software && !showOnlyUnversioned
                      ? 'bg-zinc-700 text-white'
                      : 'text-text-secondary hover:text-white'
                  }`}
                >
                  <SoftwareIcon name={software} className="w-3.5 h-3.5" />
                  {software}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 bg-zinc-800/50 border border-border-primary rounded-button p-1">
            <button
              onClick={() => {
                setSelectedSoftware('all');
                setShowOnlyUnversioned(false);
              }}
              className={`px-3 py-1.5 rounded text-xs transition-colors whitespace-nowrap ${
                selectedSoftware === 'all' && !showOnlyUnversioned
                  ? 'bg-zinc-700 text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => {
                setShowOnlyUnversioned(!showOnlyUnversioned);
                setSelectedSoftware('all');
              }}
              className={`px-3 py-1.5 rounded text-xs transition-colors whitespace-nowrap ${
                showOnlyUnversioned
                  ? 'bg-zinc-700 text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              Other
            </button>
          </div>
          <button
            onClick={handleRefreshAll}
            className="p-1.5 hover:bg-hover-bg rounded-lg transition-colors ml-auto group self-center"
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
      )}

      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        data-versions-overview
        className="versions-scroll-container bg-card-bg border border-border-primary rounded-med p-4 overflow-x-auto">
        {filteredVersions.length === 0 ? (
          <p className="text-xs text-text-muted text-center">No versions found for {selectedSoftware}</p>
        ) : (
          <div className="flex gap-3 w-max">
            {filteredVersions.map((version) => (
              <div
                key={version.path}
                className="flex-shrink-0 w-32 cursor-pointer hover:bg-hover-bg rounded-lg p-2 transition-colors select-none"
                onDoubleClick={() => handleVersionDoubleClick(version.path, version.software)}
                onContextMenu={(e) => handleContextMenu(e, version)}
                title="Double-click to open"
              >
                {/* Header with software icons */}
                <div className="flex gap-1 mb-2 justify-center flex-wrap">
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
                {/* Version name without extension */}
                <div className="text-xs text-center font-medium truncate" title={version.name}>
                  {getVersionDisplayName(version.name)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-50 py-1 min-w-[180px] animate-context-menu"
          style={{
            top: (() => {
              const menuHeight = contextMenuRef.current?.offsetHeight || 200;
              const windowHeight = window.innerHeight;
              const wouldOverflow = contextMenu.y + menuHeight > windowHeight;
              return wouldOverflow ? windowHeight - menuHeight - 10 : contextMenu.y;
            })(),
            left: (() => {
              const menuWidth = contextMenuRef.current?.offsetWidth || 180;
              const windowWidth = window.innerWidth;
              const wouldOverflow = contextMenu.x + menuWidth > windowWidth;
              return wouldOverflow ? windowWidth - menuWidth - 10 : contextMenu.x;
            })(),
          }}
        >
          <button
            onClick={() => handleRevealInExplorer(contextMenu.version.path)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2 text-text-primary"
          >
            <FolderOpen className="w-4 h-4" />
            Reveal in Explorer
          </button>
          <button
            onClick={() => handleCopyPath(contextMenu.version.path)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2 text-text-primary"
          >
            <Copy className="w-4 h-4" />
            Copy Path
          </button>

          {/* Show shot menu only for versioned files and if shots exist */}
          {contextMenu.version.is_versioned && project.shots && project.shots.length > 0 && (
            <>
              <div className="border-t border-zinc-700 my-1" />
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center justify-between"
                onMouseEnter={() => {
                  setShowShotSubmenu(true);
                  setSubmenuAction('move');
                }}
              >
                <span>Move to shot...</span>
                <span className="text-zinc-500">›</span>
              </button>
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center justify-between"
                onMouseEnter={() => {
                  setShowShotSubmenu(true);
                  setSubmenuAction('copy');
                }}
              >
                <span>Copy to shot...</span>
                <span className="text-zinc-500">›</span>
              </button>
            </>
          )}

          {/* Shot Submenu */}
          {showShotSubmenu && submenuAction && project.shots && contextMenu && (
            <div
              className="absolute left-full top-0 ml-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 min-w-[140px] animate-context-menu"
              onMouseLeave={() => setShowShotSubmenu(false)}
            >
              {(() => {
                // Extract current shot number from version filename
                const shotMatch = contextMenu.version.name.match(/_Shot(\d{3})_/);
                const mainMatch = contextMenu.version.name.includes('_main_');
                const currentShotNumber = mainMatch ? 0 : (shotMatch ? parseInt(shotMatch[1]) : null);

                // Filter out current shot
                return project.shots
                  .filter((shot: any) => shot.number !== currentShotNumber)
                  .map((shot: any) => (
                    <button
                      key={shot.id}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700"
                      onClick={() => {
                        if (submenuAction === 'move') {
                          handleMoveToShot(shot.number);
                        } else {
                          handleCopyToShot(shot.number);
                        }
                      }}
                    >
                      {shot.number === 0 ? 'Main' : `Shot ${shot.number.toString().padStart(3, '0')}`}
                    </button>
                  ));
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
