import { useState, useEffect, useRef, useCallback } from 'react';
import {
  IconFile,
  IconChevronRight,
  IconEye,
  IconEyeOff,
  IconCopy,
  IconCircleCheck,
  IconFolderOpen,
  IconPalette,
  IconFolder,
  IconBrandPython,
  IconBrandReact,
  IconTerminal2,
  IconPackage,
  IconPhoto,
  IconMovie,
  IconFileZip,
  IconFileText,
  IconPdf
} from '@tabler/icons-react';
import { RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';
import { useProjectStore } from '../../store/projectStore';
import { useFileDragOut } from '../../hooks/useFileDragOut';
import { getCachedThumbnail, isThumbnailImage } from '../../hooks/useImageThumbnail';
import { useHoverPreview } from '../../hooks/useHoverPreview';
import { HoverPreviewPopup } from '../ui/HoverPreviewPopup';
import { ThumbObserverProvider, TreeThumb } from './TreeThumb';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { SoftwareIcon } from '../SoftwareIcon';
import { getSoftwareMeta, SOFTWARE_BADGE } from '../../utils/softwareMeta';
import { useSoftwareIcon } from '../../utils/softwareIcons';
import { writeText } from '@tauri-apps/api/clipboard';
import { useTimeTrackingStore } from '../../features/time-tracking/stores/timeTrackingStore';
import type { SoftwareName } from '../../types/project';
import SimpleBar from 'simplebar-react';
import { isVersioned, extractVersion, sanitizeFolderName } from '../../utils/fileNaming';
import { ContextMenu, ContextMenuItem, ContextMenuDivider, ContextMenuColorPicker } from '../ui/ContextMenu';
import { useContextMenu } from '../../hooks/useContextMenu';
import { openResolveVersion } from '../../utils/openResolveVersion';

// Import folder icons

// Module-level caches for tree structure and directory size, keyed by project path.
// Persists across component unmount/remount; avoids redundant IPC calls on project switch.
const TREE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const TREE_CACHE_MAX = 10;

function cacheSet<T>(map: Map<string, { data: T; ts: number }>, path: string, data: T) {
  if (map.size >= TREE_CACHE_MAX) map.delete(map.keys().next().value!);
  map.set(path, { data, ts: Date.now() });
}
function cacheGet<T>(map: Map<string, { data: T; ts: number }>, path: string): T | null {
  const entry = map.get(path);
  if (!entry) return null;
  if (Date.now() - entry.ts > TREE_CACHE_TTL) { map.delete(path); return null; }
  return entry.data;
}
const treeStructureCache = new Map<string, { data: FileNode[]; ts: number }>();
const treeSizeCache = new Map<string, { data: number; ts: number }>();
// A read started before an invalidation must not put its older result back into the cache
const treeCacheGenerations = new Map<string, number>();
function treeCacheGeneration(path: string) {
  return treeCacheGenerations.get(path) ?? 0;
}
function invalidateTreeCache(path: string) {
  treeStructureCache.delete(path);
  treeSizeCache.delete(path);
  treeCacheGenerations.set(path, treeCacheGeneration(path) + 1);
}

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

// #rrggbb mixed toward black: `amount` of the color is kept (1 = unchanged)
const shadeHex = (hex: string, amount: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * amount).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
};

// One shade for fill and outline: the folder reads as a single dark silhouette
const FOLDER_SHADE = 0.4;

// Software folder: darkened folder in the app's color with the app's own exe icon inside (abbreviation when
// the path isn't set). A component, not inline in renderNode, because it reads the icon store through a hook
const SoftwareFolderIcon = ({ softwareKey, color }: { softwareKey: SoftwareName; color: string }) => {
  const meta = getSoftwareMeta(softwareKey);
  const icon = useSoftwareIcon(softwareKey);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className="relative w-6 h-6 flex-shrink-0" title={meta.display}>
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0">
        {/* Whole folder darkened, outline included: the bright icon (in the same brand color) stands out on it */}
        <path
          d="M3 6C3 4.89543 3.89543 4 5 4H8.67452C9.1637 4 9.40886 4 9.63904 4.05526C9.84311 4.10425 10.0379 4.18526 10.2168 4.29492C10.4186 4.41857 10.5918 4.59182 10.9375 4.9375L12 6H17.8C18.9201 6 19.4798 6 19.9076 6.21799C20.2839 6.40973 20.5905 6.71547 20.7822 7.0918C21.0002 7.51962 21.0002 8.07967 21.0002 9.19978V16.7998C21.0002 17.9199 21.0002 18.48 20.7822 18.9078C20.5905 19.2841 20.2837 19.5905 19.9074 19.7822C19.48 20 18.921 20 17.8031 20H6.19691C5.07899 20 4.5192 20 4.0918 19.7822C3.71547 19.5905 3.40973 19.2839 3.21799 18.9076C3 18.4798 3 17.9201 3 16.8V6Z"
          fill={shadeHex(color, FOLDER_SHADE)}
        />
        <path
          d="M3 6V16.8C3 17.9201 3 18.4798 3.21799 18.9076C3.40973 19.2839 3.71547 19.5905 4.0918 19.7822C4.5192 20 5.07899 20 6.19691 20H17.8031C18.921 20 19.48 20 19.9074 19.7822C20.2837 19.5905 20.5905 19.2841 20.7822 18.9078C21.0002 18.48 21.0002 17.9199 21.0002 16.7998L21.0002 9.19978C21.0002 8.07967 21.0002 7.51962 20.7822 7.0918C20.5905 6.71547 20.2839 6.40973 19.9076 6.21799C19.4798 6 18.9201 6 17.8 6H12M3 6H12M3 6C3 4.89543 3.89543 4 5 4H8.67452C9.1637 4 9.40886 4 9.63904 4.05526C9.84311 4.10425 10.0379 4.18526 10.2168 4.29492C10.4186 4.41857 10.5918 4.59182 10.9375 4.9375L12 6"
          stroke={shadeHex(color, FOLDER_SHADE)}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Centered in the folder body (y 6–20 of 24) */}
      <div className="absolute flex items-center justify-center" style={{ left: 6, top: 7.5, width: 12, height: 12 }}>
        {icon && icon !== failedSrc ? (
          <img src={icon} alt="" draggable={false} className="w-[11px] h-[11px] object-contain" onError={() => setFailedSrc(icon)} />
        ) : (
          // Neutral letters: brand-colored ones on the tinted folder would mimic the vendor's icon
          <span className="font-bold leading-none select-none" style={{ fontSize: 7, color: SOFTWARE_BADGE.color }}>{meta.abbr}</span>
        )}
      </div>
    </div>
  );
};

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
  /** Files: last modified, ms (from get_folder_structure); image thumbnails are cached against it */
  modified?: number;
  isVersionGroup?: boolean;
  versions?: FileNode[];
  versionCount?: number;
}

