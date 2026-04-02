import React, { useState, useMemo, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import SimpleBar from 'simplebar-react';
import {
  IconBox,
  IconPlus,
  IconChevronRight,
  IconFile,
  IconPencil,
  IconUser,
  IconTrees,
  IconSparkles,
  IconCar,
  IconBuilding,
  IconSword,
  IconCrown,
  IconFlame,
  IconBulb,
  IconBolt,
  IconLeaf,
  IconDiamond,
  IconRocket,
  IconPaw,
  IconAnchor,
  IconFolderOpen,
  IconCopy,
  IconCircleCheck,
  IconTrash,
} from '@tabler/icons-react';
import { SoftwareIcon } from '../SoftwareIcon';
import { versionsCache, type ProjectVersion } from '../../utils/versionsCache';
import { parseFileName } from '../../utils/fileNaming';
import { AssetNameModal } from '../modals/AssetNameModal';
import { RenameSceneConfirmModal } from '../modals/RenameSceneConfirmModal';
import { useProjectStore } from '../../store/projectStore';
import { useTimeTrackingStore } from '../../features/time-tracking/stores/timeTrackingStore';
import { useContextMenu } from '../../hooks/useContextMenu';
import { writeText } from '@tauri-apps/api/clipboard';
import { ContextMenu, ContextMenuItem, ContextMenuDivider, ContextMenuColorPicker } from '../ui/ContextMenu';
import type { SoftwareName } from '../../types/project';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeDate(ts: number): string {
  const diff = Date.now() - ts * 1000;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatShortDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

const ASSET_COLORS = [
  { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  { bg: 'bg-green-500/20', text: 'text-green-400' },
  { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  { bg: 'bg-pink-500/20', text: 'text-pink-400' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  { bg: 'bg-red-500/20', text: 'text-red-400' },
];

function getAssetColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return ASSET_COLORS[h % ASSET_COLORS.length];
}

const NAME_TO_SW_KEY: Record<string, string> = {
  'Blender': 'blender',
  'Houdini': 'houdini',
  'Maya': 'maya',
  'After Effects': 'after-effects',
  'Cinema 4D': 'cinema4d',
  'Substance Painter': 'substance',
  'Substance Designer': 'substance',
  'Unreal Engine': 'unreal',
  'Unity': 'unity',
  'ZBrush': 'zbrush',
  'Marmoset': 'marmoset',
  'Photoshop': 'photoshop',
};

const ALL_SOFTWARE: { name: SoftwareName; displayName: string; executablePath: string }[] = [
  { name: 'blender',       displayName: 'Blender',       executablePath: '' },
  { name: 'houdini',       displayName: 'Houdini',       executablePath: '' },
  { name: 'after-effects', displayName: 'After Effects', executablePath: '' },
  { name: 'photoshop',     displayName: 'Photoshop',     executablePath: '' },
];

const FIXED_ASSET_TAGS = ['Character', 'Prop', 'Environment', 'VFX'] as const;

const TAG_META: Record<string, { Icon: typeof IconUser; textColor: string; borderColor: string }> = {
  Character: { Icon: IconUser,     textColor: 'text-purple-400', borderColor: 'border-purple-500/40' },
  Prop:       { Icon: IconBox,     textColor: 'text-blue-400',   borderColor: 'border-blue-500/40'   },
  Environment:{ Icon: IconTrees,   textColor: 'text-green-400',  borderColor: 'border-green-500/40'  },
  VFX:        { Icon: IconSparkles,textColor: 'text-orange-400', borderColor: 'border-orange-500/40' },
};

const AVATAR_ICONS: Record<string, React.ComponentType<any>> = {
  box: IconBox, car: IconCar, building: IconBuilding,
  user: IconUser, sword: IconSword, crown: IconCrown,
  flame: IconFlame, bulb: IconBulb, bolt: IconBolt,
  leaf: IconLeaf, gem: IconDiamond, rocket: IconRocket,
  paw: IconPaw, anchor: IconAnchor,
};

const AVATAR_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  blue:   { bg: 'bg-blue-500/20',   text: 'text-blue-400'   },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  green:  { bg: 'bg-green-500/20',  text: 'text-green-400'  },
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  pink:   { bg: 'bg-pink-500/20',   text: 'text-pink-400'   },
  cyan:   { bg: 'bg-cyan-500/20',   text: 'text-cyan-400'   },
  yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  red:    { bg: 'bg-red-500/20',    text: 'text-red-400'    },
};

const AVATAR_COLOR_OPTIONS = [
  { name: 'blue',   value: 'blue',   className: 'bg-blue-500'   },
  { name: 'purple', value: 'purple', className: 'bg-purple-500' },
  { name: 'green',  value: 'green',  className: 'bg-green-500'  },
  { name: 'orange', value: 'orange', className: 'bg-orange-500' },
  { name: 'pink',   value: 'pink',   className: 'bg-pink-500'   },
  { name: 'cyan',   value: 'cyan',   className: 'bg-cyan-500'   },
  { name: 'yellow', value: 'yellow', className: 'bg-yellow-500' },
  { name: 'red',    value: 'red',    className: 'bg-red-500'    },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetGroup {
  assetName: string;
  displayName: string;
  allVersions: ProjectVersion[];
  software: string[];
  latestModified: number;
}

export interface AssetStats {
  totalAssets: number;
  totalVersions: number;
  softwareCount: number;
  lastModified: number | null;
}

interface AssetsLibraryProps {
  project: any;
  showNotification: (type: 'success' | 'error' | 'warning' | 'info', message: string, title?: string, duration?: number) => void;
  onStatsChange?: (stats: AssetStats) => void;
}

interface AssetRowProps {
  group: AssetGroup;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenVersion: (v: ProjectVersion) => void;
  projectId: string;
  assetTagsForGroup: string[];
  assetIcon?: string;
  assetColor?: string;
  onContextMenu: (e: React.MouseEvent) => void;
}

// ─── SkeletonRows ─────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-card-bg border border-border-primary rounded-card px-4 py-3 animate-pulse h-14" />
      ))}
    </>
  );
}

