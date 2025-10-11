import { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { SoftwareIcon } from '../SoftwareIcon';
import { versionsCache } from '../../utils/versionsCache';

interface ProjectVersion {
  name: string;
  path: string;
  software: string[];
  created_at: number; // Unix timestamp in seconds
}

interface VersionsOverviewProps {
  project: any;
  currentShot: any;
}

export function VersionsOverview({ project, currentShot }: VersionsOverviewProps) {
  const [allVersions, setAllVersions] = useState<ProjectVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSoftware, setSelectedSoftware] = useState<string>('all');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingTimerRef = useRef<number | null>(null);
  const isFirstLoadRef = useRef(true);

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

    window.addEventListener('version-created', handleVersionUpdate);
    return () => window.removeEventListener('version-created', handleVersionUpdate);
  }, [project.path]);

  // Filter versions by shot and sort by version number (desc) then by date (desc)
  const versions = useMemo(() => {
    let filtered = currentShot
      ? allVersions.filter(v => {
          const shotPrefix = `_Shot${currentShot.number.toString().padStart(3, '0')}_`;
          return v.name.includes(shotPrefix);
        })
      : allVersions;

    // Sort only by creation date (newest left)
    const sorted = [...filtered].sort((a, b) => {
      return b.created_at - a.created_at;
    });

    return sorted;
  }, [allVersions, currentShot]);

  const handleVersionDoubleClick = async (versionPath: string) => {
    try {
      // Open file with default application (e.g., Blender for .blend files)
      await invoke('open_file', { filePath: versionPath });
    } catch (error) {
      console.error('Failed to open version:', error);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  // Only show loading spinner if there's no data yet
  if (loading && versions.length === 0) {
    return (
      <div className="mb-6">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Versions Overview</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
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
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Versions Overview</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <p className="text-xs text-zinc-500 text-center">No versions found (looking for folders like ProjectName_v001)</p>
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

  // Get unique software list
  const uniqueSoftware = Array.from(
    new Set(versions.flatMap((v) => v.software))
  ).sort();

  // Filter versions by selected software
  const filteredVersions = selectedSoftware === 'all'
    ? versions
    : versions.filter((v) => v.software.includes(selectedSoftware));

  return (
    <div className="mb-6 overflow-hidden">
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Versions Overview</h3>

      {/* Software Tabs */}
      {uniqueSoftware.length > 0 && (
        <div className="flex gap-1 mb-3 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedSoftware('all')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              selectedSoftware === 'all'
                ? 'bg-accent text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            All
          </button>
          {uniqueSoftware.map((software) => (
            <button
              key={software}
              onClick={() => setSelectedSoftware(software)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                selectedSoftware === software
                  ? 'bg-accent text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              <div className="w-4 h-4 flex items-center justify-center">
                <SoftwareIcon name={software} />
              </div>
              {software}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        className="versions-scroll-container bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-x-auto">
        {filteredVersions.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center">No versions found for {selectedSoftware}</p>
        ) : (
          <div className="flex gap-3 w-max">
            {filteredVersions.map((version) => (
              <div
                key={version.path}
                className="flex-shrink-0 w-32 cursor-pointer hover:bg-zinc-800 rounded-lg p-2 transition-colors select-none"
                onDoubleClick={() => handleVersionDoubleClick(version.path)}
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
    </div>
  );
}