interface TreeViewProps {
  project: any;
  showHidden: boolean;
  onToggleHidden: () => void;
}

const AUTO_HIDDEN_NAMES = ['backup', '_attachments'];

// Software folders, by exact lowercase folder name (get_software_folder_name in Rust). Exact on purpose:
// normalizeSoftwareName would also turn a user's "UE" or "Substance Designer" folder into a software folder
const SOFTWARE_FOLDER_KEYS: Record<string, SoftwareName> = {
  blender: 'blender',
  houdini: 'houdini',
  maya: 'maya',
  aftereffects: 'after-effects',
  photoshop: 'photoshop',
  cinema4d: 'cinema4d',
  substance: 'substance',
  unrealengine: 'unreal',
  unity: 'unity',
  zbrush: 'zbrush',
  marmoset: 'marmoset',
  davinci: 'davinci',
};

const PROJECT_FILE_EXTENSIONS = [
  'blend', 'hip', 'hiplc', 'hipnc',
  'ma', 'mb', 'aep', 'psd', 'psb',
  'c4d', 'spp', 'uproject', 'unity',
  'zpr', 'tbscene', 'drp'
];

const getSoftwareDirName = (software: string): string => {
  switch (software.toLowerCase()) {
    case 'blender': return 'Blender';
    case 'houdini': return 'Houdini';
    case 'maya': return 'Maya';
    case 'after-effects':
    case 'after effects': return 'AfterEffects';
    case 'photoshop': return 'Photoshop';
    case 'cinema4d':
    case 'cinema 4d': return 'Cinema4D';
    case 'substance':
    case 'substance painter': return 'Substance';
    case 'unreal':
    case 'unreal engine': return 'UnrealEngine';
    case 'unity': return 'Unity';
    case 'zbrush': return 'ZBrush';
    case 'marmoset':
    case 'marmoset toolbag': return 'Marmoset';
    default: return software;
  }
};


const normPath = (p: string) => p.replace(/\\/g, '/').toLowerCase();

const EXTENSION_ICONS: Record<string, React.ReactNode> = {
  py:   <IconBrandPython className="w-4 h-4 text-blue-400 flex-shrink-0" stroke={1.5} />,
  jsx:  <IconBrandReact  className="w-4 h-4 text-cyan-400 flex-shrink-0" stroke={1.5} />,
  tsx:  <IconBrandReact  className="w-4 h-4 text-cyan-400 flex-shrink-0" stroke={1.5} />,
  bat:  <IconTerminal2   className="w-4 h-4 text-yellow-400 flex-shrink-0" stroke={1.5} />,
  sh:   <IconTerminal2   className="w-4 h-4 text-yellow-400 flex-shrink-0" stroke={1.5} />,
  exe:  <IconPackage     className="w-4 h-4 text-zinc-400 flex-shrink-0" stroke={1.5} />,
  zip:  <IconFileZip     className="w-4 h-4 text-amber-400 flex-shrink-0" stroke={1.5} />,
  rar:  <IconFileZip     className="w-4 h-4 text-amber-400 flex-shrink-0" stroke={1.5} />,
  '7z': <IconFileZip     className="w-4 h-4 text-amber-400 flex-shrink-0" stroke={1.5} />,
  tar:  <IconFileZip     className="w-4 h-4 text-amber-400 flex-shrink-0" stroke={1.5} />,
  gz:   <IconFileZip     className="w-4 h-4 text-amber-400 flex-shrink-0" stroke={1.5} />,
  txt:  <IconFileText    className="w-4 h-4 text-zinc-400 flex-shrink-0" stroke={1.5} />,
  pdf:  <IconPdf         className="w-4 h-4 text-red-400 flex-shrink-0" stroke={1.5} />,
  jpg:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  jpeg: <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  png:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  gif:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  webp: <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  bmp:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  svg:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  tiff: <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  tif:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  ico:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  mp4:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  mov:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  avi:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  mkv:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  webm: <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  flv:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  wmv:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  m4v:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
};

function getExtensionIcon(fileName: string): React.ReactNode | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_ICONS[ext] ?? null;
}