// ─── AssetRow ─────────────────────────────────────────────────────────────────

function AssetRow({ group, isExpanded, onToggleExpand, onOpenVersion, assetTagsForGroup, assetIcon, assetColor, onContextMenu }: AssetRowProps) {
  const color = getAssetColor(group.assetName);
  const avatarColor = (assetColor ? AVATAR_COLOR_MAP[assetColor] : undefined) ?? color;
  const AvatarIcon = ((assetIcon ? AVATAR_ICONS[assetIcon] : undefined) ?? IconBox) as React.ComponentType<{ size?: number; className?: string; stroke?: number }>;
  const latestVersion = group.allVersions[0];

  const { isOpen: vCtxOpen, position: vCtxPos, data: vCtxData, openMenu: vOpenMenu, closeMenu: vCloseMenu } = useContextMenu<ProjectVersion>();
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleRevealVersion = async (path: string) => {
    try { await invoke('reveal_in_explorer', { path }); } catch {}
    vCloseMenu();
  };

  const handleCopyVersionPath = async (path: string) => {
    try {
      await writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch {}
    vCloseMenu();
  };

  return (
    <div className="bg-card-bg border border-border-primary rounded-card overflow-hidden">
      {/* Header row */}
      <div
        onClick={onToggleExpand}
        onContextMenu={onContextMenu}
        className="grid items-center gap-3 px-4 py-3 cursor-pointer hover:bg-hover-bg transition-colors select-none"
        style={{ gridTemplateColumns: '32px 1fr 72px 96px 120px minmax(0,1fr) 80px' }}
      >
        {/* Colored icon */}
        <div className={`w-8 h-8 rounded-button flex items-center justify-center flex-shrink-0 ${avatarColor.bg}`}>
          <AvatarIcon size={16} className={avatarColor.text} stroke={1.5} />
        </div>

        {/* Name */}
        <div className="flex items-center gap-2 min-w-0">
          <IconChevronRight
            size={13}
            className={`text-text-muted flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
          />
          <span className="text-sm font-semibold text-text-primary truncate">{group.displayName}</span>
        </div>

        {/* Version count */}
        <div className="text-xs text-text-muted whitespace-nowrap">
          {group.allVersions.length} {group.allVersions.length === 1 ? 'ver.' : 'vers.'}
        </div>

        {/* Software icons */}
        <div className="flex items-center gap-1">
          {group.software.slice(0, 3).map(sw => (
            <SoftwareIcon key={sw} name={sw} className="w-3.5 h-3.5" />
          ))}
        </div>

        {/* Last modified */}
        <div className="text-xs text-text-muted">{formatRelativeDate(group.latestModified)}</div>

        {/* Tag badges — read-only display */}
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          {assetTagsForGroup.map(tag => {
            const meta = TAG_META[tag];
            return (
              <span
                key={tag}
                className={`px-1.5 py-0.5 bg-card-bg border rounded-badge text-[10px] flex items-center gap-1 whitespace-nowrap ${meta?.borderColor ?? 'border-border-primary'} ${meta?.textColor ?? 'text-text-muted'}`}
              >
                {meta && <meta.Icon size={10} stroke={1.5} />}
                {tag}
              </span>
            );
          })}
        </div>

        {/* Open latest button */}
        <button
          onClick={(e) => { e.stopPropagation(); if (latestVersion) onOpenVersion(latestVersion); }}
          disabled={!latestVersion}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded-button text-xs text-white font-medium transition-colors disabled:opacity-40"
        >
          Open
        </button>
      </div>

      {/* Animated versions panel */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border-primary bg-sidebar-bg px-4 py-3">
            {group.allVersions.length === 0 ? (
              <p className="text-xs text-text-muted">No versions</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.allVersions.map(v => {
                  const parsed = parseFileName(v.name);
                  return (
                    <div
                      key={v.path}
                      className="flex flex-col items-center gap-1.5 bg-card-bg border border-border-primary rounded-med px-3 py-2 cursor-pointer hover:border-border-hover transition-colors min-w-[68px]"
                      onDoubleClick={() => onOpenVersion(v)}
                      onContextMenu={(e) => vOpenMenu(e, v)}
                      title={`Double-click to open ${v.name}`}
                    >
                      {v.software.length > 0
                        ? <SoftwareIcon name={v.software[0]} className="w-4 h-4" />
                        : <IconFile size={16} className="text-text-muted" />
                      }
                      <span className="text-xs font-semibold text-text-primary">
                        v{String(parsed?.version ?? 0).padStart(3, '0')}
                      </span>
                      <span className="text-[10px] text-text-muted">{formatShortDate(v.modified_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Version context menu */}
      <ContextMenu isOpen={vCtxOpen} position={vCtxPos} onClose={vCloseMenu} menuId="asset-version">
        <ContextMenuItem
          icon={<IconFolderOpen size={14} stroke={1.5} />}
          onClick={() => vCtxData && handleRevealVersion(vCtxData.path)}
        >
          Reveal in Explorer
        </ContextMenuItem>
        <ContextMenuItem
          icon={copiedPath === vCtxData?.path
            ? <IconCircleCheck size={14} stroke={1.5} className="text-status-active" />
            : <IconCopy size={14} stroke={1.5} />
          }
          onClick={() => vCtxData && handleCopyVersionPath(vCtxData.path)}
        >
          {copiedPath === vCtxData?.path
            ? <span className="text-status-active">Path Copied</span>
            : 'Copy Path'
          }
        </ContextMenuItem>
      </ContextMenu>
    </div>
  );
}

// ─── AssetsLibrary ────────────────────────────────────────────────────────────

export function AssetsLibrary({ project, showNotification, onStatsChange }: AssetsLibraryProps) {
  const [allVersions, setAllVersions] = useState<ProjectVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const collapsedProjectIdRef = useRef(project.id);
  const [collapsedAssets, setCollapsedAssets] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`assets_collapsed_${project.id}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [showAssetNameModal, setShowAssetNameModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    assetName: string;
    fileCount: { versionFiles: number; thumbnails: number };
  } | null>(null);

  const { isOpen: ctxOpen, position: ctxPos, data: ctxData, openMenu, closeMenu } = useContextMenu<{ assetName: string }>();

  const loadingTimerRef = useRef<number | null>(null);
  const isFirstLoadRef = useRef(true);
  const onStatsChangeRef = useRef(onStatsChange);
  useEffect(() => { onStatsChangeRef.current = onStatsChange; });

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadVersions = async (skipCleanup = false, forceReload = false) => {
    if (loadingTimerRef.current !== null) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }

    if (!forceReload) {
      const cached = versionsCache.get(project.path);
      if (cached) {
        setAllVersions(cached);
        setLoading(false);
        isFirstLoadRef.current = false;
        return;
      }
    }

    const shouldShowLoading = isFirstLoadRef.current;
    if (shouldShowLoading) {
      setLoading(true);
      isFirstLoadRef.current = false;
    } else {
      loadingTimerRef.current = window.setTimeout(() => {
        setLoading(true);
        loadingTimerRef.current = null;
      }, 200);
    }

    try {
      if (!skipCleanup) {
        await invoke<number>('cleanup_backup_files', { projectPath: project.path });
      }
      const result = await invoke<ProjectVersion[]>('get_project_versions', { projectPath: project.path });
      if (loadingTimerRef.current !== null) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      setAllVersions(result);
      versionsCache.set(project.path, result);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load versions:', error);
      if (loadingTimerRef.current !== null) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      setLoading(false);
    }
  };

  // Effect 1: load + watcher
  useEffect(() => {
    isFirstLoadRef.current = true;
    loadVersions();
    invoke('start_watching_project', { projectPath: project.path }).catch(console.error);
    return () => {
      invoke('stop_watching_project').catch(console.error);
    };
  }, [project.path]);

  // Effect 2: Tauri file-system event
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('version-changed', () => {
      versionsCache.invalidate(project.path);
      loadVersions(true, true);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [project.path]);

  // Effect 3: window custom events from launch_software / manual refresh
  useEffect(() => {
    const handleVersionCreated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.projectPath || detail.projectPath === project.path) {
        versionsCache.invalidate(project.path);
        loadVersions(false, true);
      }
    };
    const handleRefreshAll = () => {
      versionsCache.invalidate(project.path);
      loadVersions(false, true);
    };
    window.addEventListener('version-created', handleVersionCreated);
    window.addEventListener('refresh-all', handleRefreshAll);
    return () => {
      window.removeEventListener('version-created', handleVersionCreated);
      window.removeEventListener('refresh-all', handleRefreshAll);
    };
  }, [project.path]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const assetGroups = useMemo((): AssetGroup[] => {
    const map = new Map<string, ProjectVersion[]>();
    for (const v of allVersions) {
      const parsed = parseFileName(v.name);
      if (parsed?.specialContext !== 'ASSET') continue;
      const key = parsed.assetName ?? '__UNNAMED__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return Array.from(map.entries())
      .map(([key, versions]) => {
        const sorted = [...versions].sort((a, b) => {
          const va = parseFileName(a.name)?.version ?? 0;
          const vb = parseFileName(b.name)?.version ?? 0;
          return vb - va;
        });
        return {
          assetName: key,
          displayName: key === '__UNNAMED__'
            ? 'Unnamed'
            : key.charAt(0) + key.slice(1).toLowerCase(),
          allVersions: sorted,
          software: Array.from(new Set(versions.flatMap(v => v.software))),
          latestModified: Math.max(...versions.map(v => v.modified_at)),
        };
      })
      .sort((a, b) => b.latestModified - a.latestModified);
  }, [allVersions]);

  const stats = useMemo(() => ({
    totalAssets: assetGroups.length,
    totalVersions: assetGroups.reduce((sum, g) => sum + g.allVersions.length, 0),
    softwareCount: new Set(assetGroups.flatMap(g => g.software)).size,
    lastModified: assetGroups.length > 0 ? Math.max(...assetGroups.map(g => g.latestModified)) : null,
  }), [assetGroups]);

  // Propagate stats to parent (bottom bar)
  useEffect(() => {
    onStatsChangeRef.current?.(stats);
  }, [stats]);

  // Reload collapsed state when project switches (AssetsLibrary is never unmounted)
  useEffect(() => {
    if (project.id === collapsedProjectIdRef.current) return;
    collapsedProjectIdRef.current = project.id;
    try {
      const saved = localStorage.getItem(`assets_collapsed_${project.id}`);
      setCollapsedAssets(saved ? new Set(JSON.parse(saved)) : new Set());
    } catch {
      setCollapsedAssets(new Set());
    }
  }, [project.id]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleDeleteAsset = async (assetName: string) => {
    closeMenu();
    try {
      const counts = await invoke<{ versionFiles: number; thumbnails: number }>(
        'count_asset_files', { projectPath: project.path, assetName }
      );
      setDeleteConfirm({ assetName, fileCount: counts });
    } catch {
      showNotification('error', 'Failed to read asset files.');
    }
  };

  const handleCreateAsset = async (assetName: string, software?: any) => {
    if (!software) return;
    const softwareKey = NAME_TO_SW_KEY[software.name] || software.name.toLowerCase().replace(/\s+/g, '-');

    let executablePath: string = software.executablePath || '';
    if (!executablePath) {
      try {
        const saved = localStorage.getItem('softwarePaths');
        if (saved) executablePath = JSON.parse(saved)[softwareKey] || '';
      } catch { /* ignore corrupt localStorage */ }
    }
    if (!executablePath) {
      showNotification('warning', `Path not set for ${software.name}. Please configure it in Settings.`);
      return;
    }

    setShowAssetNameModal(false);
    try {
      await useProjectStore.getState().launchSoftware({
        projectPath: project.path,
        executablePath,
        software: softwareKey,
        projectName: project.name,
        specialContext: 'ASSET',
        assetName,
      });
      // Restart watcher to pick up _GlobalAssets folder if it was just created
      invoke('start_watching_project', { projectPath: project.path }).catch(console.error);
      const randomColor = AVATAR_COLOR_OPTIONS[Math.floor(Math.random() * AVATAR_COLOR_OPTIONS.length)].value;
      useProjectStore.getState().setAssetColor(project.id, assetName, randomColor);
    } catch (error) {
      console.error('Failed to launch software for asset creation:', error);
      showNotification('error', 'Failed to create asset. Check your software path in Settings.');
    }
  };

  const handleOpenVersion = async (v: ProjectVersion) => {
    try {
      const softwareName = v.software.length > 0 ? v.software[0] : 'Blender';
      const softwareInfo = project.software?.find((s: any) => s.name === softwareName);

      if (!softwareInfo) {
        await invoke('open_file', { filePath: v.path });
        return;
      }

      let executablePath = softwareInfo.path || softwareInfo.executable_path || softwareInfo.executablePath;
      if (!executablePath) {
        const savedPaths = localStorage.getItem('softwarePaths');
        if (savedPaths) {
          const paths = JSON.parse(savedPaths);
          executablePath = paths[softwareName.toLowerCase().replace(/\s+/g, '-')];
        }
      }

      if (!executablePath) {
        showNotification('warning', `Path not set for ${softwareName}. Please configure it in Settings.`);
        return;
      }

      const result = await invoke<{ file_name: string; pid: number }>('open_file_with_tracking', {
        filePath: v.path,
        executablePath,
      });

      const swKey = (NAME_TO_SW_KEY[softwareName] || 'blender') as SoftwareName;
      await useTimeTrackingStore.getState().startSession({
        projectId: project.id,
        projectPath: project.path,
        software: swKey,
        pid: result.pid,
      });
    } catch (error) {
      console.error('Failed to open version:', error);
    }
  };

  const toggleExpanded = (assetName: string) => {
    setCollapsedAssets(prev => {
      const next = new Set(prev);
      next.has(assetName) ? next.delete(assetName) : next.add(assetName);
      try {
        localStorage.setItem(`assets_collapsed_${project.id}`, JSON.stringify(Array.from(next)));
      } catch { /* ignore */ }
      return next;
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Asset List */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Gradient fade from tab header to content */}
        <div
          className="pointer-events-none absolute top-0 left-0 right-0 h-6 z-10"
          style={{ background: 'linear-gradient(to bottom, rgba(10,10,10,0.85) 0%, transparent 100%)' }}
        />

        <SimpleBar className="flex-1 h-full custom-page-scrollbar" autoHide={false}>
          <div className="px-7 pt-4 pb-16 space-y-2">
            {/* Create New Asset Row */}
            <button
              onClick={() => setShowAssetNameModal(true)}
              className="w-full border border-dashed border-border-secondary rounded-card px-4 py-2.5 flex items-center gap-3 hover:bg-hover-bg transition-colors"
            >
              <div className="w-8 h-8 rounded-button flex items-center justify-center flex-shrink-0">
                <IconPlus size={15} className="text-text-muted" />
              </div>
              <span className="text-sm text-text-muted">Create New Asset</span>
            </button>

            {/* Loading */}
            {loading && <SkeletonRows />}

            {/* Empty state */}
            {!loading && assetGroups.length === 0 && (
              <div className="py-14 flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-card bg-card-bg border border-border-primary flex items-center justify-center">
                  <IconBox size={22} stroke={1} className="text-text-muted" />
                </div>
                <p className="text-sm text-text-muted">No assets yet. Create your first asset above.</p>
              </div>
            )}

            {/* Column headers + Asset rows */}
            {!loading && assetGroups.length > 0 && (
              <div className="space-y-2">
                {/* Column headers */}
                <div
                  className="grid items-center gap-3 px-4 py-3.5 bg-card-bg border border-border-primary rounded-card"
                  style={{ gridTemplateColumns: '32px 1fr 72px 96px 120px minmax(0,1fr) 80px' }}
                >
                  <div />
                  <span className="text-[11px] font-semibold tracking-[0.5px] uppercase text-text-muted">Name</span>
                  <span className="text-[11px] font-semibold tracking-[0.5px] uppercase text-text-muted">Version</span>
                  <span className="text-[11px] font-semibold tracking-[0.5px] uppercase text-text-muted">Software</span>
                  <span className="text-[11px] font-semibold tracking-[0.5px] uppercase text-text-muted">Last Modified</span>
                  <span className="text-[11px] font-semibold tracking-[0.5px] uppercase text-text-muted">Tags</span>
                  <div />
                </div>
                {/* Asset rows */}
                {assetGroups.map(group => (
                  <AssetRow
                    key={group.assetName}
                    group={group}
                    isExpanded={!collapsedAssets.has(group.assetName)}
                    onToggleExpand={() => toggleExpanded(group.assetName)}
                    onOpenVersion={handleOpenVersion}
                    projectId={project.id}
                    assetTagsForGroup={project.assetTags?.[group.assetName] || []}
                    assetIcon={project.assetIcons?.[group.assetName]}
                    assetColor={project.assetColors?.[group.assetName]}
                    onContextMenu={(e) => openMenu(e, { assetName: group.assetName })}
                  />
                ))}
              </div>
            )}
          </div>
        </SimpleBar>
      </div>

      {/* Context Menu */}
      <ContextMenu isOpen={ctxOpen} position={ctxPos} onClose={closeMenu} menuId="asset">
        <ContextMenuItem
          icon={<IconPencil size={14} stroke={1.5} />}
          onClick={() => { setRenameTarget(ctxData!.assetName); closeMenu(); }}
        >Rename</ContextMenuItem>
        <ContextMenuDivider />
        <div className="px-3 py-1 text-[11px] text-text-muted opacity-70 font-medium">Set Tag</div>
        {FIXED_ASSET_TAGS.map(tag => {
          const currentTags = project.assetTags?.[ctxData?.assetName ?? ''] || [];
          const isActive = currentTags.includes(tag);
          const meta = TAG_META[tag];
          const TagIcon = meta?.Icon;
          return (
            <ContextMenuItem
              key={tag}
              icon={TagIcon ? <TagIcon size={13} stroke={1.5} className={meta.textColor} /> : undefined}
              className={isActive ? 'bg-hover-bg' : ''}
              onClick={() => {
                const next = isActive
                  ? currentTags.filter((t: string) => t !== tag)
                  : [...currentTags, tag];
                useProjectStore.getState().setAssetTags(project.id, ctxData!.assetName, next);
              }}
            >{tag}</ContextMenuItem>
          );
        })}
        <ContextMenuDivider />
        {/* Icon picker */}
        <div className="px-3 py-2">
          <div className="text-[10px] text-text-muted mb-1.5 opacity-70 font-medium">Icon</div>
          <div className="grid grid-cols-7 gap-1">
            {Object.entries(AVATAR_ICONS).map(([key, Icon]) => {
              const active = (project.assetIcons?.[ctxData?.assetName ?? ''] ?? 'box') === key;
              return (
                <button
                  key={key}
                  title={key}
                  onClick={() => useProjectStore.getState().setAssetIcon(project.id, ctxData!.assetName, key)}
                  className={`w-6 h-6 flex items-center justify-center rounded transition-all ${active ? 'bg-hover-bg ring-1 ring-accent/60' : 'hover:bg-hover-bg'}`}
                >
                  <Icon size={13} stroke={1.5} className="text-white/70" />
                </button>
              );
            })}
          </div>
        </div>
        {/* Color picker */}
        <ContextMenuColorPicker
          label="Color"
          colors={AVATAR_COLOR_OPTIONS}
          selectedColor={project.assetColors?.[ctxData?.assetName ?? ''] ?? null}
          onSelect={(c) => useProjectStore.getState().setAssetColor(project.id, ctxData!.assetName, c)}
        />
        <ContextMenuDivider />
        <ContextMenuItem
          icon={<IconTrash size={14} stroke={1.5} />}
          danger
          onClick={() => { handleDeleteAsset(ctxData!.assetName); }}
        >Delete Asset</ContextMenuItem>
      </ContextMenu>

      {/* Asset Name Modal — create */}
      {showAssetNameModal && (
        <AssetNameModal
          isOpen
          onClose={() => setShowAssetNameModal(false)}
          onConfirm={handleCreateAsset}
          softwareList={ALL_SOFTWARE}
          projectName={project.name}
        />
      )}

      {/* Asset Name Modal — rename */}
      {renameTarget && (
        <AssetNameModal
          isOpen
          mode="rename"
          initialName={renameTarget}
          onClose={() => setRenameTarget(null)}
          onConfirm={(newName) => {
            if (newName !== renameTarget) {
              useProjectStore.getState().renameAsset(project.id, renameTarget, newName);
            }
            setRenameTarget(null);
          }}
          projectName={project.name}
        />
      )}

      {/* Delete Asset Confirmation Modal */}
      {deleteConfirm && (
        <RenameSceneConfirmModal
          isOpen
          isDeleting
          isAsset
          sceneName={deleteConfirm.assetName}
          fileCount={deleteConfirm.fileCount}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => {
            const name = deleteConfirm.assetName;
            setDeleteConfirm(null);
            useProjectStore.getState().deleteAsset(project.id, name);
          }}
        />
      )}
    </div>
  );
}