export function TreeView({ project, showHidden, onToggleHidden }: TreeViewProps) {
  const { activeMenu, setActiveMenu } = useContextMenuStore();
  // Drag a file out into Explorer, Discord, … (files only, not folders)
  const startFileDrag = useFileDragOut();
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
  const [explicitlyShownPaths, setExplicitlyShownPaths] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`explicitlyShownPaths_${project.path}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (error) {
      console.error('Failed to load explicitly shown paths from localStorage:', error);
      return new Set();
    }
  });
  const [autoHideProjectFiles, setAutoHideProjectFiles] = useState(() => {
    const saved = localStorage.getItem('autoHideProjectFiles');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [expandedVersionGroups, setExpandedVersionGroups] = useState<Set<string>>(new Set());
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Context menu using centralized hook
  const { isOpen: isContextMenuOpen, position: contextMenuPosition, data: contextMenuNode, openMenu: openContextMenu, closeMenu: closeContextMenu } = useContextMenu<FileNode>();
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
  const treeRequestRef = useRef(0);
  const sizeRequestRef = useRef(0);
  const treeOwnerRef = useRef<string | null>(null); // Project of the tree on screen, null when it's empty
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

  // Save explicitly shown paths to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(`explicitlyShownPaths_${project.path}`, JSON.stringify([...explicitlyShownPaths]));
    } catch (error) {
      console.error('Failed to save explicitly shown paths to localStorage:', error);
    }
  }, [explicitlyShownPaths, project.path]);

  // Save folder colors to localStorage whenever they change
  useEffect(() => {
    try {
      const colorsArray = Array.from(folderColors.entries());
      localStorage.setItem(`folderColors_${project.path}`, JSON.stringify(colorsArray));
    } catch (error) {
      console.error('Failed to save folder colors to localStorage:', error);
    }
  }, [folderColors, project.path]);

  // Image thumbnails in place of the file icon + a preview on hover (Settings > Appearance)
  const [treeImagePreviews, setTreeImagePreviews] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('treeImagePreviews');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const imagePreview = useHoverPreview<{ name: string; path: string; modified?: number }>();
  const hideImagePreview = imagePreview.hide;
  useEffect(() => {
    if (!treeImagePreviews) hideImagePreview();
  }, [treeImagePreviews, hideImagePreview]);

  // Thumbnails load only for rows on screen: observed against the tree's own scroll element
  const simpleBarRef = useRef<any>(null);
  const [thumbRoot, setThumbRoot] = useState<Element | null>(null);
  useEffect(() => {
    const element: Element | null = simpleBarRef.current?.getScrollElement?.() ?? null;
    setThumbRoot(prev => (prev === element ? prev : element));
  });

  // Sync settings from SettingsPanel
  useEffect(() => {
    const handler = () => {
      const saved = localStorage.getItem('autoHideProjectFiles');
      setAutoHideProjectFiles(saved !== null ? JSON.parse(saved) : true);
      try {
        const previews = localStorage.getItem('treeImagePreviews');
        setTreeImagePreviews(previews !== null ? JSON.parse(previews) : true);
      } catch {
        setTreeImagePreviews(true);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Reset expanded version groups when project changes (auto-collapse stacks)
  useEffect(() => {
    setExpandedVersionGroups(new Set());
  }, [project.path]);

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
    try {
      const storedShown = localStorage.getItem(`explicitlyShownPaths_${project.path}`);
      setExplicitlyShownPaths(storedShown ? new Set(JSON.parse(storedShown)) : new Set());
    } catch (error) {
      console.error('Failed to load explicitly shown paths from localStorage:', error);
      setExplicitlyShownPaths(new Set());
    }
  }, [project.path]);

  // Update current project path ref when project changes
  useEffect(() => {
    currentProjectPathRef.current = project.path;
  }, [project.path]);

  // Close context menu when another menu opens
  useEffect(() => {
    if (activeMenu !== 'tree' && isContextMenuOpen) {
      closeContextMenu();
      setShowColorPicker(false);
    }
  }, [activeMenu, isContextMenuOpen, closeContextMenu]);

  // Compute highlighted paths based on selected scene/shot/special context
  const highlightedPaths = ((): Set<string> => {
    const paths = new Set<string>();
    const base = normPath(project.path.replace(/[/\\]+$/, ''));

    // Special context highlight (Assets / Compose) — no software dependency
    if (project.currentSpecialContextId) {
      const specialCtx = project.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId);
      if (specialCtx?.type === 'asset') paths.add(`${base}/_globalassets`);
      else if (specialCtx?.type === 'compose') paths.add(`${base}/_globalcompose`);
    }

    // Scene-level highlight — requires software
    if (!project.software?.length) return paths;
    const scene = project.scenes?.find((s: any) => s.id === project.currentSceneId);
    if (scene) {
      const sceneFolder = sanitizeFolderName(scene.name).toLowerCase();
      for (const sw of project.software) {
        const swDir = getSoftwareDirName(sw.name).toLowerCase();
        paths.add(`${base}/${swDir}/${sceneFolder}`);
      }
    }

    return paths;
  })();

  // Fade-out animation for paths that just lost their highlight
  const [fadingOutPaths, setFadingOutPaths] = useState<Set<string>>(new Set());
  const prevHighlightedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const prev = prevHighlightedRef.current;
    const removed = [...prev].filter(p => !highlightedPaths.has(p));
    prevHighlightedRef.current = highlightedPaths;
    if (removed.length > 0) {
      setFadingOutPaths(s => new Set([...s, ...removed]));
      const timer = setTimeout(() => {
        setFadingOutPaths(s => {
          const next = new Set(s);
          removed.forEach(p => next.delete(p));
          return next;
        });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [project.currentSceneId, project.currentSpecialContextId]);

  // Group versioned files into stacks
  const groupVersionsInTree = (nodes: FileNode[]): FileNode[] => {
    const groups = new Map<string, FileNode>();
    return nodes.map(node => {
      if (node.is_dir && node.children) {
        // Recursively process directories
        return {
          ...node,
          children: groupVersionsInTree(node.children)
        };
      }
      return node;
    }).reduce((acc: FileNode[], node) => {
      // Only group files, not directories
      if (!node.is_dir && isVersioned(node.name)) {
        // Extract base name (without version and extension)
        const baseName = node.name.replace(/_v\d+\.[^.]+$/, '');

        // Find existing group for exactly this base name ("a" and "a_b" are different stacks)
        const group = groups.get(baseName);

        if (group) {
          // Add to existing group
          group.versions = [...(group.versions || []), node];
          group.versionCount = group.versions.length;
          // Update group name with new count
          group.name = `${baseName} (${group.versionCount} versions)`;
          // Sort versions by version number descending (newest first)
          group.versions.sort((a, b) => {
            const versionA = parseInt((extractVersion(a.name) || '0').toString(), 10);
            const versionB = parseInt((extractVersion(b.name) || '0').toString(), 10);
            return versionB - versionA;
          });
        } else {
          // Create new group (will be converted back to single file if only 1 version)
          const newGroup: FileNode = {
            name: `${baseName} (1 version)`,
            path: node.path,
            is_dir: false,
            isVersionGroup: true,
            versions: [node],
            versionCount: 1
          };
          groups.set(baseName, newGroup);
          acc.push(newGroup);
        }
      } else {
        // Non-versioned file or directory
        acc.push(node);
      }
      return acc;
    }, []).flatMap(node => {
      // Post-process: Convert single-version groups back to regular files
      if (node.isVersionGroup && node.versionCount === 1 && node.versions) {
        return node.versions[0]; // Return the single file instead of the group
      }
      return node;
    });
  };

  const showTree = (projectPath: string, nodes: FileNode[]) => {
    treeOwnerRef.current = nodes.length > 0 ? projectPath : null;
    setTree(nodes);
  };

  const loadTree = async () => {
    const requestId = ++treeRequestRef.current;

    // Clear any existing timer first: a request it belongs to is now outdated and won't clear it
    if (loadingTimerRef.current !== null) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }

    // Serve from cache immediately if available
    const projectPath = currentProjectPathRef.current;
    const cached = cacheGet(treeStructureCache, projectPath);
    if (cached) {
      showTree(projectPath, cached);
      setLoading(false);
      return;
    }

    // Remember if this is first load before changing the flag
    const isFirstLoad = isFirstLoadRef.current;

    // Only show loading state for first load or after 300ms delay
    if (isFirstLoad) {
      setLoading(true);
      isFirstLoadRef.current = false;
    } else if (treeOwnerRef.current !== projectPath) {
      // Set a delayed loading state to prevent flickering on updates.
      // A tree of this project stays on screen (with its scroll position) until the new one is ready
      loadingTimerRef.current = window.setTimeout(() => {
        setLoading(true);
        loadingTimerRef.current = null;
      }, 300);
    }

    const generation = treeCacheGeneration(projectPath);

    try {
      const result = await invoke<FileNode[]>('get_folder_structure', { path: projectPath });

      // A newer load (or another project) took over while this one was reading
      if (requestId !== treeRequestRef.current) {
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

      // Group versioned files into stacks
      const groupedResult = groupVersionsInTree(filteredResult);

      // Clear the loading timer if it hasn't fired yet
      if (loadingTimerRef.current !== null) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }

      // Cache the processed result and update state
      if (generation === treeCacheGeneration(projectPath)) {
        cacheSet(treeStructureCache, projectPath, groupedResult);
      }
      showTree(projectPath, groupedResult);

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
      if (requestId !== treeRequestRef.current) {
        return;
      }
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
    let aborted = false;
    let unlisten: (() => void) | undefined;

    listen('version-changed', () => {
      invalidateTreeCache(project.path);
      debouncedReload();
    }).then((fn) => {
      if (aborted) fn(); // already unmounted — clean up immediately
      else unlisten = fn;
    });

    return () => {
      aborted = true;
      unlisten?.();
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
      invalidateTreeCache(project.path);
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
      invalidateTreeCache(project.path);
      debouncedReload();
    };

    const handleRefreshAll = () => {
      invalidateTreeCache(project.path);
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
    const requestId = ++sizeRequestRef.current;

    // Clear any existing timer first: a request it belongs to is now outdated and won't clear it
    if (loadingSizeTimerRef.current !== null) {
      clearTimeout(loadingSizeTimerRef.current);
      loadingSizeTimerRef.current = null;
    }

    // Serve from cache immediately if available
    const projectPath = currentProjectPathRef.current;
    const cachedSize = cacheGet(treeSizeCache, projectPath);
    if (cachedSize !== null) {
      setDirectorySize(cachedSize);
      setLoadingSize(false);
      return;
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

    const generation = treeCacheGeneration(projectPath);

    try {
      const size = await invoke<number>('get_directory_size', { path: projectPath });

      // A newer request (or another project) took over while this one was reading
      if (requestId !== sizeRequestRef.current) {
        return;
      }

      // Clear the loading timer if it hasn't fired yet
      if (loadingSizeTimerRef.current !== null) {
        clearTimeout(loadingSizeTimerRef.current);
        loadingSizeTimerRef.current = null;
      }

      if (generation === treeCacheGeneration(projectPath)) {
        cacheSet(treeSizeCache, projectPath, size);
      }
      setDirectorySize(size);
      setLoadingSize(false);
    } catch (error) {
      console.error('Failed to load directory size:', error);
      if (requestId !== sizeRequestRef.current) {
        return;
      }
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
      // A manual rescan always reads the disk: files created outside the app don't invalidate the cache
      invalidateTreeCache(currentProjectPathRef.current);
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

        // .drp snapshots are imported by RayHub's menu script in Resolve, never opened by file association
        if (ext === 'drp') {
          await openResolveVersion(project, node.path);
          return;
        }

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
          // .sbs (Substance Designer) is intentionally absent: the 'substance' key is Painter,
          // so it opens with the default application instead of launching Painter
          'spp': { name: 'Substance Painter', key: 'substance' },
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

        // Get executable path: per-project → global → stored in object
        const projectPaths: Record<string, string> = JSON.parse(
          localStorage.getItem(`projectSoftwarePaths_${project.id}`) || '{}'
        );
        let executablePath: string | undefined = projectPaths[softwareMapping.key];
        if (!executablePath) {
          const savedPaths = localStorage.getItem('softwarePaths');
          if (savedPaths) {
            const paths = JSON.parse(savedPaths);
            executablePath = paths[softwareMapping.key];
          }
        }
        if (!executablePath) {
          executablePath = softwareInfo.path || softwareInfo.executable_path || softwareInfo.executablePath;
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

  const toggleHidden = (path: string, nodeName: string) => {
    const isAutoHiddenDir = AUTO_HIDDEN_NAMES.includes(nodeName.toLowerCase());
    const ext = nodeName.split('.').pop()?.toLowerCase() ?? '';
    const isAutoHiddenFile = autoHideProjectFiles && PROJECT_FILE_EXTENSIONS.includes(ext);
    const isAutoManaged = isAutoHiddenDir || isAutoHiddenFile;

    const currentlyHidden = hiddenPaths.has(path) ||
      (isAutoManaged && !explicitlyShownPaths.has(path));

    if (isAutoManaged) {
      // Clean up manual hide if exists (edge case: was manually hidden before setting was enabled)
      if (hiddenPaths.has(path)) {
        setHiddenPaths(prev => { const s = new Set(prev); s.delete(path); return s; });
      }
      setExplicitlyShownPaths(prev => {
        const s = new Set(prev);
        if (currentlyHidden) s.add(path); else s.delete(path);
        return s;
      });
    } else {
      setHiddenPaths(prev => {
        const s = new Set(prev);
        if (s.has(path)) s.delete(path); else s.add(path);
        return s;
      });
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    setActiveMenu('tree');
    openContextMenu(e, node);
    setShowColorPicker(false);
  }, [setActiveMenu, openContextMenu]);

  const copyPath = useCallback(async (path: string) => {
    try {
      await writeText(path);
      setCopiedPath(path);
      // Reset after 2 seconds
      setTimeout(() => setCopiedPath(null), 2000);
      closeContextMenu();
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  }, [closeContextMenu]);

  const openInExplorerHandler = useCallback((path: string) => {
    const { openInExplorer } = useProjectStore.getState();
    openInExplorer(path);
    closeContextMenu();
  }, [closeContextMenu]);

  const revealInExplorerHandler = useCallback(async (path: string) => {
    try {
      await invoke('reveal_in_explorer', { path });
    } catch (error) {
      console.error('Failed to reveal in explorer:', error);
    }
    closeContextMenu();
  }, [closeContextMenu]);

  const handleSetFolderColor = useCallback((path: string, color: string) => {
    setFolderColors(prev => {
      const newMap = new Map(prev);
      newMap.set(path, color);
      return newMap;
    });
    closeContextMenu();
    setShowColorPicker(false);
  }, [closeContextMenu]);

  const handleRemoveFolderColor = useCallback((path: string) => {
    setFolderColors(prev => {
      const newMap = new Map(prev);
      newMap.delete(path);
      return newMap;
    });
    closeContextMenu();
    setShowColorPicker(false);
  }, [closeContextMenu]);

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
      case 'hiplc':
      case 'hipnc':
        return 'Houdini';
      case 'ma':
      case 'mb':
        return 'Maya';
      case 'c4d':
        return 'Cinema 4D';
      case 'spp':
        return 'Substance Painter';
      case 'uproject':
        return 'Unreal Engine';
      case 'unity':
        return 'Unity';
      case 'zpr':
        return 'ZBrush';
      case 'tbscene':
        return 'Marmoset';
      case 'drp':
        return 'DaVinci Resolve';
      default:
        return null;
    }
  };

  // For folders without a custom icon, returns null
  const getSoftwareFolderKey = (folderName: string): SoftwareName | null => SOFTWARE_FOLDER_KEYS[folderName.toLowerCase()] ?? null;

  const toggleVersionGroup = (groupPath: string) => {
    setExpandedVersionGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupPath)) {
        newSet.delete(groupPath);
      } else {
        newSet.add(groupPath);
      }
      return newSet;
    });
  };

  /** Icon slot of a file: the image's thumbnail when previews are on, the usual icon otherwise / until ready */
  const fileIconSlot = (file: FileNode, active: boolean, icon: React.ReactNode) =>
    treeImagePreviews && isThumbnailImage(file.name)
      ? <TreeThumb path={file.path} modified={file.modified} active={active} fallback={icon} />
      : icon;

  /** Hover preview of an image file row */
  const imagePreviewHandlers = (file: FileNode | undefined) =>
    file && treeImagePreviews && isThumbnailImage(file.name)
      ? {
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) =>
            imagePreview.show(e.currentTarget, { name: file.name, path: file.path, modified: file.modified }),
          onMouseLeave: imagePreview.hide,
        }
      : {};

  const renderVersionGroup = (node: FileNode, depth: number = 0, ancestorsOpen: boolean = true) => {
    const isExpanded = expandedVersionGroups.has(node.path);
    const topThree = (node.versions || []).slice(0, 3);
    const isGroupHidden = hiddenPaths.has(node.path);
    if (isGroupHidden && !showHidden) return null;

    // Calculate version range
    const getVersionRange = () => {
      if (!node.versions || node.versions.length === 0) return '';

      const versions = node.versions
        .map(v => extractVersion(v.name))
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);

      if (versions.length === 0) return '';

      const minVersion = versions[0];
      const maxVersion = versions[versions.length - 1];

      // Get base name (without version)
      const baseName = node.versions[0].name.replace(/_v\d+\.[^.]+$/, '');

      // If only one version, show single version number
      if (minVersion === maxVersion) {
        return `${baseName} (v${String(minVersion).padStart(3, '0')})`;
      }

      // Multiple versions: show range
      return `${baseName} (v${String(minVersion).padStart(3, '0')}-v${String(maxVersion).padStart(3, '0')})`;
    };

    if (isExpanded) {
      // Expanded: Show all versions as separate cards
      return (
        <div
          key={node.path}
          style={{ marginLeft: depth > 0 ? '12px' : '0' }}
          className={isGroupHidden ? 'opacity-40' : ''}
        >
          {/* All versions as cards */}
          <div className="space-y-1">
            {node.versions?.map((version) => (
              <div
                key={version.path}
                className="h-[36px] flex items-center gap-2 px-2.5 text-xs select-none bg-card-bg border border-border-primary rounded-badge hover:bg-hover-bg hover:border-border-secondary cursor-pointer"
                onDoubleClick={(e) => handleDoubleClick(e, version)}
                onContextMenu={(e) => handleContextMenu(e, version)}
                onMouseDown={(e) => startFileDrag(e, version.path)}
                {...imagePreviewHandlers(version)}
              >
                <div className="w-[18px] flex items-center justify-center flex-shrink-0">
                  {fileIconSlot(version, ancestorsOpen, getFileIcon(version.name) ? (
                    <SoftwareIcon name={getFileIcon(version.name)!} className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    getExtensionIcon(version.name) ?? <IconFile className="w-4 h-4 text-text-secondary flex-shrink-0" stroke={1.5} />
                  ))}
                </div>
                <span className="text-text-primary font-medium flex-1">
                  {version.name.substring(0, version.name.lastIndexOf('.'))}
                </span>
              </div>
            ))}
          </div>
          {/* Collapse button */}
          <div className="flex items-center gap-2 px-2.5 py-2 text-xs select-none">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleVersionGroup(node.path);
              }}
              className="flex items-center gap-1 text-text-muted hover:text-white transition-colors"
            >
              <IconChevronRight className="w-3 h-3 -rotate-90 transition-transform duration-200" stroke={1.5} />
              <span>Collapse ({node.versionCount})</span>
            </button>
            {isGroupHidden && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleHidden(node.path, node.name); }}
                className="ml-auto p-1 hover:bg-zinc-700 rounded"
                title="Show"
              >
                <IconEye className="w-3 h-3 text-zinc-400" stroke={1.5} />
              </button>
            )}
          </div>
        </div>
      );
    }

    // Collapsed: Show stacked visual (3 separate cards)
    const stackOffset = 10; // offset between cards in pixels
    // Use consistent padding for all groups: middle card offset + small buffer (2px for hover)
    const maxOffset = topThree[2]
      ? stackOffset * 1.555 + 28 - 36   // ≈ 7.55px
      : topThree[1]
        ? stackOffset * 1.15 + 28 - 36  // = 3.5px
        : 0;

    return (
      <div
        key={node.path}
        style={{
          marginLeft: depth > 0 ? '12px' : '0',
          paddingBottom: maxOffset > 0 ? `${maxOffset}px` : '0'
        }}
        className={`relative cursor-pointer version-stack group ${isGroupHidden ? 'opacity-40' : ''}`}
        onClick={() => toggleVersionGroup(node.path)}
        onContextMenu={(e) => handleContextMenu(e, topThree[0])}
      >
        {/* Card 3 (bottom - oldest of top 3) */}
        {topThree[2] && (
          <div
            className="absolute left-1/2 -translate-x-1/2 h-[28px] bg-zinc-800/90 rounded border border-zinc-700 pointer-events-none flex items-center px-2.5 gap-2 stack-ghost-card transition-transform duration-200 group-hover:translate-y-0.5"
            style={{
              top: `${stackOffset * 1.555}px`,
              width: '96%',
              zIndex: 0
            }}
          >
            <div className="w-[18px] flex items-center justify-center flex-shrink-0">
              {getFileIcon(topThree[2].name) ? (
                <SoftwareIcon name={getFileIcon(topThree[2].name)!} className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
              ) : (
                getExtensionIcon(topThree[2].name) ?? <IconFile className="w-3.5 h-3.5 text-text-secondary flex-shrink-0 opacity-50" stroke={1.5} />
              )}
            </div>
            <span className="text-[11px] text-text-secondary opacity-70">
              {topThree[2].name.substring(0, topThree[2].name.lastIndexOf('.'))}
            </span>
          </div>
        )}

        {/* Card 2 (middle) */}
        {topThree[1] && (
          <div
            className="absolute left-1/2 -translate-x-1/2 h-[28px] bg-zinc-800/95 rounded border border-zinc-600 pointer-events-none flex items-center px-2.5 gap-2 shadow-md stack-ghost-card transition-transform duration-200 group-hover:translate-y-px"
            style={{
              top: `${stackOffset * 1.15}px`,
              width: '98%',
              zIndex: 1
            }}
          >
            <div className="w-[18px] flex items-center justify-center flex-shrink-0">
              {getFileIcon(topThree[1].name) ? (
                <SoftwareIcon name={getFileIcon(topThree[1].name)!} className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
              ) : (
                getExtensionIcon(topThree[1].name) ?? <IconFile className="w-3.5 h-3.5 text-text-secondary flex-shrink-0 opacity-70" stroke={1.5} />
              )}
            </div>
            <span className="text-[11px] text-text-secondary opacity-80">
              {topThree[1].name.substring(0, topThree[1].name.lastIndexOf('.'))}
            </span>
          </div>
        )}

        {/* Card 1 (top - newest) */}
        <div
          className="relative h-[36px] flex items-center gap-2 px-2.5 text-xs select-none bg-card-bg border border-border-primary rounded-badge hover:bg-hover-bg hover:border-border-secondary shadow-lg"
          style={{ zIndex: 10 }}
          {...imagePreviewHandlers(topThree[0])}
        >
          <div className="w-[18px] flex items-center justify-center flex-shrink-0">
            {(() => {
              const icon = topThree[0] && getFileIcon(topThree[0].name) ? (
                <SoftwareIcon name={getFileIcon(topThree[0].name)!} className="w-4 h-4 flex-shrink-0" />
              ) : (
                (topThree[0] && getExtensionIcon(topThree[0].name)) ?? <IconFile className="w-4 h-4 text-text-secondary flex-shrink-0" stroke={1.5} />
              );
              // The newest version: the group's own path is the oldest one
              return topThree[0] ? fileIconSlot(topThree[0], ancestorsOpen, icon) : icon;
            })()}
          </div>
          <span className="text-text-primary font-medium flex-1">
            {getVersionRange()}
          </span>
          <div className="relative w-[18px] h-[18px] flex-shrink-0">
            <div className="absolute inset-0 bg-zinc-800 text-zinc-400 text-[9px] font-bold rounded-full flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0">
              {node.versionCount}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleHidden(node.path, node.name);
              }}
              className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-150 hover:bg-zinc-700 rounded-full flex items-center justify-center"
              title={isGroupHidden ? "Show" : "Hide"}
            >
              {isGroupHidden ? (
                <IconEye className="w-3 h-3 text-zinc-400" stroke={1.5} />
              ) : (
                <IconEyeOff className="w-3 h-3 text-zinc-400" stroke={1.5} />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ancestorsOpen: every parent folder is expanded. Rows of a collapsed folder stay mounted (at zero
  // height, for the expand animation), so thumbnails there must not load
  const renderNode = (node: FileNode, depth: number = 0, ancestorsOpen: boolean = true) => {
    // Handle version groups
    if (node.isVersionGroup) {
      const versionExt = node.versions?.[0]?.name.split('.').pop()?.toLowerCase() ?? '';
      const isVersionGroupHidden = autoHideProjectFiles && PROJECT_FILE_EXTENSIONS.includes(versionExt);
      if (isVersionGroupHidden && !showHidden) return null;
      if (isVersionGroupHidden && showHidden) {
        return <div key={node.path} className="opacity-40">{renderVersionGroup(node, depth, ancestorsOpen)}</div>;
      }
      return renderVersionGroup(node, depth, ancestorsOpen);
    }

    const isExpanded = expandedDirs.has(node.path);
    const hasChildren = node.children && node.children.length > 0;
    const fileIcon = !node.is_dir ? getFileIcon(node.name) : null;
    const softwareFolderKey = node.is_dir ? getSoftwareFolderKey(node.name) : null;
    const fileExt = !node.is_dir ? node.name.split('.').pop()?.toLowerCase() ?? '' : '';
    const isAutoHiddenFile = !node.is_dir && autoHideProjectFiles && PROJECT_FILE_EXTENSIONS.includes(fileExt);
    const isHidden = hiddenPaths.has(node.path) ||
      (node.is_dir && AUTO_HIDDEN_NAMES.includes(node.name.toLowerCase()) && !explicitlyShownPaths.has(node.path)) ||
      (isAutoHiddenFile && !explicitlyShownPaths.has(node.path));
    const isHighlighted = node.is_dir && highlightedPaths.has(normPath(node.path));
    const isFadingOut = node.is_dir && !isHighlighted && fadingOutPaths.has(normPath(node.path));
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

    // Skip rendering hidden items when showHidden is false
    if (isHidden && !showHidden) {
      return null;
    }

    return (
      <div
        key={node.path}
        style={{ marginLeft: depth > 0 ? '12px' : '0' }}
        className={`transition-opacity duration-150 ${isHidden ? 'opacity-40' : 'opacity-100'}`}
      >
        <div
          className={`flex items-center gap-2 px-2.5 py-2 text-xs select-none group transition-all cursor-pointer ${node.is_dir
              ? `bg-card-bg border border-border-primary rounded-badge hover:bg-hover-bg hover:border-border-secondary ${isExpanded ? 'bg-hover-bg border-border-secondary' : ''} ${isHighlighted ? 'folder-highlighted' : isFadingOut ? 'folder-highlighted-out' : ''}`
              : 'bg-card-bg border border-border-primary rounded-badge hover:bg-hover-bg hover:border-border-secondary'
            }`}
          onDoubleClick={(e) => handleDoubleClick(e, node)}
          onContextMenu={(e) => handleContextMenu(e, node)}
          onMouseDown={node.is_dir ? undefined : (e) => startFileDrag(e, node.path)}
          {...(node.is_dir ? {} : imagePreviewHandlers(node))}
        >
          {/* Icon */}
          {node.is_dir ? (
            softwareFolderKey ? (
              // Brand color unless the user set a folder color
              <SoftwareFolderIcon
                softwareKey={softwareFolderKey}
                color={folderColor || getSoftwareMeta(softwareFolderKey).brandColor}
              />
            ) : (
              <div className="w-[18px] flex items-center justify-center flex-shrink-0">
                <FolderIcon color={folderColor || '#a1a1aa'} />
              </div>
            )
          ) : (
            <div className="w-[18px] flex items-center justify-center flex-shrink-0">
              {fileIconSlot(node, ancestorsOpen, fileIcon ? (
                <SoftwareIcon name={fileIcon} className="w-4 h-4 flex-shrink-0" />
              ) : (
                getExtensionIcon(node.name) ?? <IconFile className="w-4 h-4 text-text-secondary flex-shrink-0" stroke={1.5} />
              ))}
            </div>
          )}

          {/* Name */}
          <span className={`truncate flex-1 text-text-primary ${node.is_dir ? 'font-medium' : ''}`}>{displayName}</span>

          {/* Right side: Hide button + Chevron */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleHidden(node.path, node.name);
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
            className={`grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows,opacity] duration-150 ease-out motion-reduce:transition-none ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
          >
            {/* 2px of room below without moving the layout: a version stack's back card shifts down on hover */}
            <div className="overflow-hidden pb-0.5 -mb-0.5">
              {/* The gap lives inside the clipped box so it collapses together with the rows */}
              <div className="flex flex-col gap-1 pt-1">
                {node.children.map(child => renderNode(child, depth + 1, ancestorsOpen && isExpanded))}
              </div>
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

      <SimpleBar ref={simpleBarRef} className="custom-scrollbar" autoHide={false} style={{ height: 'calc(100% - 40px)', paddingBottom: '45px' }}>
        <ThumbObserverProvider root={thumbRoot}>
        <div className="flex flex-col pr-2">
          {tree.length > 0 ? (
            <>
              {/* Normal items (without underscore) */}
              <div className="flex flex-col gap-1">
                {normalItems.map(node => renderNode(node))}
              </div>

              {/* Separator between normal and underscore items */}
              {normalItems.length > 0 && underscoreItems.length > 0 && (showHidden || underscoreItems.some(n =>
                !hiddenPaths.has(n.path) &&
                !(n.is_dir && AUTO_HIDDEN_NAMES.includes(n.name.toLowerCase()) && !explicitlyShownPaths.has(n.path))
              )) && (
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
        </ThumbObserverProvider>
      </SimpleBar>

      {/* Image preview on hover: only once the row's thumbnail is loaded */}
      {imagePreview.shown && (() => {
        const { item, anchor } = imagePreview.shown;
        const thumb = getCachedThumbnail(item.path, item.modified);
        if (!thumb) return null;
        // The picture keeps the image's proportions (no bars): up to 224 wide or 224 tall;
        // the popup is never narrower than its caption needs
        const MAX_SIDE = 224;
        const ratio = thumb.width > 0 && thumb.height > 0 ? thumb.width / thumb.height : 1;
        const imageW = Math.round(ratio >= 1 ? MAX_SIDE : MAX_SIDE * ratio);
        const imageH = Math.round(ratio >= 1 ? MAX_SIDE / ratio : MAX_SIDE);
        const popupW = Math.max(imageW, 184) + 16; // p-2 on both sides
        return (
          <HoverPreviewPopup anchor={anchor} visible={imagePreview.visible} width={popupW} height={imageH + 16 + 22}>
            <img
              src={thumb.data_url}
              alt=""
              draggable={false}
              className="block mx-auto rounded-[7px] object-cover"
              style={{ width: imageW, height: imageH }}
            />
            <div className="flex items-center justify-between gap-2 mt-1.5 px-0.5">
              <span className="text-[10px] font-mono text-text-secondary truncate">{item.name}</span>
              <span className="text-[10px] text-text-muted flex-shrink-0">
                {thumb.width}×{thumb.height} · {formatSize(thumb.size)}
              </span>
            </div>
          </HoverPreviewPopup>
        );
      })()}

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
              className="hover:bg-hover-bg rounded transition-colors group"
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
      <ContextMenu
        isOpen={isContextMenuOpen}
        position={contextMenuPosition}
        onClose={() => {
          closeContextMenu();
          setShowColorPicker(false);
          setActiveMenu(null);
        }}
        menuId="tree"
      >
        <ContextMenuItem
          icon={<IconFolderOpen className="w-4 h-4" stroke={1.5} />}
          onClick={() => contextMenuNode && (contextMenuNode.is_dir
            ? openInExplorerHandler(contextMenuNode.path)
            : revealInExplorerHandler(contextMenuNode.path)
          )}
        >
          {contextMenuNode?.is_dir ? 'Open in Explorer' : 'Reveal in Explorer'}
        </ContextMenuItem>
        <ContextMenuItem
          icon={copiedPath === contextMenuNode?.path
            ? <IconCircleCheck className="w-4 h-4 text-status-active" stroke={1.5} />
            : <IconCopy className="w-4 h-4" stroke={1.5} />
          }
          onClick={() => contextMenuNode && copyPath(contextMenuNode.path)}
        >
          {copiedPath === contextMenuNode?.path ? (
            <span className="text-status-active">Path Copied</span>
          ) : (
            'Copy Path'
          )}
        </ContextMenuItem>
        {/* Every folder, software ones included: their color replaces the brand tint, Clear brings it back */}
        {contextMenuNode?.is_dir && (
          <>
            <ContextMenuDivider />
            <ContextMenuItem
              icon={<IconPalette className="w-4 h-4" stroke={1.5} />}
              onClick={() => setShowColorPicker(!showColorPicker)}
            >
              Set Color
            </ContextMenuItem>
          </>
        )}
        {showColorPicker && contextMenuNode?.is_dir && (
          <ContextMenuColorPicker
            colors={FOLDER_COLORS}
            label="Set Color"
            onSelect={(color: string) => handleSetFolderColor(contextMenuNode.path, color)}
            onClear={folderColors.has(contextMenuNode.path) ? () => handleRemoveFolderColor(contextMenuNode.path) : undefined}
          />
        )}

      </ContextMenu>
    </div>
  );
}
