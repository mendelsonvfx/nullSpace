import { useEffect, useState, useRef, useMemo } from 'react';
import { Plus, Folder, Search, ExternalLink, FolderOpen, X, Settings, Check, Star, Archive, Grid3x3, CreditCard, FolderTree, ChevronRight, ChevronDown, File, Pin, Trash2, Circle, DollarSign, User, Filter, Minus, Square, Link as LinkIcon, Pencil, Eye, EyeOff, MessageSquare, Image } from 'lucide-react';
import { invoke, convertFileSrc } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { selectProjectDirectory } from './utils/tauri';
import { useProjectStore } from './store/projectStore';
import { SettingsPanel } from './components/SettingsPanel';
import { FeedbackPanel } from './components/FeedbackPanel';
import { MDXEditor, headingsPlugin, listsPlugin, quotePlugin, thematicBreakPlugin, markdownShortcutPlugin, linkPlugin, linkDialogPlugin, codeBlockPlugin, codeMirrorPlugin, toolbarPlugin, UndoRedo, BoldItalicUnderlineToggles, BlockTypeSelect, CreateLink, InsertCodeBlock, ListsToggle } from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { SoftwareIcon } from './components/SoftwareIcon';
import { ThumbnailImage } from './components/ThumbnailImage';
import { ProjectCard } from './components/ProjectCard';
import { appWindow } from '@tauri-apps/api/window';
import { DeadlineNotification } from './components/DeadlineNotification';
import { useThumbnail } from './hooks/useThumbnail';
import { CategoryTabs } from './components/CategoryTabs';
import { WelcomeSetup } from './components/WelcomeSetup';
import { getCurrentRates, getManualRates, getRateMode, getCachedRatesSync } from './utils/exchangeRates';
import { versionsCache } from './utils/versionsCache';


// Helper function to darken color by percentage
function darkenColor(hex: string, percent: number): string {
  // Remove # if present
  hex = hex.replace('#', '');

  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Darken each channel
  const factor = 1 - (percent / 100);
  const newR = Math.round(r * factor);
  const newG = Math.round(g * factor);
  const newB = Math.round(b * factor);

  // Convert back to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

// Pie Chart Component
function PieChart({ data, title, id }: { data: Array<{ name: string; value: number; color: string }>; title?: string; id?: string }) {
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const size = 200;
  const chartId = id || 'chart';
  const center = size / 2;
  const outerRadius = 80;
  const innerRadius = 50; // Donut hole

  let currentAngle = -90; // Start from top

  const slices = data.map((item) => {
    const percentage = (item.value / total) * 100;
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;

    currentAngle = endAngle;

    // Calculate slice path for donut
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1Outer = center + outerRadius * Math.cos(startRad);
    const y1Outer = center + outerRadius * Math.sin(startRad);
    const x2Outer = center + outerRadius * Math.cos(endRad);
    const y2Outer = center + outerRadius * Math.sin(endRad);

    const x1Inner = center + innerRadius * Math.cos(startRad);
    const y1Inner = center + innerRadius * Math.sin(startRad);
    const x2Inner = center + innerRadius * Math.cos(endRad);
    const y2Inner = center + innerRadius * Math.sin(endRad);

    const largeArcFlag = angle > 180 ? 1 : 0;

    const pathData = [
      `M ${x1Inner} ${y1Inner}`,
      `L ${x1Outer} ${y1Outer}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2Outer} ${y2Outer}`,
      `L ${x2Inner} ${y2Inner}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x1Inner} ${y1Inner}`,
      'Z'
    ].join(' ');

    return {
      path: pathData,
      color: item.color,
      name: item.name,
      percentage: percentage.toFixed(1)
    };
  });

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          {slices.map((slice, index) => {
            // Use smaller gradient radius for tighter gradient effect
            const gradientRadius = outerRadius * 0.7;
            const innerOffset = (innerRadius / gradientRadius) * 100;
            return (
              <radialGradient key={index} id={`gradient-${chartId}-${index}`} cx={center} cy={center} r={gradientRadius} gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#000000" stopOpacity="0.8" />
                <stop offset={`${innerOffset}%`} stopColor={slice.color} stopOpacity="0.4" />
                <stop offset="100%" stopColor={slice.color} stopOpacity="1" />
              </radialGradient>
            );
          })}
          <filter id={`glow-${chartId}`}>
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        {slices.map((slice, index) => (
          <path
            key={index}
            d={slice.path}
            fill={`url(#gradient-${chartId}-${index})`}
            stroke="rgba(24, 24, 27, 0.5)"
            strokeWidth="2"
            className="transition-all cursor-pointer"
            style={{
              filter: hoveredSlice === index ? `url(#glow-${chartId})` : 'none',
              opacity: hoveredSlice === index ? 1 : hoveredSlice !== null ? 0.6 : 1
            }}
            onMouseEnter={() => setHoveredSlice(index)}
            onMouseLeave={() => setHoveredSlice(null)}
          />
        ))}
      </svg>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none max-w-[80px]">
        {hoveredSlice !== null ? (
          <>
            <div className="text-white text-xs font-medium truncate">{slices[hoveredSlice].name}</div>
            <div className="text-zinc-400 text-xs">{slices[hoveredSlice].percentage}%</div>
          </>
        ) : title ? (
          <div className="text-zinc-400 text-xs font-medium whitespace-pre-line leading-tight">{title}</div>
        ) : null}
      </div>
    </div>
  );
}

type ProjectStatus = 'active' | 'archived' | 'completed' | 'paused';

const STATUS_COLORS = {
  active: 'bg-green-500',
  paused: 'bg-yellow-500',
  completed: 'bg-blue-500',
  archived: 'bg-gray-500'
};

const STATUS_LABELS = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived'
};

const STATUS_CYCLE: ProjectStatus[] = ['active', 'paused', 'completed'];

const SOFTWARE_OPTIONS = [
  'Blender', 'Houdini', 'After Effects',
  // 'Maya',
  // 'Cinema 4D', 'Substance', 'Unreal', 'Unity', 'ZBrush', 'Marmoset'
];

interface ProjectVersion {
  name: string;
  path: string;
  software: string[];
  created_at: number; // Unix timestamp in seconds
}

function LinkItem({ link, projectId, shotId }: { link: any; projectId: string; shotId?: string | null }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(link.title);

  const handleSave = () => {
    if (editedTitle.trim()) {
      if (shotId) {
        const { updateShotLink } = useProjectStore.getState();
        updateShotLink(projectId, shotId, link.id, editedTitle.trim());
      } else {
        const { updateLink } = useProjectStore.getState();
        updateLink(projectId, link.id, editedTitle.trim());
      }
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditedTitle(link.title);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-2">
        <LinkIcon className="w-4 h-4 text-accent flex-shrink-0" />
        <input
          type="text"
          value={editedTitle}
          onChange={(e) => setEditedTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          autoFocus
          className="flex-1 bg-transparent text-sm text-zinc-300 focus:outline-none"
        />
        <button
          onClick={handleSave}
          className="p-1 hover:bg-zinc-700 rounded transition-colors"
        >
          <Check className="w-3 h-3 text-green-500" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group bg-zinc-900 hover:bg-zinc-800 rounded-lg px-3 py-2 transition-colors">
      <button
        onClick={async () => {
          try {
            await invoke('open_url', { url: link.url });
          } catch (error) {
            console.error('Failed to open URL:', error);
          }
        }}
        className="flex items-center gap-2 flex-1 text-left"
        title={link.url}
      >
        <LinkIcon className="w-4 h-4 text-accent flex-shrink-0" />
        <span className="text-sm text-zinc-300 truncate">{link.title}</span>
      </button>
      <button
        onClick={() => setIsEditing(true)}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded transition-opacity"
        title="Edit title"
      >
        <Pencil className="w-3 h-3" />
      </button>
      <button
        onClick={() => {
          if (shotId) {
            const { removeShotLink } = useProjectStore.getState();
            removeShotLink(projectId, shotId, link.id);
          } else {
            const { removeLink } = useProjectStore.getState();
            removeLink(projectId, link.id);
          }
        }}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded transition-opacity"
        title="Remove link"
      >
        <X className="w-3 h-3 close-button-red" />
      </button>
    </div>
  );
}

function NotesSection({ project, context }: { project: any; context: any }) {
  const noteContent = context.notes && context.notes.length > 0 ? context.notes[0].content : '';
  const editorRef = useRef<any>(null);

  const handleNoteChange = (markdown: string) => {
    if (context.isShot && context.shotId) {
      const { addShotNote, updateShotNote } = useProjectStore.getState();
      if (context.notes && context.notes.length > 0) {
        updateShotNote(project.id, context.shotId, context.notes[0].id, markdown);
      } else {
        addShotNote(project.id, context.shotId, markdown);
      }
    } else {
      const { addNote, updateNote } = useProjectStore.getState();
      if (context.notes && context.notes.length > 0) {
        updateNote(project.id, context.notes[0].id, markdown);
      } else {
        addNote(project.id, markdown);
      }
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // Focus the editor when clicking anywhere in the container
    const target = e.target as HTMLElement;
    if (target.closest('[class*="_contentEditable"]')) {
      return; // Already clicked on the editor itself
    }

    // Find and focus the contentEditable element
    const editorElement = (e.currentTarget as HTMLElement).querySelector('[contenteditable="true"]') as HTMLElement;
    if (editorElement) {
      editorElement.focus();
    }
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Notes</h3>
      <div className="markdown-editor-container" onClick={handleContainerClick}>
        <MDXEditor
          ref={editorRef}
          markdown={noteContent}
          onChange={handleNoteChange}
          placeholder="Add notes..."
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            markdownShortcutPlugin(),
            linkPlugin(),
            linkDialogPlugin(),
            codeBlockPlugin({ defaultCodeBlockLanguage: 'js' }),
            codeMirrorPlugin({ codeBlockLanguages: { js: 'JavaScript', ts: 'TypeScript', css: 'CSS', python: 'Python', rust: 'Rust' } }),
            toolbarPlugin({
              toolbarContents: () => (
                <>
                  <UndoRedo />
                  <BoldItalicUnderlineToggles />
                  <BlockTypeSelect />
                  <CreateLink />
                  <InsertCodeBlock />
                  <ListsToggle />
                </>
              )
            })
          ]}
          contentEditableClassName="prose prose-invert prose-sm max-w-none"
        />
      </div>
    </div>
  );
}

function LinkInputForm({ projectId, shotId }: { projectId: string; shotId?: string | null }) {
  const [url, setUrl] = useState('');
  const lastProcessedClipboard = useRef('');
  const [isHovered, setIsHovered] = useState(false);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (e.target.value === '') {
      lastProcessedClipboard.current = '';
    }
  };

  const extractDomainName = (urlString: string): string => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.hostname;
    } catch {
      return urlString;
    }
  };

  const handleAddLink = async () => {
    const trimmedUrl = url.trim();

    if (!trimmedUrl || (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://'))) {
      return;
    }

    // Add link immediately with domain name
    const tempTitle = extractDomainName(trimmedUrl);
    let linkId: string;

    if (shotId) {
      const { addShotLink } = useProjectStore.getState();
      linkId = addShotLink(projectId, shotId, trimmedUrl, tempTitle);
    } else {
      const { addLink } = useProjectStore.getState();
      linkId = addLink(projectId, trimmedUrl, tempTitle);
    }

    // Clear input and reset clipboard tracking
    setUrl('');
    lastProcessedClipboard.current = '';

    // Fetch real title in background and update
    try {
      const fetchedTitle = await invoke<string>('fetch_page_title', { url: trimmedUrl });

      // Update the link with the fetched title
      if (shotId) {
        const { updateShotLink } = useProjectStore.getState();
        updateShotLink(projectId, shotId, linkId, fetchedTitle);
      } else {
        const { updateLink } = useProjectStore.getState();
        updateLink(projectId, linkId, fetchedTitle);
      }
    } catch (error) {
      console.error('Failed to fetch page title:', error);
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      // Check if Ctrl+V (or Cmd+V on Mac) is pressed while hovering
      // Use e.code to work regardless of keyboard layout
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && isHovered && url === '') {
        e.preventDefault();

        try {
          const clipboardText = await navigator.clipboard.readText();
          const trimmedText = clipboardText.trim();

          // Check if clipboard contains a valid URL
          if (trimmedText.startsWith('https://') ||
              trimmedText.startsWith('http://') ||
              trimmedText.startsWith('www.')) {

            // Prepare the final URL
            const finalUrl = trimmedText.startsWith('www.') ? `https://${trimmedText}` : trimmedText;

            // Automatically add the link
            const tempTitle = extractDomainName(finalUrl);
            let linkId: string;

            if (shotId) {
              const { addShotLink } = useProjectStore.getState();
              linkId = addShotLink(projectId, shotId, finalUrl, tempTitle);
            } else {
              const { addLink } = useProjectStore.getState();
              linkId = addLink(projectId, finalUrl, tempTitle);
            }

            lastProcessedClipboard.current = trimmedText;

            // Fetch real title in background
            try {
              const fetchedTitle = await invoke<string>('fetch_page_title', { url: finalUrl });
              if (shotId) {
                const { updateShotLink } = useProjectStore.getState();
                updateShotLink(projectId, shotId, linkId, fetchedTitle);
              } else {
                const { updateLink } = useProjectStore.getState();
                updateLink(projectId, linkId, fetchedTitle);
              }
            } catch (error) {
              console.error('Failed to fetch page title:', error);
            }
          }
        } catch (error) {
          console.error('Could not read clipboard:', error);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isHovered, url]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddLink();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text').trim();

    // Check if pasted text is a valid URL
    if (!pastedText.startsWith('https://') &&
        !pastedText.startsWith('http://') &&
        !pastedText.startsWith('www.')) {
      e.preventDefault(); // Don't paste if not a URL
      return;
    }

    // Allow default paste behavior for valid URLs
  };

  return (
    <div className="flex gap-2">
      <input
        type="url"
        placeholder="Paste URL..."
        value={url}
        onChange={handleUrlChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="flex-1 px-3 py-2 bg-transparent border border-zinc-700 border-dashed rounded-lg text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-accent focus:border-solid"
      />
      <button
        onClick={handleAddLink}
        disabled={!url.trim()}
        className="px-3 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Add Link"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

function VersionsOverview({ project, currentShot }: any) {
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
    const handleVersionUpdate = () => {
      console.log('Version update event received from launch');
      // Invalidate cache and reload
      versionsCache.invalidate(project.path);
      loadVersions(false, true);
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

function FinanceProjectDetails({
  project,
  projects,
  baseCurrency,
  convertToBaseCurrency,
  currencySymbols,
  totalRevenue,
  convertCurrency,
  onClose
}: {
  project: any;
  projects: any[];
  baseCurrency: string;
  convertToBaseCurrency: boolean;
  currencySymbols: Record<string, string>;
  totalRevenue: Record<string, number>;
  convertCurrency: (amount: number, from: string, to: string) => number;
  onClose: () => void;
}) {
  const { clients } = useProjectStore();

  const projectCurrency = project.currency || 'USD';
  const projectRevenue = project.cost || 0;

  // Конвертация если нужно
  const displayRevenue = convertToBaseCurrency && projectCurrency !== baseCurrency
    ? convertCurrency(projectRevenue, projectCurrency, baseCurrency)
    : projectRevenue;

  const displayCurrency = convertToBaseCurrency ? baseCurrency : projectCurrency;

  // Используем переданный totalRevenue вместо пересчета
  const totalRevenueInDisplayCurrency = totalRevenue[displayCurrency] || 0;

  // Процент от общего дохода (только если проект оплачен)
  const percentageOfTotal = project.paymentStatus === 'paid' && totalRevenueInDisplayCurrency > 0
    ? (displayRevenue / totalRevenueInDisplayCurrency) * 100
    : 0;

  // Доход от клиента
  let clientRevenue = 0;
  let clientProjectCount = 0;
  if (project.clientId) {
    projects.forEach(p => {
      if (p.clientId === project.clientId && p.paymentStatus === 'paid' && p.cost) {
        const amount = convertToBaseCurrency && p.currency !== baseCurrency
          ? convertCurrency(p.cost, p.currency || 'USD', baseCurrency)
          : p.cost;
        if (!convertToBaseCurrency && p.currency !== projectCurrency) return;
        clientRevenue += amount;
        clientProjectCount++;
      }
    });
  }

  const client = project.clientId ? clients.find(c => c.id === project.clientId) : null;

  const paymentStatusColors = {
    'paid': 'text-green-500',
    'prepaid': 'text-yellow-500',
    'unpaid': 'text-red-500'
  };

  const paymentStatusLabels = {
    'paid': 'Paid',
    'prepaid': 'Prepaid',
    'unpaid': 'Unpaid'
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold">{project.name}</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          title="Вернуться к обзору"
        >
          <X className="w-6 h-6 close-button-red" />
        </button>
      </div>

      {/* Main Revenue Card */}
      <div className={`bg-gradient-to-br ${project.paymentStatus === 'paid' ? 'from-green-900 to-green-800' : 'from-zinc-900 to-zinc-800'} rounded-2xl p-8 mb-6 border border-zinc-700`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-zinc-400 mb-2">Project Revenue</p>
            <p className={`text-6xl font-bold ${project.paymentStatus === 'paid' ? 'text-green-500' : 'text-zinc-400'}`}>
              {displayRevenue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurrency]}
            </p>
            {convertToBaseCurrency && projectCurrency !== baseCurrency && (
              <p className="text-sm text-zinc-500 mt-2">
                ({projectRevenue.toLocaleString()} {currencySymbols[projectCurrency]})
              </p>
            )}
          </div>
          <div className={`text-right ${paymentStatusColors[project.paymentStatus as keyof typeof paymentStatusColors]}`}>
            <p className="text-xs uppercase tracking-wide mb-1">Status</p>
            <p className="text-xl font-semibold">{paymentStatusLabels[project.paymentStatus as keyof typeof paymentStatusLabels] || 'N/A'}</p>
          </div>
        </div>

        {project.prepaymentAmount && (
          <div className="text-sm text-zinc-400 mt-4 pt-4 border-t border-zinc-400">
            <span className="text-yellow-500">Prepayment:</span> {project.prepaymentAmount.toLocaleString()} {currencySymbols[projectCurrency]}
          </div>
        )}
      </div>

      {/* Infographics Grid */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Percentage of Total Revenue */}
        {project.paymentStatus === 'paid' && percentageOfTotal > 0 && (
          <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <p className="text-sm text-zinc-500 mb-3">Percentage of Total Revenue</p>
            <div className="flex items-end gap-3 mb-4">
              <p className="text-5xl font-bold text-accent">{Math.round(percentageOfTotal)}%</p>
              <p className="text-zinc-500 mb-2">of {totalRevenueInDisplayCurrency.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurrency]}</p>
            </div>
            <div className="bg-zinc-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-accent h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(percentageOfTotal, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Client Total Revenue */}
        {client && clientRevenue > 0 && (
          <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <p className="text-sm text-zinc-500 mb-3">Total from Client</p>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: client.color || '#ffffff' }}
              />
              <p className="text-sm text-zinc-400 font-medium">{client.name}</p>
            </div>
            <p className="text-5xl font-bold text-blue-400 mb-2">
              {clientRevenue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurrency]}
            </p>
            <p className="text-sm text-zinc-500">{clientProjectCount} project{clientProjectCount !== 1 ? 's' : ''}</p>
          </div>
        )}

        {/* Deadline */}
        {project.deadline && (
          <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <p className="text-sm text-zinc-500 mb-3">Deadline</p>
            <p className="text-3xl font-bold text-zinc-300 mb-2">
              {new Date(project.deadline).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
            {(() => {
              const daysRemaining = Math.ceil(
                (new Date(project.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
              );
              return (
                <p className={`text-sm font-medium ${
                  daysRemaining < 0 ? 'text-red-500' :
                  daysRemaining < 7 ? 'text-yellow-500' :
                  'text-green-500'
                }`}>
                  {daysRemaining < 0
                    ? `Overdue by ${Math.abs(daysRemaining)} days`
                    : `${daysRemaining} days left`
                  }
                </p>
              );
            })()}
          </div>
        )}

        {/* Revenue per Day */}
        {project.paymentStatus === 'paid' && project.createdAt && (
          <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <p className="text-sm text-zinc-500 mb-3">Revenue per Day</p>
            {(() => {
              const createdDate = new Date(project.createdAt);
              const completedDate = new Date();
              const daysWorked = Math.max(1, Math.ceil(
                (completedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
              ));
              const revenuePerDay = displayRevenue / daysWorked;

              return (
                <>
                  <p className="text-5xl font-bold text-purple-400 mb-2">
                    {revenuePerDay.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurrency]}
                  </p>
                  <p className="text-sm text-zinc-500">{daysWorked} days worked</p>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Project Details */}
      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <h3 className="text-lg font-semibold mb-4">Project Details</h3>
        <div className="space-y-3 text-sm">
          {project.description && (
            <div>
              <span className="text-zinc-500">Description:</span>
              <p className="text-zinc-300 mt-1">{project.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {project.createdAt && (
              <div>
                <span className="text-zinc-500">Created:</span>
                <p className="text-zinc-300">{new Date(project.createdAt).toLocaleDateString('en-US')}</p>
              </div>
            )}
            {project.status && (
              <div>
                <span className="text-zinc-500">Status:</span>
                <p className="text-zinc-300 capitalize">{project.status}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Project Breakdown Card Component
function ProjectBreakdownCard({ project, textColorClass, gradientColor }: { project: any; textColorClass: string; gradientColor: 'green' | 'gray' }) {
  const thumbnailSrc = useThumbnail(project.path, project.thumbnail);

  const gradientColorValue = gradientColor === 'green'
    ? 'rgba(22, 101, 52, 0.6)' // dark green
    : 'rgba(63, 63, 70, 0.6)'; // dark gray

  return (
    <div
      className={`relative overflow-hidden rounded-lg py-2 isolate ${thumbnailSrc ? 'border border-zinc-700/50' : ''}`}
      style={{
        backgroundColor: '#18181b'
      }}
    >
      {thumbnailSrc && (
        <>
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.4)), url("${thumbnailSrc}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              backgroundImage: `linear-gradient(to left, ${gradientColorValue}, transparent)`
            }}
          />
        </>
      )}
      <div className="relative z-10 flex justify-between items-center px-4">
        <span className="truncate mr-2 text-white font-medium">
          {project.name}
        </span>
        <div className={`text-right flex-shrink-0 font-medium ${textColorClass}`}>
          {project.displayText}
        </div>
      </div>
    </div>
  );
}

function FinancePage({ projects, selectedProjectId, onClose }: { projects: any[]; selectedProjectId: string | null; onClose: () => void }) {
  const [baseCurrency, setBaseCurrency] = useState(() => {
    const saved = localStorage.getItem('baseCurrency');
    return saved || 'USD';
  });
  const [convertToBaseCurrency, setConvertToBaseCurrency] = useState(() => {
    const saved = localStorage.getItem('convertToBaseCurrency');
    return saved ? JSON.parse(saved) : false;
  });
  const [exchangeRates, setExchangeRates] = useState<Record<string, Record<string, number>>>(() => {
    const rateMode = getRateMode();

    if (rateMode === 'auto') {
      // Пытаемся загрузить из кэша синхронно
      const cachedRates = getCachedRatesSync(baseCurrency);
      if (cachedRates) {
        // Преобразуем в nested структуру
        const nestedRates: Record<string, Record<string, number>> = {};
        const currencies = ['USD', 'RUB', 'EUR'];
        currencies.forEach(from => {
          nestedRates[from] = {};
          currencies.forEach(to => {
            if (from === to) {
              nestedRates[from][to] = 1;
            } else if (from === baseCurrency) {
              nestedRates[from][to] = cachedRates[to] || 1;
            } else if (to === baseCurrency) {
              nestedRates[from][to] = 1 / (cachedRates[from] || 1);
            } else {
              nestedRates[from][to] = (cachedRates[to] || 1) / (cachedRates[from] || 1);
            }
          });
        });
        return nestedRates;
      }
    }

    // Fallback на ручные курсы
    return getManualRates();
  });
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [sortBy, setSortBy] = useState<'amount' | 'name' | 'client'>('amount');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; amount: number } | null>(null);
  const [, forceUpdate] = useState({});

  const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) : null;

  // Load exchange rates on mount
  useEffect(() => {
    const loadRates = async () => {
      const rateMode = getRateMode();

      if (rateMode === 'auto') {
        const rates = await getCurrentRates(baseCurrency);

        // API возвращает: rates[currency] = сколько валюты за 1 базовую
        // Например, если база RUB: rates.USD = 0.0123 означает 1 RUB = 0.0123 USD
        // Для нашей nested структуры нужно: nestedRates[to][from] = сколько TO за 1 FROM
        // То есть nestedRates.RUB.USD = 1/0.0123 = 81.3 (сколько RUB за 1 USD)

        const nestedRates: Record<string, Record<string, number>> = {};

        const currencies = ['USD', 'RUB', 'EUR'];
        currencies.forEach(to => {
          nestedRates[to] = {};
          currencies.forEach(from => {
            if (from === to) {
              nestedRates[to][from] = 1;
            } else if (from === baseCurrency) {
              // from = база, to = другая валюта
              // rates[to] = сколько to валюты за 1 базовую
              // nestedRates[to][from] = сколько to за 1 from = rates[to]
              nestedRates[to][from] = rates[to] || 1;
            } else if (to === baseCurrency) {
              // to = база, from = другая валюта
              // rates[from] = сколько from валюты за 1 базовую
              // nestedRates[to][from] = сколько базы за 1 from = 1/rates[from]
              nestedRates[to][from] = 1 / (rates[from] || 1);
            } else {
              // Кросс-курс: оба не базовые
              // nestedRates[to][from] = rates[to] / rates[from]
              nestedRates[to][from] = (rates[to] || 1) / (rates[from] || 1);
            }
          });
        });

        setExchangeRates(nestedRates);
      } else {
        setExchangeRates(getManualRates());
      }
    };
    loadRates();
  }, [baseCurrency]);

  // Force re-render when projects change
  useEffect(() => {
    forceUpdate({});
  }, [projects]);

  // Listen for storage changes
  useEffect(() => {
    const handleStorageChange = async () => {
      const savedCurrency = localStorage.getItem('baseCurrency');
      const savedConvert = localStorage.getItem('convertToBaseCurrency');
      if (savedCurrency) setBaseCurrency(savedCurrency);
      if (savedConvert) setConvertToBaseCurrency(JSON.parse(savedConvert));

      // Reload exchange rates
      const rateMode = getRateMode();

      if (rateMode === 'auto') {
        const newBaseCurrency = savedCurrency || baseCurrency;
        const rates = await getCurrentRates(newBaseCurrency);

        // API возвращает: rates[currency] = сколько валюты за 1 базовую
        // Например, если база RUB: rates.USD = 0.0123 означает 1 RUB = 0.0123 USD
        // Для нашей nested структуры нужно: nestedRates[to][from] = сколько TO за 1 FROM
        // То есть nestedRates.RUB.USD = 1/0.0123 = 81.3 (сколько RUB за 1 USD)

        const nestedRates: Record<string, Record<string, number>> = {};

        const currencies = ['USD', 'RUB', 'EUR'];
        currencies.forEach(to => {
          nestedRates[to] = {};
          currencies.forEach(from => {
            if (from === to) {
              nestedRates[to][from] = 1;
            } else if (from === newBaseCurrency) {
              // from = база, to = другая валюта
              // rates[to] = сколько to валюты за 1 базовую
              // nestedRates[to][from] = сколько to за 1 from = rates[to]
              nestedRates[to][from] = rates[to] || 1;
            } else if (to === newBaseCurrency) {
              // to = база, from = другая валюта
              // rates[from] = сколько from валюты за 1 базовую
              // nestedRates[to][from] = сколько базы за 1 from = 1/rates[from]
              nestedRates[to][from] = 1 / (rates[from] || 1);
            } else {
              // Кросс-курс: оба не базовые
              // nestedRates[to][from] = rates[to] / rates[from]
              nestedRates[to][from] = (rates[to] || 1) / (rates[from] || 1);
            }
          });
        });

        setExchangeRates(nestedRates);
      } else {
        setExchangeRates(getManualRates());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [baseCurrency]);

  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'RUB': '₽',
    'EUR': '€'
  };

  const convertCurrency = (amount: number, from: string, to: string): number => {
    if (from === to) return amount;

    // Для автоматического режима (API курсы): exchangeRates[to] = курсы из API
    // Для ручного режима: exchangeRates[to][from] = сколько TO валюты за 1 FROM

    // Попробуем найти курс в структуре для целевой валюты
    const toRates = exchangeRates[to];
    if (toRates && typeof toRates[from] === 'number') {
      return amount * toRates[from];
    }

    // Если не нашли, попробуем обратный курс
    const fromRates = exchangeRates[from];
    if (fromRates && typeof fromRates[to] === 'number') {
      return amount / fromRates[to];
    }

    return amount;
  };

  // Подсчет общего дохода (оплаченные проекты)
  const totalRevenue: Record<string, number> = {};
  const paidProjects: any[] = [];

  projects.forEach(project => {
    if (project.paymentStatus === 'paid' && project.cost) {
      const currency = project.currency || 'USD';

      if (convertToBaseCurrency) {
        const convertedAmount = convertCurrency(project.cost, currency, baseCurrency);
        totalRevenue[baseCurrency] = (totalRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        totalRevenue[currency] = (totalRevenue[currency] || 0) + project.cost;
      }

      paidProjects.push(project);
    } else if (project.paymentStatus === 'prepaid' && project.cost && project.prepaymentAmount) {
      // Для prepaid проектов в "Оплачено" показываем только предоплату
      const currency = project.currency || 'USD';

      if (convertToBaseCurrency) {
        const convertedAmount = convertCurrency(project.prepaymentAmount, currency, baseCurrency);
        totalRevenue[baseCurrency] = (totalRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        totalRevenue[currency] = (totalRevenue[currency] || 0) + project.prepaymentAmount;
      }

      paidProjects.push({ ...project, displayAmount: project.prepaymentAmount, isPrepaidPart: true });
    }
  });

  // Подсчет ожидающих доходов (неоплаченные проекты)
  const pendingRevenue: Record<string, number> = {};
  const pendingProjects: any[] = [];

  projects.forEach(project => {
    if (project.paymentStatus === 'unpaid' && project.cost) {
      const currency = project.currency || 'USD';

      if (convertToBaseCurrency) {
        const convertedAmount = convertCurrency(project.cost, currency, baseCurrency);
        pendingRevenue[baseCurrency] = (pendingRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        pendingRevenue[currency] = (pendingRevenue[currency] || 0) + project.cost;
      }

      pendingProjects.push(project);
    } else if (project.paymentStatus === 'prepaid' && project.prepaymentAmount && project.cost) {
      // Для prepaid проектов в "Ожидает" показываем остаток
      const currency = project.currency || 'USD';
      const remainingAmount = project.cost - project.prepaymentAmount;

      if (convertToBaseCurrency) {
        const convertedAmount = convertCurrency(remainingAmount, currency, baseCurrency);
        pendingRevenue[baseCurrency] = (pendingRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        pendingRevenue[currency] = (pendingRevenue[currency] || 0) + remainingAmount;
      }

      pendingProjects.push({ ...project, displayAmount: remainingAmount, isPrepaidRemaining: true });
    }
  });

  const formatRevenue = (revenues: Record<string, number>) => {
    return Object.entries(revenues)
      .map(([currency, amount]) => `${amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[currency]}`)
      .join(' ');
  };

  return (
    <div key={selectedProject ? `project-${selectedProject.id}` : 'overview'} className="flex-1 flex flex-col bg-zinc-950 min-h-0 animate-mode-switch">
      <div className="flex-1 overflow-y-auto px-8 pb-8 pt-6">
        {selectedProject ? (
          /* Project Financial Details */
          <FinanceProjectDetails
            project={selectedProject}
            projects={projects}
            baseCurrency={baseCurrency}
            convertToBaseCurrency={convertToBaseCurrency}
            currencySymbols={currencySymbols}
            totalRevenue={totalRevenue}
            convertCurrency={convertCurrency}
            onClose={onClose}
          />
        ) : (
          /* General Finance Overview */
          <div className="max-w-6xl mx-auto">
            {/* Total Revenue and Pending */}
            <div className="grid grid-cols-2 gap-8 mb-12">
              {/* Total Revenue */}
              <div>
                <h2 className="text-2xl font-medium text-zinc-400 mb-4">Total Revenue</h2>
                <div className="text-6xl font-bold text-green-500 mb-6">
                  {Object.keys(totalRevenue).length > 0 ? formatRevenue(totalRevenue) : '0'}
                </div>

                {paidProjects.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-zinc-500 mb-3">Project Breakdown:</h3>
                    {paidProjects.slice(0, 3).map((project: any) => {
                      const originalCurrency = project.currency || 'USD';
                      const originalAmount = project.displayAmount || project.cost;

                      const displayText = convertToBaseCurrency
                        ? `${convertCurrency(originalAmount, originalCurrency, baseCurrency).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[baseCurrency]}`
                        : `${originalAmount?.toLocaleString()} ${currencySymbols[originalCurrency]}`;

                      return (
                        <ProjectBreakdownCard
                          key={project.id}
                          project={{ ...project, displayText }}
                          textColorClass="text-green-400"
                          gradientColor="green"
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pending */}
              <div>
                <h2 className="text-2xl font-medium text-zinc-400 mb-4">Pending</h2>
                <div className="text-6xl font-bold text-zinc-600 mb-6">
                  {Object.keys(pendingRevenue).length > 0 ? formatRevenue(pendingRevenue) : '0'}
                </div>

                {pendingProjects.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-zinc-500 mb-3">Project Breakdown:</h3>
                    {pendingProjects.slice(0, 3).map((project: any) => {
                      const originalCurrency = project.currency || 'USD';
                      const originalAmount = project.displayAmount || project.cost;

                      const displayText = convertToBaseCurrency
                        ? `${convertCurrency(originalAmount, originalCurrency, baseCurrency).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[baseCurrency]}`
                        : `${originalAmount?.toLocaleString()} ${currencySymbols[originalCurrency]}`;

                      return (
                        <ProjectBreakdownCard
                          key={project.id}
                          project={{ ...project, displayText }}
                          textColorClass="text-zinc-400"
                          gradientColor="gray"
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Full Project List Button */}
            <button
              onClick={() => setShowAllProjects(!showAllProjects)}
              className="w-full px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors font-medium text-center cursor-pointer mt-12 mb-12 block relative z-20"
            >
              View Full List
            </button>

            {showAllProjects && (
              <div className="mt-6 mb-12">
                  {/* Фильтры */}
                  <div className="flex gap-4 mb-6">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFilterStatus('all')}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          filterStatus === 'all' ? 'bg-accent text-white' : 'bg-zinc-800 hover:bg-zinc-700'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFilterStatus('paid')}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          filterStatus === 'paid' ? 'bg-accent text-white' : 'bg-zinc-800 hover:bg-zinc-700'
                        }`}
                      >
                        Paid
                      </button>
                      <button
                        onClick={() => setFilterStatus('unpaid')}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          filterStatus === 'unpaid' ? 'bg-accent text-white' : 'bg-zinc-800 hover:bg-zinc-700'
                        }`}
                      >
                        Pending
                      </button>
                    </div>

                    <div className="flex gap-2 ml-auto relative">
                      <button
                        onClick={() => setShowFilterMenu(!showFilterMenu)}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Filter className="w-4 h-4" />
                        <span>Sort</span>
                      </button>

                      {showFilterMenu && (
                        <div className="absolute top-full mt-1 right-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                          <div className="px-3 py-1.5 text-xs text-zinc-500 font-medium">Sort by</div>
                          <button
                            onClick={() => {
                              setSortBy('amount');
                              setShowFilterMenu(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 ${
                              sortBy === 'amount' ? 'bg-zinc-700 text-white' : ''
                            }`}
                          >
                            Cost
                          </button>
                          <button
                            onClick={() => {
                              setSortBy('name');
                              setShowFilterMenu(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 ${
                              sortBy === 'name' ? 'bg-zinc-700 text-white' : ''
                            }`}
                          >
                            Name
                          </button>
                          <button
                            onClick={() => {
                              setSortBy('client');
                              setShowFilterMenu(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 ${
                              sortBy === 'client' ? 'bg-zinc-700 text-white' : ''
                            }`}
                          >
                            Client
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Список всех проектов */}
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {(() => {
                      const allProjects = [...paidProjects, ...pendingProjects];
                      let filtered = allProjects;

                      // Фильтрация
                      if (filterStatus === 'paid') {
                        filtered = paidProjects;
                      } else if (filterStatus === 'unpaid') {
                        filtered = pendingProjects;
                      }

                      // Сортировка
                      const sorted = [...filtered].sort((a, b) => {
                        if (sortBy === 'amount') {
                          return ((b.displayAmount || b.cost) || 0) - ((a.displayAmount || a.cost) || 0);
                        } else if (sortBy === 'client') {
                          return (a.client || '').localeCompare(b.client || '');
                        } else {
                          return a.name.localeCompare(b.name);
                        }
                      });

                      return sorted.map((project: any) => {
                        const originalCurrency = project.currency || 'USD';
                        const originalAmount = project.displayAmount || project.cost;
                        const showConversion = convertToBaseCurrency && originalCurrency !== baseCurrency;
                        const isPaid = project.paymentStatus === 'paid' || project.isPrepaidPart;

                        return (
                          <div
                            key={`${project.id}-${project.isPrepaidPart ? 'prepaid' : project.isPrepaidRemaining ? 'remaining' : 'full'}`}
                            className="flex justify-between items-center py-2 px-4 bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                          >
                            <span className={`truncate mr-2 ${isPaid ? 'text-zinc-300' : 'text-zinc-400'}`}>
                              {project.name}
                            </span>
                            <div className="text-right flex-shrink-0">
                              <div className={`font-medium ${isPaid ? 'text-green-500' : 'text-zinc-600'}`}>
                                {convertToBaseCurrency
                                  ? `${convertCurrency(originalAmount, originalCurrency, baseCurrency).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[baseCurrency]}`
                                  : `${originalAmount?.toLocaleString()} ${currencySymbols[originalCurrency]}`
                                }
                              </div>
                              {showConversion && (
                                <div className="text-xs text-zinc-600">
                                  ({originalAmount?.toLocaleString()} {currencySymbols[originalCurrency]})
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

            {/* Statistics */}
        <div className="mb-12">
          <h2 className="text-2xl font-medium text-zinc-400 mb-6">Statistics</h2>
          <div className="grid grid-cols-3 gap-6">
            {/* Total Projects */}
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
              <p className="text-sm text-zinc-500 mb-2">Total Projects</p>
              <p className="text-5xl font-bold text-blue-400 mb-2">{projects.length}</p>
              <div className="flex gap-2 text-xs text-zinc-500">
                <span className="text-green-500">{paidProjects.length} paid</span>
                <span>•</span>
                <span className="text-yellow-500">{pendingProjects.length} pending</span>
              </div>
            </div>

            {/* Average Project Value */}
            {paidProjects.length > 0 && (() => {
              const displayCurrency = convertToBaseCurrency ? baseCurrency : (paidProjects[0]?.currency || 'USD');
              const totalPaid = Object.values(totalRevenue).reduce((sum, val) => sum + val, 0);
              const avgValue = totalPaid / paidProjects.length;

              return (
                <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                  <p className="text-sm text-zinc-500 mb-2">Average Project Value</p>
                  <p className="text-5xl font-bold text-purple-400">
                    {avgValue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} <span className="text-purple-400">{currencySymbols[displayCurrency]}</span>
                  </p>
                </div>
              );
            })()}

            {/* Revenue per Day */}
            {(() => {
              const displayCurrency = convertToBaseCurrency ? baseCurrency : 'USD';
              const totalPaid = Object.values(totalRevenue).reduce((sum, val) => sum + val, 0);

              // Подсчет общего количества дней работы
              let totalDaysWorked = 0;
              paidProjects.forEach((project: any) => {
                if (project.createdAt && !project.isPrepaidPart) {
                  const createdDate = new Date(project.createdAt);
                  const completedDate = new Date();
                  const daysWorked = Math.max(1, Math.ceil(
                    (completedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
                  ));
                  totalDaysWorked += daysWorked;
                }
              });

              const dailyRate = totalDaysWorked > 0 ? totalPaid / totalDaysWorked : 0;

              return (
                <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                  <p className="text-sm text-zinc-500 mb-2">Revenue per Day</p>
                  <p className="text-5xl font-bold text-accent">
                    {dailyRate.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} <span className="text-accent">{currencySymbols[displayCurrency]}</span>
                  </p>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Revenue Timeline Chart */}
        {paidProjects.length > 0 && (
          <div className="mb-12" key={JSON.stringify(paidProjects.map(p => ({ id: p.id, cost: p.cost, displayAmount: p.displayAmount })))}>
            <h2 className="text-2xl font-medium text-zinc-400 mb-6">Revenue Timeline</h2>
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
              {(() => {
                // Собираем все проекты с датами и сортируем по дате
                const projectsWithDates = paidProjects
                  .filter((p: any) => p.createdAt)
                  .map((project: any) => {
                    const originalCurrency = project.currency || 'USD';
                    const originalAmount = project.displayAmount || project.cost || 0;
                    const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
                      ? convertCurrency(originalAmount, originalCurrency, baseCurrency)
                      : originalAmount;

                    return {
                      date: new Date(project.createdAt),
                      amount: displayAmount,
                      name: project.name
                    };
                  })
                  .sort((a, b) => a.date.getTime() - b.date.getTime());

                if (projectsWithDates.length === 0) return null;

                // Создаем накопленный доход
                let cumulativeRevenue = 0;
                const cumulativeData = projectsWithDates.map((item) => {
                  cumulativeRevenue += item.amount;
                  return {
                    date: item.date.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    }),
                    revenue: cumulativeRevenue
                  };
                });

                const maxRevenue = cumulativeData[cumulativeData.length - 1].revenue;
                const chartHeight = 300;
                const pointRadius = 3;
                const padding = pointRadius + 2; // Padding to prevent points from being cut off

                // Вычисляем ширину на основе количества точек
                const minSpacing = 50; // Минимальное расстояние между точками
                const chartWidth = Math.max(1000, cumulativeData.length * minSpacing);

                // Создаем точки для линии
                const points = cumulativeData.map((item, index) => {
                  const x = padding + (index / Math.max(cumulativeData.length - 1, 1)) * (chartWidth - 2 * padding);
                  const y = padding + (chartHeight - 2 * padding) - (item.revenue / maxRevenue) * (chartHeight - 2 * padding - 40);
                  return { x, y, amount: item.revenue };
                });

                const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                const displayCurrency = convertToBaseCurrency ? baseCurrency : 'USD';

                return (
                  <div className="w-full relative">
                    {hoveredPoint && (
                      <div
                        className="absolute bg-zinc-800 text-white px-3 py-2 rounded-lg text-sm border border-zinc-700 pointer-events-none z-10"
                        style={{
                          left: `${((hoveredPoint.x - padding) / (chartWidth - 2 * padding)) * 100}%`,
                          top: `${((hoveredPoint.y - padding) / (chartHeight - 2 * padding)) * 100 - 10}%`,
                          transform: 'translate(-50%, -100%)'
                        }}
                      >
                        {hoveredPoint.amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurrency]}
                      </div>
                    )}
                    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-64" preserveAspectRatio="none">

                      {/* Vertical lines from each point to bottom */}
                      {points.map((p, i) => (
                        <line
                          key={`vertical-${i}`}
                          x1={p.x}
                          y1={p.y}
                          x2={p.x}
                          y2={chartHeight}
                          stroke="#3f3f46"
                          strokeWidth="0.5"
                          strokeDasharray="2,2"
                          opacity="0.3"
                        />
                      ))}

                      {/* Area under the line */}
                      <path
                        d={`${pathD} L ${points[points.length - 1].x} ${chartHeight} L 0 ${chartHeight} Z`}
                        fill="url(#blueGradient)"
                        opacity="0.2"
                      />

                      {/* Gradient definition */}
                      <defs>
                        <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                        </linearGradient>
                      </defs>

                      {/* Line */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="0.8"
                        strokeLinejoin="round"
                      />

                      {/* Points */}
                      {points.map((p, i) => (
                        <g key={i}>
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={pointRadius}
                            fill="#18181b"
                            stroke="#3b82f6"
                            strokeWidth="1"
                          />
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={pointRadius / 2}
                            fill="#3b82f6"
                          />
                          {/* Invisible larger circle for better hover area */}
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={pointRadius * 2}
                            fill="transparent"
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={() => setHoveredPoint(p)}
                            onMouseLeave={() => setHoveredPoint(null)}
                          />
                        </g>
                      ))}
                    </svg>

                    {/* Date labels */}
                    <div className="flex justify-between mt-4 text-xs text-zinc-500">
                      {cumulativeData.map((item, i) => {
                        const dateObj = new Date(item.date);
                        const formattedDate = dateObj.toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit'
                        });
                        return (
                          <span key={i} style={{ marginLeft: i === 0 ? '0' : 'auto' }}>{formattedDate}</span>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Top 3 Projects by Revenue */}
        {paidProjects.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-medium text-zinc-400 mb-6">Top 3 Projects by Revenue</h2>
            <div className="grid grid-cols-[1fr,300px] gap-6 items-start">
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                <div className="space-y-4">
                  {(() => {
                    // Считаем общий доход для расчета процентов
                    const totalRevenueCombined = Object.values(totalRevenue).reduce((sum, val) => sum + val, 0);

                    return paidProjects
                    .sort((a: any, b: any) => {
                      const amountA = convertToBaseCurrency && a.currency !== baseCurrency
                        ? convertCurrency(((a.displayAmount || a.cost) || 0), a.currency || 'USD', baseCurrency)
                        : ((a.displayAmount || a.cost) || 0);
                      const amountB = convertToBaseCurrency && b.currency !== baseCurrency
                        ? convertCurrency(((b.displayAmount || b.cost) || 0), b.currency || 'USD', baseCurrency)
                        : ((b.displayAmount || b.cost) || 0);
                      return amountB - amountA;
                    })
                    .slice(0, 3)
                    .map((project: any) => {
                      const originalCurrency = project.currency || 'USD';
                      const originalAmount = project.displayAmount || project.cost || 0;
                      const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
                        ? convertCurrency(originalAmount, originalCurrency, baseCurrency)
                        : originalAmount;
                      const displayCurr = convertToBaseCurrency ? baseCurrency : originalCurrency;
                      const percentage = totalRevenueCombined > 0 ? (displayAmount / totalRevenueCombined) * 100 : 0;

                      return (
                        <div key={project.id} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-300 truncate flex-1 mr-4">{project.name}</span>
                            <span className="text-green-400 font-medium">
                              {displayAmount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurr]}
                            </span>
                          </div>
                          <div className="relative h-8 bg-zinc-800 rounded-lg overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-600 to-green-500 rounded-lg transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                            <div className="absolute inset-0 flex items-center justify-end px-3">
                              <span className="text-xs font-medium text-white drop-shadow">
                                {percentage.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            </div>

              {/* Pie Chart */}
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 flex items-center justify-center h-full">
                {(() => {
                  const chartData = paidProjects.map((project: any) => {
                    const originalCurrency = project.currency || 'USD';
                    const originalAmount = project.displayAmount || project.cost || 0;
                    const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
                      ? convertCurrency(originalAmount, originalCurrency, baseCurrency)
                      : originalAmount;

                    // Generate stable color based on project ID
                    const hash = project.id.split('').reduce((acc: number, char: string) => {
                      return char.charCodeAt(0) + ((acc << 5) - acc);
                    }, 0);
                    const hue = Math.abs(hash % 360);

                    return {
                      name: project.name,
                      value: displayAmount,
                      color: `hsl(${hue}, 70%, 60%)`
                    };
                  }).filter(item => item.value > 0);

                  return chartData.length > 0 ? (
                    <PieChart data={chartData} title="All&#10;Projects" id="projects" />
                  ) : (
                    <div className="text-zinc-500">No data</div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Top 3 Clients by Revenue */}
        {paidProjects.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-medium text-zinc-400 mb-6">Top 3 Clients by Revenue</h2>
            <div className="grid grid-cols-[1fr,300px] gap-6 items-start">
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                <div className="space-y-4">
                {(() => {
                  const { clients } = useProjectStore.getState();
                  const totalRevenueCombined = Object.values(totalRevenue).reduce((sum, val) => sum + val, 0);

                  // Группируем доход по клиентам
                  const revenueByClient: Record<string, { amount: number; projectCount: number; client: any }> = {};

                  paidProjects.forEach((project: any) => {
                    if (project.clientId) {
                      const client = clients.find(c => c.id === project.clientId);
                      if (!client) return;

                      const originalCurrency = project.currency || 'USD';
                      const originalAmount = project.displayAmount || project.cost || 0;
                      const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
                        ? convertCurrency(originalAmount, originalCurrency, baseCurrency)
                        : originalAmount;

                      if (!revenueByClient[project.clientId]) {
                        revenueByClient[project.clientId] = { amount: 0, projectCount: 0, client };
                      }
                      revenueByClient[project.clientId].amount += displayAmount;
                      revenueByClient[project.clientId].projectCount++;
                    }
                  });

                  // Сортируем по доходу и берем топ 3
                  const sortedClients = Object.entries(revenueByClient)
                    .sort((a, b) => b[1].amount - a[1].amount)
                    .slice(0, 3);

                  const displayCurrency = convertToBaseCurrency ? baseCurrency : 'USD';

                  return sortedClients.map(([clientId, data]) => {
                    const percentage = totalRevenueCombined > 0 ? (data.amount / totalRevenueCombined) * 100 : 0;

                    return (
                      <div key={clientId} className="space-y-2">
                        <div className="flex justify-between text-sm items-center">
                          <div className="flex items-center gap-2 truncate flex-1 mr-4">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: data.client.color || '#ffffff' }}
                            />
                            <span className="text-zinc-300 truncate">{data.client.name}</span>
                            <span className="text-zinc-500">({data.projectCount} project{data.projectCount !== 1 ? 's' : ''})</span>
                          </div>
                          <span className="text-purple-400 font-medium">
                            {data.amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurrency]}
                          </span>
                        </div>
                        <div className="relative h-8 bg-zinc-800 rounded-lg overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-600 to-purple-500 rounded-lg transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                          <div className="absolute inset-0 flex items-center justify-end px-3">
                            <span className="text-xs font-medium text-white drop-shadow">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

              {/* Pie Chart */}
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 flex items-center justify-center h-full">
                {(() => {
                  const { clients } = useProjectStore.getState();
                  const revenueByClient: Record<string, { amount: number; client: any }> = {};

                  paidProjects.forEach((project: any) => {
                    if (project.clientId) {
                      const client = clients.find(c => c.id === project.clientId);
                      if (!client) return;

                      const originalCurrency = project.currency || 'USD';
                      const originalAmount = project.displayAmount || project.cost || 0;
                      const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
                        ? convertCurrency(originalAmount, originalCurrency, baseCurrency)
                        : originalAmount;

                      if (!revenueByClient[project.clientId]) {
                        revenueByClient[project.clientId] = { amount: 0, client };
                      }
                      revenueByClient[project.clientId].amount += displayAmount;
                    }
                  });

                  const chartData = Object.values(revenueByClient).map(data => ({
                    name: data.client.name,
                    value: data.amount,
                    color: data.client.color || '#ffffff'
                  })).filter(item => item.value > 0);

                  return chartData.length > 0 ? (
                    <PieChart data={chartData} title="All&#10;Clients" id="clients" />
                  ) : (
                    <div className="text-zinc-500">No data</div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

          </div>
        )}
      </div>
    </div>
  );
}


function App() {
    const {
    projects,
    isLoading,
    loadProjects,
    selectProject,
    openInExplorer,
    launchSoftware,
    createProject,
    updateStatus,
    deleteProject,
    togglePin,
    toggleFavorite,
    updateProject,
    clients,
    deleteClient,
    categories,
    selectedCategory,
    setSelectedCategory,
    addCategory
  } = useProjectStore();

  //const [view, setView] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [filterView, setFilterView] = useState<'all' | 'favorites' | 'archive'>('all');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showClientSubmenu, setShowClientSubmenu] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const clientSubmenuTimeoutRef = useRef<number | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'deadline' | 'cost'>('createdAt');
  const [viewMode, setViewMode] = useState<'projects' | 'finance'>('projects');
  const [showTagIcons, setShowTagIcons] = useState(() => {
    const saved = localStorage.getItem('showTagIcons');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'project' | 'client'; name: string; id: string; path?: string } | null>(null);
  const [previousProjectId, setPreviousProjectId] = useState<string | null>(null);
  const [deadlineNotifications, setDeadlineNotifications] = useState<Array<{ id: string; projectName: string; daysRemaining: number }>>([]);
  const [notificationsShown, setNotificationsShown] = useState(false); // Track if notifications were shown this session
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [showCategoryBar, setShowCategoryBar] = useState(() => {
    const saved = localStorage.getItem('showCategoryBar');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showWelcomeSetup, setShowWelcomeSetup] = useState(false);

  // Check if we should show welcome setup
  useEffect(() => {
    const completed = localStorage.getItem('setupCompleted');
    const hasDefaultPath = localStorage.getItem('defaultProjectsPath');

    // Show welcome if setup not completed OR no default path set
    if (!completed || !hasDefaultPath) {
      setShowWelcomeSetup(true);
    }
  }, []);

  // Temporary keybind to show welcome setup (numpad decimal/dot)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      console.log('Key pressed:', e.key, 'Code:', e.code, 'Location:', e.location);
      // Check for numpad decimal key
      if (e.code === 'NumpadDecimal' || e.key === 'Decimal') {
        e.preventDefault();
        console.log('Opening welcome setup');
        setShowWelcomeSetup(true);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Hotkeys: F to toggle Finance mode, Ctrl+N to create new project, Escape to close modals
  useEffect(() => {
    const handleGlobalHotkeys = (e: KeyboardEvent) => {
      // Ignore if typing in input, textarea, or contenteditable element
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' ||
                       target.tagName === 'TEXTAREA' ||
                       target.isContentEditable;

      // Escape - Close any open modal/menu (except WelcomeSetup)
      if (e.code === 'Escape') {
        // Don't allow closing WelcomeSetup with Escape - it's required setup
        if (showWelcomeSetup) {
          return;
        }

        if (showCreateModal) {
          e.preventDefault();
          setShowCreateModal(false);
          return;
        }
        if (showSettings) {
          e.preventDefault();
          setShowSettings(false);
          return;
        }
        if (showFeedback) {
          e.preventDefault();
          setShowFeedback(false);
          return;
        }
        if (deleteConfirm) {
          e.preventDefault();
          setDeleteConfirm(null);
          return;
        }
        if (selectedProjectId) {
          e.preventDefault();
          setSelectedProjectId(null);
          return;
        }
      }

      // Ctrl+N - Create new project
      if (e.ctrlKey && e.code === 'KeyN') {
        e.preventDefault();
        setShowCreateModal(true);
        return;
      }

      // Don't handle other keys if typing
      if (isTyping) {
        return;
      }

      // F key (physical button) - Toggle Finance mode
      if (e.code === 'KeyF') {
        e.preventDefault();
        setViewMode(prev => {
          if (prev === 'projects') {
            // Entering Finance mode - save current project
            setPreviousProjectId(selectedProjectId);
            setSelectedProjectId(null);
            return 'finance';
          } else {
            // Exiting Finance mode - restore previous project
            setSelectedProjectId(previousProjectId);
            return 'projects';
          }
        });
      }
    };

    window.addEventListener('keydown', handleGlobalHotkeys);
    return () => window.removeEventListener('keydown', handleGlobalHotkeys);
  }, [selectedProjectId, previousProjectId, showCreateModal, showSettings, showFeedback, showWelcomeSetup, deleteConfirm]);

  // Global paste handler that uses hovered project
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Use hovered project if available
      if (!hoveredProjectId) return;

      const project = projects.find(p => p.id === hoveredProjectId);
      if (!project) return;

      const items = e.clipboardData?.items;
      const files = e.clipboardData?.files;

      // Check for image in clipboard items
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.indexOf('image') !== -1) {
            e.preventDefault();
            const blob = item.getAsFile();
            if (blob) {
              await processImageBlobForProject(project, blob);
              return;
            }
          }
        }
      }

      // Check for image files
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.type.indexOf('image') !== -1) {
            e.preventDefault();
            await processImageBlobForProject(project, file);
            return;
          }
        }
      }

      // Try to get text (might be a file path)
      const text = e.clipboardData?.getData('text');
      if (text && text.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
        e.preventDefault();
        try {
          const thumbnailName = await invoke<string>('set_project_thumbnail', {
            projectPath: project.path,
            imagePath: text
          });
          updateProject({ ...project, thumbnail: thumbnailName });
        } catch (error) {
          console.error('Failed to set thumbnail from path:', error);
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [hoveredProjectId, projects]);

  // Universal function to handle image paste for any project (for ProjectDetails)
  const handleProjectImagePaste = async (projectId: string, e: React.ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const items = e.clipboardData?.items;
    const files = e.clipboardData?.files;

    // Check for image in clipboard items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            await processImageBlobForProject(project, blob);
            return;
          }
        }
      }
    }

    // Check for image files
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.indexOf('image') !== -1) {
          e.preventDefault();
          await processImageBlobForProject(project, file);
          return;
        }
      }
    }

    // Try to get text (might be a file path)
    const text = e.clipboardData?.getData('text');
    if (text && text.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
      e.preventDefault();
      try {
        const thumbnailName = await invoke<string>('set_project_thumbnail', {
          projectPath: project.path,
          imagePath: text
        });
        updateProject({ ...project, thumbnail: thumbnailName });
      } catch (error) {
        console.error('Failed to set thumbnail from path:', error);
      }
    }
  };

  const processImageBlobForProject = async (project: any, blob: Blob) => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const { writeBinaryFile, createDir, BaseDirectory } = await import('@tauri-apps/api/fs');
      const { join, appDataDir } = await import('@tauri-apps/api/path');
      const tempFileName = `temp_thumbnail_${Date.now()}.png`;

      try {
        await createDir('', { dir: BaseDirectory.AppData, recursive: true });
      } catch (e) {
        // Directory might already exist
      }

      await writeBinaryFile(tempFileName, uint8Array, { dir: BaseDirectory.AppData });

      const appDir = await appDataDir();
      const tempPath = await join(appDir, tempFileName);

      const thumbnailName = await invoke<string>('set_project_thumbnail', {
        projectPath: project.path,
        imagePath: tempPath
      });

      updateProject({ ...project, thumbnail: thumbnailName });
    } catch (error) {
      console.error('Failed to process image:', error);
    }
  };

  useEffect(() => {
    loadProjects();

    // Load accent color on mount
    const savedColor = localStorage.getItem('accentColor');
    if (savedColor) {
      document.documentElement.style.setProperty('--accent-color', savedColor);
      // Calculate hover color
      const adjustColorBrightness = (hex: string, percent: number) => {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
          (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
          (B < 255 ? B < 1 ? 0 : B : 255))
          .toString(16).slice(1).toUpperCase();
      };
      const hoverColor = adjustColorBrightness(savedColor, -20);
      document.documentElement.style.setProperty('--accent-color-hover', hoverColor);
    }

    // Initialize animations state
    const animationsEnabled = localStorage.getItem('animationsEnabled');
    if (animationsEnabled !== null && !JSON.parse(animationsEnabled)) {
      document.body.classList.add('animations-disabled');
    }
  }, []);

  // Check for upcoming deadlines ONLY on mount (app startup) after projects load
  useEffect(() => {
    // Wait for projects to load
    if (isLoading) return;

    // Only show notifications once per app session
    if (notificationsShown) return;

    // Check if notifications are enabled
    const notificationsEnabled = localStorage.getItem('deadlineNotifications');
    const isEnabled = notificationsEnabled !== null ? JSON.parse(notificationsEnabled) : true;

    if (!isEnabled || projects.length === 0) {
      return;
    }

    // Delay showing notifications by 2 seconds after app startup
    const timer = setTimeout(() => {
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
      const notifications: Array<{ id: string; projectName: string; daysRemaining: number }> = [];

      projects.forEach((project) => {
        if (project.deadline && project.status !== 'completed' && project.status !== 'archived') {
          const deadlineDate = new Date(project.deadline);
          deadlineDate.setHours(0, 0, 0, 0); // Reset time to start of day
          const timeDiff = deadlineDate.getTime() - now.getTime();
          const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

          // Show notification if 3 or fewer days remaining (including today and overdue)
          if (daysRemaining <= 3) {
            notifications.push({
              id: project.id,
              projectName: project.name,
              daysRemaining: Math.max(0, daysRemaining)
            });
          }
        }
      });

      setDeadlineNotifications(notifications);
      setNotificationsShown(true); // Mark that notifications have been shown
    }, 2000); // 2 second delay

    return () => clearTimeout(timer);
  }, [isLoading, notificationsShown]); // Run once when loading completes

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('showTagIcons');
      setShowTagIcons(saved !== null ? JSON.parse(saved) : true);

      // Check if deadline notifications setting changed
      const notificationsEnabled = localStorage.getItem('deadlineNotifications');
      const isEnabled = notificationsEnabled !== null ? JSON.parse(notificationsEnabled) : true;

      if (!isEnabled) {
        // Clear all notifications if disabled
        setDeadlineNotifications([]);
      }
      // Don't re-check deadlines when enabled - they should only show on app startup

      // Also update accent color when storage changes
      const savedColor = localStorage.getItem('accentColor');
      if (savedColor) {
        document.documentElement.style.setProperty('--accent-color', savedColor);
        const adjustColorBrightness = (hex: string, percent: number) => {
          const num = parseInt(hex.replace('#', ''), 16);
          const amt = Math.round(2.55 * percent);
          const R = (num >> 16) + amt;
          const G = (num >> 8 & 0x00FF) + amt;
          const B = (num & 0x0000FF) + amt;
          return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255))
            .toString(16).slice(1).toUpperCase();
        };
        const hoverColor = adjustColorBrightness(savedColor, -20);
        document.documentElement.style.setProperty('--accent-color-hover', hoverColor);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking on delete button
      if (target.closest('[data-delete-button]')) return;
      setContextMenu(null);
    };
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Close filter menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
        setShowClientSubmenu(false);
      }
    };
    if (showFilterMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilterMenu]);


  const filteredProjects = projects
    .filter(p => {
      // Filter by category
      const matchesCategory = p.category === selectedCategory || !p.category && selectedCategory === 'Personal';

      // Filter by search query
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      // Filter by client
      const matchesClient = selectedClientId ? p.clientId === selectedClientId : true;

      // Filter by view
      if (filterView === 'archive') {
        return matchesCategory && matchesSearch && matchesClient && p.status === 'archived';
      } else if (filterView === 'favorites') {
        return matchesCategory && matchesSearch && matchesClient && p.isFavorite && p.status !== 'archived';
      } else {
        // 'all' - show all except archived
        return matchesCategory && matchesSearch && matchesClient && p.status !== 'archived';
      }
    })
    .sort((a, b) => {
      // Pinned projects first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      // Then sort by selected criteria
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'createdAt':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'deadline':
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'cost':
          return (b.cost || 0) - (a.cost || 0);
        default:
          return 0;
      }
    });

  const handleOpenProject = (project: any) => {
    setSelectedProjectId(project.id);
    selectProject(project);
  };

  const selectedProject = useMemo(() =>
    projects.find(p => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const cycleStatus = (projectId: string, currentStatus: ProjectStatus) => {
    const currentIndex = STATUS_CYCLE.indexOf(currentStatus);
    const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIndex];
    updateStatus(projectId, nextStatus);
  };

  const getDaysRemaining = (deadline?: string): number | null => {
    if (!deadline) return null;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadlineDate.setHours(0, 0, 0, 0);
    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="h-screen bg-zinc-950 text-white flex flex-col overflow-hidden rounded-lg">
      {/* Welcome Setup */}
      {showWelcomeSetup && (
        <WelcomeSetup onComplete={() => setShowWelcomeSetup(false)} />
      )}

      {/* Deadline Notifications */}
      <div className="fixed top-12 right-4 z-50 flex flex-col gap-3">
        {deadlineNotifications.slice(0, 3).map((notification) => (
          <DeadlineNotification
            key={notification.id}
            projectName={notification.projectName}
            daysRemaining={notification.daysRemaining}
            onClose={() => {
              setDeadlineNotifications(prev =>
                prev.filter(n => n.id !== notification.id)
              );
            }}
          />
        ))}
      </div>

      {/* Custom Title Bar */}
      <div className="h-8 bg-zinc-900 flex items-center justify-between select-none flex-shrink-0 rounded-t-lg">
        <div
          className="flex items-center gap-2 flex-1 h-full"
          style={{ paddingLeft: '13px' }}
          onMouseDown={() => appWindow.startDragging()}
        >
          <img src="/icon.png" alt="Logo" className="w-4 h-4" />
        </div>

        <div
          className="absolute left-1/2 transform -translate-x-1/2 h-full flex items-center gap-1"
          onMouseDown={(e) => {
            // Prevent dragging when clicking on buttons
            if ((e.target as HTMLElement).tagName !== 'BUTTON' &&
                !(e.target as HTMLElement).closest('button')) {
              appWindow.startDragging();
            }
          }}
        >
          <span className="text-sm font-bold">nullSpace</span>
        </div>

        <div className="titlebar-button flex items-center gap-1 pr-2">
          <button
            onClick={() => {
              const newValue = !showCategoryBar;
              setShowCategoryBar(newValue);
              localStorage.setItem('showCategoryBar', JSON.stringify(newValue));
            }}
            className="w-8 h-6 hover:bg-zinc-800 flex items-center justify-center transition-colors rounded"
            title="Toggle Category Bar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={showCategoryBar ? "text-zinc-400" : "text-zinc-600"}>
              <rect x="0.5" y="0.5" width="13" height="13" stroke="currentColor" strokeWidth="1" fill="none" />
              <rect x="0.5" y="0.5" width="3.25" height="13" fill="currentColor" opacity={showCategoryBar ? "1" : "0.3"} />
            </svg>
          </button>
          <button
            onClick={() => {
              console.log('Minimize clicked');
              appWindow.minimize();
            }}
            className="w-8 h-6 hover:bg-zinc-800 flex items-center justify-center transition-colors rounded"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              console.log('Maximize clicked');
              appWindow.toggleMaximize();
            }}
            className="w-8 h-6 hover:bg-zinc-800 flex items-center justify-center transition-colors rounded"
            title="Maximize"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              console.log('Close clicked');
              appWindow.close();
            }}
            className="w-8 h-6 hover:bg-red-600 flex items-center justify-center transition-colors rounded"
            title="Close"
          >
            <X className="w-3.5 h-3.5 close-button-red" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
      {/* Category Tabs - крайний левый */}
      {showCategoryBar && (
        <CategoryTabs
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onAddCategory={addCategory}
          accentColor="#a855f7"
        />
      )}
      {/* Sidebar - Project List */}
      <div className="w-80 border-r border-zinc-800 flex flex-col">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="relative bg-zinc-800 rounded-lg p-1 flex items-center gap-0 w-fit">
                <div
                  className="absolute top-1 w-8 h-6 bg-accent rounded-md transition-all duration-200 ease-in-out"
                  style={{ left: viewMode === 'projects' ? '4px' : 'calc(100% - 36px)' }}
                />
                <button
                  onClick={() => setViewMode('projects')}
                  className="relative z-10 w-8 h-6 flex items-center justify-center transition-opacity duration-200"
                  style={{ opacity: viewMode === 'projects' ? 1 : 0.75 }}
                  title="Projects"
                >
                  <Folder className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setViewMode('finance');
                    setSelectedProjectId(null);
                  }}
                  className="relative z-10 w-8 h-6 flex items-center justify-center transition-opacity duration-200"
                  style={{ opacity: viewMode === 'finance' ? 1 : 0.75 }}
                  title="Finance"
                >
                  <DollarSign className="w-4 h-4" />
                </button>
              </div>
              <h1 className="text-xl font-semibold">
                {viewMode === 'projects' ? 'Projects' : 'Finances'}
              </h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFeedback(true)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                title="Feedback"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5 animate-settings-icon" />
              </button>
            </div>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 w-full focus:outline-none focus:border-accent transition-colors text-sm"
            />
          </div>

          {/* Filter Menu */}
          <div className="flex gap-1 items-center">
            <button
              onClick={() => setFilterView('all')}
              className={`flex-1 px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                filterView === 'all' ? 'bg-accent' : 'bg-zinc-800 hover:bg-zinc-700'
              }`}
              title="Все проекты"
            >
              <Grid3x3 className="w-3.5 h-3.5" />
              <span className="text-xs">Все</span>
            </button>
            <button
              onClick={() => setFilterView('favorites')}
              className={`flex-1 px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                filterView === 'favorites' ? 'bg-accent' : 'bg-zinc-800 hover:bg-zinc-700'
              }`}
              title="Избранное"
            >
              <Star className={`w-3.5 h-3.5 ${filterView === 'favorites' ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              <span className="text-xs">Избр.</span>
            </button>
            <button
              onClick={() => setFilterView('archive')}
              className={`flex-1 px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                filterView === 'archive' ? 'bg-accent' : 'bg-zinc-800 hover:bg-zinc-700'
              }`}
              title="Архив"
            >
              <Archive className="w-3.5 h-3.5" />
              <span className="text-xs">Архив</span>
            </button>
            <div className="relative" ref={filterMenuRef}>
              <button
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className={`p-1.5 rounded-lg transition-colors ${
                  showFilterMenu ? 'bg-accent' : 'bg-zinc-800 hover:bg-zinc-700'
                }`}
                title="Сортировка"
              >
                <Filter className="w-3.5 h-3.5" />
              </button>
              {showFilterMenu && (
                <div className="absolute top-full mt-1 right-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                  <div className="px-3 py-1.5 text-xs text-zinc-500 font-medium">Sort by</div>
                  <button
                    onClick={() => {
                      setSortBy('createdAt');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 ${
                      sortBy === 'createdAt' ? 'bg-zinc-700 text-white' : ''
                    }`}
                  >
                    Creation date
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('deadline');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 ${
                      sortBy === 'deadline' ? 'bg-zinc-700 text-white' : ''
                    }`}
                  >
                    Deadline
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('name');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 ${
                      sortBy === 'name' ? 'bg-zinc-700 text-white' : ''
                    }`}
                  >
                    Name
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('cost');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 ${
                      sortBy === 'cost' ? 'bg-zinc-700 text-white' : ''
                    }`}
                  >
                    Cost
                  </button>
                  <div className="px-3 py-1.5 text-xs text-zinc-500 font-medium border-t border-zinc-700 mt-1">Filter by</div>
                  <div
                    className="relative"
                    onMouseEnter={() => {
                      if (clientSubmenuTimeoutRef.current) {
                        clearTimeout(clientSubmenuTimeoutRef.current);
                      }
                      setShowClientSubmenu(true);
                    }}
                    onMouseLeave={() => {
                      clientSubmenuTimeoutRef.current = window.setTimeout(() => {
                        setShowClientSubmenu(false);
                      }, 100);
                    }}
                  >
                    <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 flex items-center justify-between">
                      <span>Client</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                    {showClientSubmenu && (
                      <div
                        className="absolute left-full top-0 ml-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 min-w-[160px]"
                        onMouseEnter={() => {
                          if (clientSubmenuTimeoutRef.current) {
                            clearTimeout(clientSubmenuTimeoutRef.current);
                          }
                        }}
                        onMouseLeave={() => {
                          clientSubmenuTimeoutRef.current = window.setTimeout(() => {
                            setShowClientSubmenu(false);
                          }, 100);
                        }}
                      >
                        <button
                          onClick={() => {
                            setSelectedClientId(null);
                            setShowFilterMenu(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 ${
                            selectedClientId === null ? 'bg-zinc-700 text-white' : ''
                          }`}
                        >
                          All clients
                        </button>
                        {clients.map(client => (
                          <button
                            key={client.id}
                            onClick={() => {
                              setSelectedClientId(client.id);
                              setShowFilterMenu(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 flex items-center gap-2 ${
                              selectedClientId === client.id ? 'bg-zinc-700 text-white' : ''
                            }`}
                          >
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: client.color || '#ffffff' }}
                            />
                            {client.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-zinc-500 text-sm">
              <Folder className="w-8 h-8 mb-2 opacity-50" />
              <p>No projects found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  onMouseEnter={() => setHoveredProjectId(project.id)}
                  onMouseLeave={() => setHoveredProjectId(null)}
                >
                  <ProjectCard
                    projectPath={project.path}
                    thumbnail={project.thumbnail}
                    isSelected={selectedProjectId === project.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, projectId: project.id });
                    }}
                    onPaste={(e) => handleProjectImagePaste(project.id, e)}
                  >
                    <div
                      onClick={() => handleOpenProject(project)}
                      className="cursor-pointer relative z-10"
                    >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-base truncate flex-1">{project.name}</h3>
                      {project.isPinned && (
                        <Pin className="w-3 h-3 text-white fill-white" />
                      )}
                      {project.isFavorite && (
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          cycleStatus(project.id, project.status as ProjectStatus);
                        }}
                        className={`w-3 h-3 rounded-full ${STATUS_COLORS[project.status as keyof typeof STATUS_COLORS]} ${project.status === 'active' ? 'animate-pulse-glow' : ''} hover:ring-2 hover:ring-white/50 transition-all cursor-pointer`}
                        title={`Status: ${STATUS_LABELS[project.status as keyof typeof STATUS_LABELS]} (click to change)`}
                      />
                    </div>
                    <p className="text-xs text-zinc-400 truncate mb-2">{project.description}</p>
                    {project.software && project.software.length > 0 && (
                      <div className="flex gap-1.5 mb-2">
                        {project.software.slice(0, 5).map((sw: any) => (
                          <SoftwareIcon key={sw.name} name={sw.name} />
                        ))}
                      </div>
                    )}
                    <div className="flex items-end justify-between">
                      <div className="flex gap-1 flex-wrap">
                        {project.clientId && (() => {
                          const { getClientById } = useProjectStore.getState();
                          const client = getClientById(project.clientId);
                          return client ? (
                            <span
                              key="client"
                              className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1"
                              style={{ backgroundColor: darkenColor(client.color || '#808080', 60), color: '#ffffff' }}
                            >
                              {showTagIcons && <User className="w-3 h-3 fill-current opacity-30" />}
                              {client.name}
                            </span>
                          ) : null;
                        })()}
                        {project.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-zinc-800/80 rounded-full text-xs">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* Payment Status */}
                        {project.paymentStatus === 'paid' && (
                          <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-300 rounded-full flex items-center gap-1">
                            {showTagIcons && <DollarSign className="w-3 h-3" />}
                            Paid
                          </span>
                        )}
                        {project.paymentStatus === 'prepaid' && (
                          <span className="text-xs px-2 py-0.5 bg-yellow-900/50 text-yellow-300 rounded-full flex items-center gap-1">
                            {showTagIcons && <DollarSign className="w-3 h-3" />}
                            Prepaid
                          </span>
                        )}
                        {/* Deadline - hide if project is completed or archived */}
                        {project.deadline && project.status !== 'completed' && project.status !== 'archived' && (() => {
                          const daysLeft = getDaysRemaining(project.deadline);
                          if (daysLeft === null) return null;

                          let displayText;
                          if (daysLeft < 0) {
                            const absDays = Math.abs(daysLeft);
                            displayText = absDays >= 100 ? '99+ overdue' : `${absDays}d overdue`;
                          } else if (daysLeft === 0) {
                            displayText = 'today';
                          } else {
                            displayText = daysLeft >= 100 ? '99+ left' : `${daysLeft}d left`;
                          }

                          return (
                            <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                              daysLeft < 0
                                ? 'bg-red-900 text-red-300'
                                : daysLeft === 0
                                ? 'bg-red-900 text-red-300'
                                : daysLeft < 5
                                ? 'bg-red-900 text-red-300'
                                : daysLeft < 10
                                ? 'bg-yellow-900 text-yellow-300'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              {displayText}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </ProjectCard>
              </div>
            ))}
          </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-zinc-800 p-4">
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full bg-accent hover:bg-accent-hover px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium text-white animate-button"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {viewMode === 'finance' ? (
          <FinancePage projects={projects} selectedProjectId={selectedProjectId} onClose={() => setSelectedProjectId(null)} />
        ) : selectedProject ? (
          <ProjectDetails
            project={selectedProject}
            onClose={() => setSelectedProjectId(null)}
            onOpenFolder={() => {
             console.log('Opening folder:', selectedProject.path);
             openInExplorer(selectedProject.path);
             }}
            onLaunchSoftware={(sw: any) => {
              const currentShot = selectedProject.hasShots && selectedProject.currentShotId
                ? selectedProject.shots?.find((s: any) => s.id === selectedProject.currentShotId)
                : null;

              launchSoftware({
                projectPath: selectedProject.path,
                executablePath: sw.executablePath,
                software: sw.name,
                projectName: selectedProject.name,
                shotNumber: currentShot?.number
              });
            }}
            onDeleteProject={(project: any) => {
              setDeleteConfirm({
                type: 'project',
                name: project.name,
                id: project.id,
                path: project.path
              });
            }}
          />
        ) : (
          <EmptyState onCreateProject={() => setShowCreateModal(true)} />
        )}
      </div>

      {/* Right Sidebar */}
      {selectedProject && viewMode !== 'finance' && <RightSidebar project={selectedProject} />}

      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createProject}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onDeleteClient={(clientId, clientName) => {
            setDeleteConfirm({
              type: 'client',
              name: clientName,
              id: clientId
            });
          }}
        />
      )}

      {/* Feedback Panel */}
      {showFeedback && (
        <FeedbackPanel
          onClose={() => setShowFeedback(false)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
              setDeleteConfirm(null);
            }
            delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
          }}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Confirm Delete</h3>
            <p className="text-zinc-400 mb-6">
              Are you sure you want to delete "{deleteConfirm.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (deleteConfirm.type === 'project' && deleteConfirm.path) {
                    await deleteProject(deleteConfirm.path);
                  } else if (deleteConfirm.type === 'client') {
                    deleteClient(deleteConfirm.id);
                  }
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 z-50 min-w-[180px]"
          style={{
            top: (() => {
              const menuHeight = contextMenuRef.current?.offsetHeight || 500;
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
            onClick={() => {
              togglePin(contextMenu.projectId);
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            <Pin className="w-4 h-4" />
            {projects.find(p => p.id === contextMenu.projectId)?.isPinned ? 'Unpin' : 'Pin to top'}
          </button>
          <button
            onClick={() => {
              toggleFavorite(contextMenu.projectId);
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            <Star className="w-4 h-4" />
            {projects.find(p => p.id === contextMenu.projectId)?.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          </button>
          <button
            onClick={async () => {
              const project = projects.find(p => p.id === contextMenu.projectId);
              if (project) {
                try {
                  const clipboardItems = await navigator.clipboard.read();
                  for (const item of clipboardItems) {
                    const imageTypes = item.types.filter(type => type.startsWith('image/'));
                    if (imageTypes.length > 0) {
                      const blob = await item.getType(imageTypes[0]);
                      await processImageBlobForProject(project, blob);
                      break;
                    }
                  }
                } catch (error) {
                  console.error('Failed to paste thumbnail from clipboard:', error);
                }
              }
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            <Image className="w-4 h-4" />
            Paste Thumbnail
          </button>
          <button
            onClick={() => {
              const project = projects.find(p => p.id === contextMenu.projectId);
              if (project) {
                updateProject({ ...project, thumbnail: undefined });
              }
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Remove Thumbnail
          </button>
          <div className="border-t border-zinc-700 my-1" />

          {/* Status submenu */}
          <div className="px-2 py-1 text-xs text-zinc-500 font-medium">Status</div>
          <button
            onClick={() => {
              updateStatus(contextMenu.projectId, 'active');
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            <Circle className="w-4 h-4 fill-green-500 text-green-500" />
            Active
          </button>
          <button
            onClick={() => {
              updateStatus(contextMenu.projectId, 'paused');
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            <Circle className="w-4 h-4 fill-yellow-500 text-yellow-500" />
            Paused
          </button>
          <button
            onClick={() => {
              updateStatus(contextMenu.projectId, 'completed');
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            <Circle className="w-4 h-4 fill-blue-500 text-blue-500" />
            Completed
          </button>
          <button
            onClick={() => {
              updateStatus(contextMenu.projectId, 'archived');
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            <Archive className="w-4 h-4" />
            Archived
          </button>

          <div className="border-t border-zinc-700 my-1" />

          {/* Payment Status submenu */}
          <div className="px-2 py-1 text-xs text-zinc-500 font-medium">Payment Status</div>
          <button
            onClick={() => {
              const project = projects.find(p => p.id === contextMenu.projectId);
              if (project) {
                updateProject({ ...project, paymentStatus: 'unpaid' });
              }
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            <DollarSign className="w-4 h-4 text-zinc-500" />
            Unpaid
          </button>
          <button
            onClick={() => {
              const project = projects.find(p => p.id === contextMenu.projectId);
              if (project) {
                updateProject({ ...project, paymentStatus: 'prepaid' });
              }
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            <DollarSign className="w-4 h-4 text-yellow-500" />
            Prepaid
          </button>
          <button
            onClick={() => {
              const project = projects.find(p => p.id === contextMenu.projectId);
              if (project) {
                updateProject({ ...project, paymentStatus: 'paid' });
              }
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
          >
            <DollarSign className="w-4 h-4 text-green-500" />
            Paid
          </button>

          <div className="border-t border-zinc-700 my-1" />
          <button
            data-delete-button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              const projectId = contextMenu?.projectId;
              const project = projects.find(p => p.id === projectId);

              if (!project) {
                setContextMenu(null);
                return;
              }

              // Close menu and show custom confirm dialog
              setContextMenu(null);
              setDeleteConfirm({
                type: 'project',
                name: project.name,
                id: project.id,
                path: project.path
              });
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-red-900/50 text-red-400 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete project
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

function ProjectDetails({ project, onClose, onOpenFolder, onLaunchSoftware, onDeleteProject }: any) {
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isShotEditMode, setIsShotEditMode] = useState(false);
  const [isFavoriteAnimating, setIsFavoriteAnimating] = useState(false);

  // Track which date fields user has manually filled in Project Settings
  const [deadlineFieldsFilled, setDeadlineFieldsFilled] = useState({
    day: false,
    month: false,
    year: false
  });

  // Debug: log project data
  useEffect(() => {
    console.log('Project data:', project);
    console.log('createdAt:', project.createdAt);
  }, [project]);

  // Get current context (todos, notes, links, browserTabs) based on shot selection
  const getCurrentContext = () => {
    if (project.hasShots && project.currentShotId) {
      const currentShot = project.shots?.find((s: any) => s.id === project.currentShotId);
      if (currentShot) {
        return {
          todos: currentShot.todos || [],
          notes: currentShot.notes || [],
          links: currentShot.links || [],
          browserTabs: currentShot.browserTabs || [],
          isShot: true,
          shotId: currentShot.id
        };
      }
    }
    return {
      todos: project.todos || [],
      notes: project.notes || [],
      links: project.links || [],
      browserTabs: project.browserTabs || [],
      isShot: false,
      shotId: null
    };
  };

  const context = getCurrentContext();

  const handlePaste = async (e: React.ClipboardEvent) => {
    // Ignore paste in input/textarea fields
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    const items = e.clipboardData?.items;
    const files = e.clipboardData?.files;

    // Check for image in clipboard items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            await processImageBlob(blob);
            return;
          }
        }
      }
    }

    // Check for image files
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.indexOf('image') !== -1) {
          e.preventDefault();
          await processImageBlob(file);
          return;
        }
      }
    }

    // Try to get text (might be a file path)
    const text = e.clipboardData?.getData('text');
    if (text && text.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
      e.preventDefault();
      try {
        const thumbnailName = await invoke<string>('set_project_thumbnail', {
          projectPath: project.path,
          imagePath: text
        });
        const { updateProject } = useProjectStore.getState();
        updateProject({ ...project, thumbnail: thumbnailName });
      } catch (error) {
        console.error('Failed to set thumbnail from path:', error);
      }
    }
  };

  const processImageBlob = async (blob: Blob) => {
    try {
      // Convert blob to array buffer
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Save to temp file using Tauri
      const { writeBinaryFile, createDir, BaseDirectory } = await import('@tauri-apps/api/fs');
      const { join, appDataDir } = await import('@tauri-apps/api/path');
      const tempFileName = `temp_thumbnail_${Date.now()}.png`;

      // Ensure AppData directory exists
      try {
        await createDir('', { dir: BaseDirectory.AppData, recursive: true });
      } catch (e) {
        // Directory might already exist, ignore error
      }

      // Write binary file to AppData directory
      await writeBinaryFile(tempFileName, uint8Array, { dir: BaseDirectory.AppData });

      // Get full path using join
      const appDir = await appDataDir();
      const tempPath = await join(appDir, tempFileName);

      // Set thumbnail
      const thumbnailName = await invoke<string>('set_project_thumbnail', {
        projectPath: project.path,
        imagePath: tempPath
      });

      const { updateProject } = useProjectStore.getState();
      updateProject({ ...project, thumbnail: thumbnailName });
    } catch (error) {
      console.error('Failed to process image:', error);
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-screen overflow-hidden min-w-0 animate-mode-switch focus:outline-none"
      onPaste={handlePaste}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-semibold">{project.name}</h2>
            <span className="text-xs text-zinc-500 font-normal">
              {STATUS_LABELS[project.status as keyof typeof STATUS_LABELS]}
            </span>
            <div className="flex gap-2 flex-wrap items-center ml-2">
              {project.tags.map((tag: string) => (
                <span
                  key={tag}
                  onClick={() => {
                    const { removeTag } = useProjectStore.getState();
                    removeTag(project.id, tag);
                  }}
                  className="px-2 py-0.5 bg-zinc-800 rounded text-xs cursor-pointer hover:bg-red-600 hover:line-through transition-all"
                  title="Click to remove"
                >
                  {tag}
                </span>
              ))}
              <input
                type="text"
                placeholder="+ Add tag..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    const { addTag } = useProjectStore.getState();
                    addTag(project.id, e.currentTarget.value.trim());
                    e.currentTarget.value = '';
                  }
                }}
                onBlur={(e) => {
                  if (e.currentTarget.value.trim()) {
                    const { addTag } = useProjectStore.getState();
                    addTag(project.id, e.currentTarget.value.trim());
                    e.currentTarget.value = '';
                  }
                }}
                className="px-2 py-0.5 bg-transparent border border-zinc-700 border-dashed rounded text-xs text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-accent focus:border-solid w-24"
              />
            </div>
          </div>
          <p className="text-zinc-400 text-sm mb-2">{project.description}</p>
          {project.hasShots === true && (
            <div className="flex gap-2 flex-wrap items-center">
              {(project.shots || []).map((shot: any) => (
                <div
                  key={shot.id}
                  className={`group relative flex items-center gap-1 rounded overflow-hidden ${
                    project.currentShotId === shot.id
                      ? 'bg-accent text-white'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <button
                    onClick={() => {
                      const { setCurrentShot } = useProjectStore.getState();
                      setCurrentShot(project.id, shot.id);
                    }}
                    className="px-3 py-1 text-sm font-medium transition-all hover:brightness-110"
                  >
                    {shot.name}
                  </button>
                  {isShotEditMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete ${shot.name}?`)) {
                          const { removeShot } = useProjectStore.getState();
                          removeShot(project.id, shot.id);
                        }
                      }}
                      className="px-2 py-1 hover:bg-red-500/20 transition-all"
                      title="Delete shot"
                    >
                      <X className="w-3.5 h-3.5 close-button-red" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => {
                  const { addShot } = useProjectStore.getState();
                  addShot(project.id);
                }}
                className="px-3 py-1 bg-transparent border border-zinc-700 border-dashed rounded text-sm text-zinc-400 hover:border-accent hover:text-accent transition-all"
              >
                + Add shot...
              </button>
              <button
                onClick={() => setIsShotEditMode(!isShotEditMode)}
                className={`p-1 transition-colors ${
                  isShotEditMode ? 'text-accent' : 'text-zinc-400 hover:text-accent'
                }`}
                title={isShotEditMode ? 'Done editing' : 'Edit shots'}
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const { toggleFavorite } = useProjectStore.getState();
              toggleFavorite(project.id);

              // Trigger animation
              setIsFavoriteAnimating(true);
              setTimeout(() => {
                setIsFavoriteAnimating(false);
              }, 500);
            }}
            className={`group p-2 hover:bg-zinc-800 rounded-lg transition-colors ${
              project.isFavorite ? 'text-yellow-400' : 'text-zinc-400'
            }`}
            title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className={`w-5 h-5 text-zinc-300 transition-all ${project.isFavorite ? 'fill-yellow-400' : 'group-hover:fill-zinc-600'} ${isFavoriteAnimating ? 'animate-favorite-star-bounce' : ''}`} />
          </button>
          <button
            onClick={() => setShowProjectSettings(true)}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Project Settings"
          >
            <Settings className="w-5 h-5 animate-settings-icon" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 close-button-red" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Quick Actions */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Quick Actions</h3>
          <div className="flex gap-2">
            <button
              onClick={onOpenFolder}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center gap-2 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Open Folder
            </button>
            <button
              onClick={async () => {
                try {
                  await invoke('open_links_in_browser', { links: context.links });
                } catch (error) {
                  console.error('Failed to open browser:', error);
                }
              }}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center gap-2 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open Browser
            </button>
            <button
              onClick={() => setShowPaymentModal(true)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center gap-2 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Payment
            </button>
          </div>
        </div>

        {/* Software Launchers */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Launch Software</h3>
          <div className="grid grid-cols-2 gap-2">
            {project.software.map((sw: any) => {
              // Get executable path from localStorage
              const savedPaths = localStorage.getItem('softwarePaths');
              const pathsMap: Record<string, string> = savedPaths ? JSON.parse(savedPaths) : {};

              // Map display names to internal keys
              const nameToKey: Record<string, string> = {
                'Blender': 'blender',
                'Houdini': 'houdini',
                'Maya': 'maya',
                'After Effects': 'after-effects',
                'Cinema 4D': 'cinema4d',
                'Substance': 'substance',
                'Unreal': 'unreal',
                'Unity': 'unity',
                'ZBrush': 'zbrush',
                'Marmoset': 'marmoset'
              };

              const softwareKey = nameToKey[sw.name] || sw.name.toLowerCase().replace(/\s+/g, '-');
              const executablePath = pathsMap[softwareKey] || sw.executablePath;

              return (
                <button
                  key={sw.name}
                  onClick={() => {
                    const currentShot = project.hasShots && project.currentShotId
                      ? project.shots?.find((s: any) => s.id === project.currentShotId)
                      : null;

                    onLaunchSoftware({
                      ...sw,
                      executablePath,
                      shotNumber: currentShot?.number
                    });
                  }}
                  className="p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg flex items-center gap-3 transition-all duration-200 group active:scale-[0.98] active:brightness-95 select-none"
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center">
                    <SoftwareIcon name={sw.name} />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">{sw.name}</div>
                    <div className="text-xs text-zinc-500">
                      {executablePath ? 'Click to launch' : 'Path not configured'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Versions Overview */}
        <VersionsOverview project={project} currentShot={context.isShot && context.shotId ? project.shots?.find((s: any) => s.id === context.shotId) : null} />

        {/* Links Section */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Links</h3>
          <div className="space-y-2">
            {context.links.map((link: any) => (
              <LinkItem key={link.id} link={link} projectId={project.id} shotId={context.shotId} />
            ))}
            <LinkInputForm projectId={project.id} shotId={context.shotId} />
          </div>
        </div>

        {/* Todo Section */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Tasks</h3>
          <div className="space-y-2">
            {context.todos.map((todo: any) => (
              <div key={todo.id} className="flex items-center gap-2 group">
                <button
                  onClick={() => {
                    if (context.isShot && context.shotId) {
                      const { toggleShotTodo } = useProjectStore.getState();
                      toggleShotTodo(project.id, context.shotId, todo.id);
                    } else {
                      const { toggleTodo } = useProjectStore.getState();
                      toggleTodo(project.id, todo.id);
                    }
                  }}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    todo.completed
                      ? 'bg-accent border-accent'
                      : 'border-zinc-600 hover:border-accent'
                  }`}
                >
                  {todo.completed && <Check className="w-3 h-3 text-white" />}
                </button>
                <span
                  className={`flex-1 text-sm ${
                    todo.completed ? 'line-through text-zinc-500' : 'text-zinc-300'
                  }`}
                >
                  {todo.text}
                </span>
                <button
                  onClick={() => {
                    if (context.isShot && context.shotId) {
                      const { removeShotTodo } = useProjectStore.getState();
                      removeShotTodo(project.id, context.shotId, todo.id);
                    } else {
                      const { removeTodo } = useProjectStore.getState();
                      removeTodo(project.id, todo.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-800 rounded transition-opacity"
                >
                  <X className="w-3 h-3 close-button-red" />
                </button>
              </div>
            ))}
            <input
              type="text"
              placeholder="+ Add task..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  if (context.isShot && context.shotId) {
                    const { addShotTodo } = useProjectStore.getState();
                    addShotTodo(project.id, context.shotId, e.currentTarget.value.trim());
                  } else {
                    const { addTodo } = useProjectStore.getState();
                    addTodo(project.id, e.currentTarget.value.trim());
                  }
                  e.currentTarget.value = '';
                }
              }}
              onBlur={(e) => {
                if (e.currentTarget.value.trim()) {
                  if (context.isShot && context.shotId) {
                    const { addShotTodo } = useProjectStore.getState();
                    addShotTodo(project.id, context.shotId, e.currentTarget.value.trim());
                  } else {
                    const { addTodo } = useProjectStore.getState();
                    addTodo(project.id, e.currentTarget.value.trim());
                  }
                  e.currentTarget.value = '';
                }
              }}
              className="w-full px-3 py-2 bg-transparent border border-zinc-700 border-dashed rounded-lg text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-accent focus:border-solid"
            />
          </div>
        </div>

        {/* Notes Section */}
        <NotesSection project={project} context={context} />
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
              setShowPaymentModal(false);
            }
            delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
          }}
        >
          <div className="bg-zinc-900 rounded-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Payment Settings</h2>
              <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                <X className="w-5 h-5 close-button-red" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Cost</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={project.cost || ''}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, cost: e.target.value ? parseFloat(e.target.value) : undefined });
                    }}
                    placeholder="0"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
                  />
                  <select
                    value={project.currency || 'USD'}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, currency: e.target.value as 'USD' | 'RUB' | 'EUR' });
                    }}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
                  >
                    <option value="USD">USD</option>
                    <option value="RUB">RUB</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Payment Status</label>
                <select
                  value={project.paymentStatus || 'unpaid'}
                  onChange={(e) => {
                    const { updateProject } = useProjectStore.getState();
                    updateProject({ ...project, paymentStatus: e.target.value as 'paid' | 'prepaid' | 'unpaid' });
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="prepaid">Prepaid</option>
                  <option value="paid">Paid</option>
                </select>
              </div>

              {project.paymentStatus === 'prepaid' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Prepayment Amount</label>
                  <input
                    type="number"
                    value={project.prepaymentAmount || ''}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, prepaymentAmount: e.target.value ? parseFloat(e.target.value) : undefined });
                    }}
                    placeholder="0"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
                  />
                </div>
              )}
            </div>

            <div className="p-6 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors font-medium animate-button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Settings Modal */}
      {showProjectSettings && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
              setShowProjectSettings(false);
            }
            delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
          }}
        >
          <div className="bg-zinc-900 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-modal" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold">Project Settings</h2>
              <button onClick={() => setShowProjectSettings(false)} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
                <X className="w-5 h-5 close-button-red" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={project.name}
                  onChange={(e) => {
                    const { updateProject } = useProjectStore.getState();
                    updateProject({ ...project, name: e.target.value });
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <textarea
                  value={project.description}
                  onChange={(e) => {
                    const { updateProject } = useProjectStore.getState();
                    updateProject({ ...project, description: e.target.value });
                  }}
                  rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Project Path</label>
                <input
                  type="text"
                  value={project.path}
                  readOnly
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent opacity-60"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Project Thumbnail <span className="text-xs text-zinc-500">(Ctrl+V to paste)</span></label>
                <div className="flex gap-2 items-center">
                  {project.thumbnail && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-800 flex-shrink-0">
                      <ThumbnailImage
                        projectPath={project.path}
                        thumbnail={project.thumbnail}
                        className="w-full h-full object-cover"
                        alt="Project thumbnail"
                      />
                    </div>
                  )}
                  <div className="flex gap-2 flex-1">
                    <button
                      onClick={async () => {
                        const { selectImageFile } = await import('./utils/tauri');
                        const imagePath = await selectImageFile();
                        if (imagePath) {
                          try {
                            const thumbnailName = await invoke<string>('set_project_thumbnail', {
                              projectPath: project.path,
                              imagePath
                            });
                            const { updateProject } = useProjectStore.getState();
                            updateProject({ ...project, thumbnail: thumbnailName });
                          } catch (error) {
                            console.error('Failed to set thumbnail:', error);
                          }
                        }
                      }}
                      className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm"
                    >
                      Choose Image
                    </button>
                    {project.thumbnail && (
                      <button
                        onClick={() => {
                          const { updateProject } = useProjectStore.getState();
                          updateProject({ ...project, thumbnail: undefined });
                        }}
                        className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Status</label>
                  <select
                    value={project.status}
                    onChange={(e) => {
                      const { updateStatus } = useProjectStore.getState();
                      updateStatus(project.id, e.target.value as ProjectStatus);
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Client</label>
                  <select
                    value={project.clientId || ''}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, clientId: e.target.value || undefined });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">No client</option>
                    {(() => {
                      const { clients } = useProjectStore.getState();
                      return clients.map(client => (
                        <option key={client.id} value={client.id}>{client.name}</option>
                      ));
                    })()}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Deadline</label>
                  <div className="flex gap-2 items-center">
                    <div className="relative w-14">
                      <input
                        type="text"
                        placeholder="ДД"
                        value={project.deadline ? project.deadline.split('-')[2] : ''}
                        onKeyDown={(e) => {
                          if (e.key >= '0' && e.key <= '9') {
                            e.preventDefault();
                            const parts = project.deadline ? project.deadline.split('-') : ['', '', ''];
                            const currentDay = parts[2] || '';

                            let newDay;
                            if (currentDay.length >= 2) {
                              newDay = currentDay.slice(-1) + e.key;
                            } else {
                              newDay = currentDay + e.key;
                            }

                            const now = new Date();
                            const year = parts[0] || String(now.getFullYear());
                            const month = parts[1] || String(now.getMonth() + 1).padStart(2, '0');

                            const maxDays = new Date(parseInt(year), parseInt(month), 0).getDate();

                            let dayNum = parseInt(newDay);
                            if (dayNum > maxDays) {
                              dayNum = maxDays;
                              newDay = String(maxDays);
                            }
                            if (dayNum < 1) {
                              dayNum = 1;
                              newDay = '01';
                            }

                            const { updateDeadline } = useProjectStore.getState();
                            updateDeadline(project.id, `${year}-${month}-${newDay.padStart(2, '0')}`);
                            setDeadlineFieldsFilled(prev => ({ ...prev, day: true }));
                          } else if (e.key === 'Backspace') {
                            e.preventDefault();
                            const { updateDeadline } = useProjectStore.getState();
                            updateDeadline(project.id, undefined);
                            setDeadlineFieldsFilled({ day: false, month: false, year: false });
                          }
                        }}
                        onChange={() => {}}
                        className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-accent"
                      />
                    </div>
                    <span className="text-zinc-500">.</span>
                    <div className="relative w-14">
                      {(() => {
                        const showAutofill = deadlineFieldsFilled.day && !deadlineFieldsFilled.month;
                        const now = new Date();
                        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

                        return showAutofill ? (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white" style={{ opacity: 0.3 }}>
                            {currentMonth}
                          </div>
                        ) : null;
                      })()}
                      <input
                        type="text"
                        placeholder="ММ"
                        value={project.deadline ? project.deadline.split('-')[1] : ''}
                        onKeyDown={(e) => {
                          if (e.key >= '0' && e.key <= '9') {
                            e.preventDefault();
                            const parts = project.deadline ? project.deadline.split('-') : ['', '', ''];
                            const currentMonth = parts[1] || '';

                            let newMonth;
                            if (currentMonth.length >= 2) {
                              newMonth = currentMonth.slice(-1) + e.key;
                            } else {
                              newMonth = currentMonth + e.key;
                            }

                            let monthNum = parseInt(newMonth);
                            if (monthNum > 12) {
                              monthNum = 12;
                              newMonth = '12';
                            }
                            if (monthNum < 1) {
                              monthNum = 1;
                              newMonth = '01';
                            }

                            const now = new Date();
                            const year = parts[0] || String(now.getFullYear());
                            let day = parts[2] || '01';

                            const maxDays = new Date(parseInt(year), parseInt(newMonth.padStart(2, '0')), 0).getDate();
                            const dayNum = parseInt(day);
                            if (dayNum > maxDays) {
                              day = String(maxDays).padStart(2, '0');
                            }

                            const { updateDeadline } = useProjectStore.getState();
                            updateDeadline(project.id, `${year}-${newMonth.padStart(2, '0')}-${day}`);
                            setDeadlineFieldsFilled(prev => ({ ...prev, month: true }));
                          } else if (e.key === 'Backspace') {
                            e.preventDefault();
                            const parts = project.deadline ? project.deadline.split('-') : ['', '', ''];
                            if (parts[1]) {
                              const newMonth = parts[1].slice(0, -1);
                              if (newMonth && parts[0] && parts[2]) {
                                const { updateDeadline } = useProjectStore.getState();
                                updateDeadline(project.id, `${parts[0]}-${newMonth.padStart(2, '0')}-${parts[2]}`);
                              } else {
                                setDeadlineFieldsFilled(prev => ({ ...prev, month: false }));
                              }
                            }
                          }
                        }}
                        onChange={() => {}}
                        className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-accent"
                      />
                    </div>
                    <span className="text-zinc-500">.</span>
                    <div className="relative w-14">
                      {(() => {
                        const showAutofill = deadlineFieldsFilled.day && !deadlineFieldsFilled.year;
                        const now = new Date();
                        const currentYear = String(now.getFullYear()).slice(-2);

                        return showAutofill ? (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white" style={{ opacity: 0.3 }}>
                            {currentYear}
                          </div>
                        ) : null;
                      })()}
                      <input
                        type="text"
                        placeholder="ГГ"
                        value={project.deadline ? project.deadline.split('-')[0].slice(-2) : ''}
                        onKeyDown={(e) => {
                          if (e.key >= '0' && e.key <= '9') {
                            e.preventDefault();
                            const parts = project.deadline ? project.deadline.split('-') : ['', '', ''];
                            const currentYear = parts[0] ? parts[0].slice(-2) : '';

                            let newYear;
                            if (currentYear.length >= 2) {
                              newYear = currentYear.slice(-1) + e.key;
                            } else {
                              newYear = currentYear + e.key;
                            }

                            const now = new Date();
                            const currentYearFull = now.getFullYear();
                            const maxYearFull = currentYearFull + 1;
                            const maxYearShort = String(maxYearFull).slice(-2);

                            let fullYear = '20' + newYear.padStart(2, '0');
                            let fullYearNum = parseInt(fullYear);

                            if (fullYearNum > maxYearFull) {
                              fullYear = String(maxYearFull);
                              newYear = maxYearShort;
                            }

                            const month = parts[1] || String(now.getMonth() + 1).padStart(2, '0');
                            let day = parts[2] || '01';

                            const maxDays = new Date(parseInt(fullYear), parseInt(month), 0).getDate();
                            const dayNum = parseInt(day);
                            if (dayNum > maxDays) {
                              day = String(maxDays).padStart(2, '0');
                            }

                            const { updateDeadline } = useProjectStore.getState();
                            updateDeadline(project.id, `${fullYear}-${month}-${day}`);
                            setDeadlineFieldsFilled(prev => ({ ...prev, year: true }));
                          } else if (e.key === 'Backspace') {
                            e.preventDefault();
                            const parts = project.deadline ? project.deadline.split('-') : ['', '', ''];
                            if (parts[0]) {
                              const currentYear = parts[0].slice(-2);
                              const newYear = currentYear.slice(0, -1);
                              if (newYear && parts[1] && parts[2]) {
                                const fullYear = '20' + newYear.padStart(2, '0');
                                const { updateDeadline } = useProjectStore.getState();
                                updateDeadline(project.id, `${fullYear}-${parts[1]}-${parts[2]}`);
                              } else {
                                setDeadlineFieldsFilled(prev => ({ ...prev, year: false }));
                              }
                            }
                          }
                        }}
                        onChange={() => {}}
                        className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="relative w-8 h-8 flex items-center justify-center calendar-icon-wrapper">
                      <input
                        type="date"
                        value={project.deadline || ''}
                        onChange={(e) => {
                          const { updateDeadline } = useProjectStore.getState();
                          updateDeadline(project.id, e.target.value || undefined);
                          if (e.target.value) {
                            setDeadlineFieldsFilled({ day: true, month: true, year: true });
                          }
                        }}
                        className="absolute opacity-0"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          zIndex: 10
                        }}
                      />
                      <svg
                        className="w-5 h-5 text-zinc-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        style={{ pointerEvents: 'none', position: 'relative', zIndex: 5 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Cost</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={project.cost || ''}
                      onChange={(e) => {
                        const { updateProject } = useProjectStore.getState();
                        updateProject({ ...project, cost: e.target.value ? parseFloat(e.target.value) : undefined });
                      }}
                      placeholder="0"
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    />
                    <select
                      value={project.currency || 'USD'}
                      onChange={(e) => {
                        const { updateProject } = useProjectStore.getState();
                        updateProject({ ...project, currency: e.target.value as 'USD' | 'RUB' | 'EUR' });
                      }}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="USD">USD</option>
                      <option value="RUB">RUB</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Payment Status</label>
                  <select
                    value={project.paymentStatus || 'unpaid'}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, paymentStatus: e.target.value as 'paid' | 'prepaid' | 'unpaid' });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="prepaid">Prepaid</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Prepayment Amount</label>
                  <input
                    type="number"
                    value={project.prepaymentAmount || ''}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, prepaymentAmount: e.target.value ? parseFloat(e.target.value) : undefined });
                    }}
                    placeholder="0"
                    disabled={project.paymentStatus !== 'prepaid'}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <button
                  onClick={() => {
                    // Close modal first to prevent UI glitches
                    setShowProjectSettings(false);
                    onClose();

                    // Then show custom confirmation dialog
                    setTimeout(() => {
                      onDeleteProject(project);
                    }, 100);
                  }}
                  className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium text-sm"
                >
                  Delete Project
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Project Info Bar */}
      <div className="border-t border-zinc-800 px-6 py-2 bg-zinc-900 text-xs text-zinc-400 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-zinc-500">Created:</span>{' '}
            {project.createdAt ? new Date(project.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            }) : 'Unknown'}
          </div>
          {project.status === 'completed' && project.updatedAt && (
            <div>
              <span className="text-zinc-500">Completed:</span>{' '}
              {new Date(project.updatedAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RightSidebar({ project }: any) {
  const [showHidden, setShowHidden] = useState(false);

  return (
    <div className="w-80 border-l border-zinc-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4" />
            <h3 className="text-sm font-medium">Project Structure</h3>
          </div>
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
            title={showHidden ? "Hide hidden items" : "Show hidden items"}
          >
            <Eye className={`w-4 h-4 ${showHidden ? 'text-accent' : 'text-zinc-400'}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4">
        <TreeView project={project} showHidden={showHidden} />
      </div>
    </div>
  );
}

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

function TreeView({ project, showHidden }: any) {
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


function EmptyState({ onCreateProject }: any) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
      <div className="w-24 h-24 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4">
        <Folder className="w-12 h-12 text-zinc-700" />
      </div>
      <h2 className="text-xl font-medium text-white mb-2">No Project Selected</h2>
      <p className="text-sm mb-6">Select a project from the sidebar or create a new one</p>
      <button
        onClick={onCreateProject}
        className="bg-accent hover:bg-accent-hover px-6 py-3 rounded-lg flex items-center gap-2 transition-colors font-medium text-white animate-button"
      >
        <Plus className="w-5 h-5" />
        Create New Project
      </button>
    </div>
  );
}

// Generate bright, vibrant color (avoiding brown tones)
const generateBrightColor = () => {
  const brightColors = [
    '#FF6B6B', // Bright red
    '#4ECDC4', // Bright cyan
    '#45B7D1', // Bright blue
    '#FFA07A', // Light salmon
    '#98D8C8', // Mint
    '#F7DC6F', // Bright yellow
    '#BB8FCE', // Bright purple
    '#85C1E2', // Sky blue
    '#F8B739', // Bright orange
    '#52B788', // Bright green
    '#E74C3C', // Red
    '#3498DB', // Blue
    '#9B59B6', // Purple
    '#1ABC9C', // Turquoise
    '#F39C12', // Orange
    '#E91E63', // Pink
    '#00BCD4', // Cyan
    '#8BC34A', // Light green
    '#FF5722', // Deep orange
    '#9C27B0', // Deep purple
  ];
  return brightColors[Math.floor(Math.random() * brightColors.length)];
};

function CreateProjectModal({ onClose, onCreate }: any) {
  const { defaultProjectsPath, clients, addClient, selectedCategory } = useProjectStore();
  const [useDefaultPath, setUseDefaultPath] = useState(true);
  const [newClientName, setNewClientName] = useState('');

  // Get base currency from settings
  const baseCurrency = (localStorage.getItem('baseCurrency') || 'USD') as 'USD' | 'RUB' | 'EUR';

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    path: defaultProjectsPath,
    software: [] as string[],
    tags: [] as string[],
    deadline: '',
    cost: '',
    currency: baseCurrency,
    paymentStatus: 'unpaid' as 'paid' | 'prepaid' | 'unpaid',
    prepaymentAmount: '',
    clientId: '',
    thumbnailPath: '',
    hasShots: false,
    category: selectedCategory
  });

  // Track which date fields user has manually filled
  const [deadlineFieldsFilled, setDeadlineFieldsFilled] = useState({
    day: false,
    month: false,
    year: false
  });

  useEffect(() => {
    if (useDefaultPath && formData.name) {
      const projectName = formData.name.replace(/\s+/g, '');
      setFormData(prev => ({
        ...prev,
        path: `${defaultProjectsPath}\\${projectName}`
      }));
    }
  }, [useDefaultPath, formData.name, defaultProjectsPath]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            try {
              // Convert blob to array buffer
              const arrayBuffer = await blob.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);

              // Save to temp file using Tauri
              const { writeBinaryFile, BaseDirectory } = await import('@tauri-apps/api/fs');
              const { appDataDir } = await import('@tauri-apps/api/path');
              const appDir = await appDataDir();
              const tempFileName = `temp_thumbnail_${Date.now()}.png`;
              const tempPath = `${appDir}\\${tempFileName}`;

              // Write binary file
              await writeBinaryFile(tempFileName, uint8Array, { dir: BaseDirectory.AppData });

              setFormData(prev => ({ ...prev, thumbnailPath: tempPath }));
              console.log('Image pasted from clipboard:', tempPath);
            } catch (error) {
              console.error('Failed to paste image:', error);
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const toggleSoftware = (sw: string) => {
    setFormData(prev => ({
      ...prev,
      software: prev.software.includes(sw)
        ? prev.software.filter(s => s !== sw)
        : [...prev.software, sw]
    }));
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.path) return;

    // If there's a new client name entered but not yet created, create it first
    let finalClientId = formData.clientId;
    if (newClientName.trim() && !formData.clientId) {
      const clientName = newClientName.trim();
      const newClientId = addClient({ name: clientName, color: generateBrightColor() });
      console.log('Auto-created new client with ID:', newClientId);
      finalClientId = newClientId;
    }

    // Auto-fill deadline if only day is entered
    let finalDeadline = formData.deadline;
    if (finalDeadline && deadlineFieldsFilled.day) {
      // If only day is entered (partial date), auto-fill with current month and year
      if (!deadlineFieldsFilled.month || !deadlineFieldsFilled.year) {
        const parts = finalDeadline.split('-');
        const now = new Date();
        const currentYear = String(now.getFullYear());
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const day = parts[2];

        finalDeadline = `${currentYear}-${currentMonth}-${day.padStart(2, '0')}`;
      }
    }

    console.log('Creating project with formData:', formData);
    console.log('finalClientId value:', finalClientId);
    console.log('finalClientId type:', typeof finalClientId);

    const projectData = {
      ...formData,
      deadline: finalDeadline || undefined,
      cost: formData.cost ? parseFloat(formData.cost) : undefined,
      prepaymentAmount: formData.prepaymentAmount ? parseFloat(formData.prepaymentAmount) : undefined,
      paymentStatus: formData.paymentStatus || undefined,
      clientId: finalClientId || undefined,
      hasShots: formData.hasShots
    };
    console.log('Project data being sent:', projectData);
    console.log('projectData.clientId:', projectData.clientId);

    await onCreate(projectData);

    // If thumbnail was selected, set it after project creation
    if (formData.thumbnailPath) {
      try {
        const thumbnailName = await invoke<string>('set_project_thumbnail', {
          projectPath: formData.path,
          imagePath: formData.thumbnailPath
        });
        console.log('Thumbnail set:', thumbnailName);

        // Update the project with the thumbnail
        const { loadProjects } = useProjectStore.getState();
        await loadProjects();
      } catch (error) {
        console.error('Failed to set thumbnail:', error);
      }
    }

    onClose();
  };

  const handleBrowse = async () => {
    console.log('Browse clicked');
    const selected = await selectProjectDirectory();
    console.log('Selected:', selected);
    if (selected) {
      setFormData(prev => ({ ...prev, path: selected }));
      setUseDefaultPath(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
          onClose();
        }
        delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
      }}
    >
      <div className="bg-zinc-900 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-modal" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold">Create New Project</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
            <X className="w-5 h-5 close-button-red" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium mb-1.5">Project Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="My Awesome Project"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of your project..."
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Client</label>
              <select
                value={formData.clientId}
                onChange={(e) => {
                  console.log('Select changed to:', e.target.value);
                  setFormData(prev => ({ ...prev, clientId: e.target.value }));
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                <option value="">No client</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Or Add New</label>
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Client name (Enter)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newClientName.trim()) {
                    e.preventDefault();
                    const clientName = newClientName.trim();

                    // Add client and get the generated ID
                    const newClientId = addClient({ name: clientName, color: generateBrightColor() });
                    console.log('Created new client with ID:', newClientId);

                    // Set the clientId immediately
                    setFormData(prev => {
                      console.log('Setting formData.clientId to:', newClientId);
                      const newData = { ...prev, clientId: newClientId };
                      console.log('New formData:', newData);
                      return newData;
                    });

                    setNewClientName('');
                    console.log('Clients after add:', useProjectStore.getState().clients);
                  }
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Deadline</label>
              <div className="flex gap-2 items-center">
                <div className="relative w-14">
                <input
                  type="text"
                  placeholder="ДД"
                  value={formData.deadline ? formData.deadline.split('-')[2] : ''}
                  onKeyDown={(e) => {
                  if (e.key >= '0' && e.key <= '9') {
                    e.preventDefault();
                    const parts = formData.deadline ? formData.deadline.split('-') : ['', '', ''];
                    const currentDay = parts[2] || '';

                    let newDay;
                    if (currentDay.length >= 2) {
                      // Shift: берем последнюю цифру и добавляем новую
                      newDay = currentDay.slice(-1) + e.key;
                    } else {
                      // Просто добавляем
                      newDay = currentDay + e.key;
                    }

                    const now = new Date();
                    const year = parts[0] || String(now.getFullYear());
                    const month = parts[1] || String(now.getMonth() + 1).padStart(2, '0');

                    // Получаем максимальное количество дней в выбранном месяце
                    const maxDays = new Date(parseInt(year), parseInt(month), 0).getDate();

                    let dayNum = parseInt(newDay);
                    // Если больше максимума для этого месяца, ставим максимум
                    if (dayNum > maxDays) {
                      dayNum = maxDays;
                      newDay = String(maxDays);
                    }
                    // Если меньше 1, ставим 01
                    if (dayNum < 1) {
                      dayNum = 1;
                      newDay = '01';
                    }

                    setFormData(prev => ({ ...prev, deadline: `${year}-${month}-${newDay.padStart(2, '0')}` }));
                    setDeadlineFieldsFilled(prev => ({ ...prev, day: true }));
                  } else if (e.key === 'Backspace') {
                    e.preventDefault();
                    setFormData(prev => ({ ...prev, deadline: '' }));
                    setDeadlineFieldsFilled({ day: false, month: false, year: false });
                  }
                }}
                onChange={() => {}}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-center focus:outline-none focus:border-accent"
              />
              </div>
              <span className="text-zinc-500">.</span>
              <div className="relative w-14">
              {(() => {
                const showAutofill = deadlineFieldsFilled.day && !deadlineFieldsFilled.month;
                const now = new Date();
                const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

                return showAutofill ? (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white" style={{ opacity: 0.3 }}>
                    {currentMonth}
                  </div>
                ) : null;
              })()}
              <input
                type="text"
                placeholder="ММ"
                value={formData.deadline ? formData.deadline.split('-')[1] : ''}
                onKeyDown={(e) => {
                  if (e.key >= '0' && e.key <= '9') {
                    e.preventDefault();
                    const parts = formData.deadline ? formData.deadline.split('-') : ['', '', ''];
                    const currentMonth = parts[1] || '';

                    let newMonth;
                    if (currentMonth.length >= 2) {
                      // Shift: берем последнюю цифру и добавляем новую
                      newMonth = currentMonth.slice(-1) + e.key;
                    } else {
                      // Просто добавляем
                      newMonth = currentMonth + e.key;
                    }

                    let monthNum = parseInt(newMonth);
                    // Если больше 12, ставим 12
                    if (monthNum > 12) {
                      monthNum = 12;
                      newMonth = '12';
                    }
                    // Если меньше 1, ставим 01
                    if (monthNum < 1) {
                      monthNum = 1;
                      newMonth = '01';
                    }

                    const now = new Date();
                    const year = parts[0] || String(now.getFullYear());
                    let day = parts[2] || '01';

                    // Корректируем день, если он больше максимального для нового месяца
                    const maxDays = new Date(parseInt(year), parseInt(newMonth.padStart(2, '0')), 0).getDate();
                    const dayNum = parseInt(day);
                    if (dayNum > maxDays) {
                      day = String(maxDays).padStart(2, '0');
                    }

                    setFormData(prev => ({ ...prev, deadline: `${year}-${newMonth.padStart(2, '0')}-${day}` }));
                    setDeadlineFieldsFilled(prev => ({ ...prev, month: true }));
                  } else if (e.key === 'Backspace') {
                    e.preventDefault();
                    const parts = formData.deadline ? formData.deadline.split('-') : ['', '', ''];
                    if (parts[1]) {
                      const newMonth = parts[1].slice(0, -1);
                      if (newMonth && parts[0] && parts[2]) {
                        setFormData(prev => ({ ...prev, deadline: `${parts[0]}-${newMonth.padStart(2, '0')}-${parts[2]}` }));
                      } else {
                        setDeadlineFieldsFilled(prev => ({ ...prev, month: false }));
                      }
                    }
                  }
                }}
                onChange={() => {}}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-center focus:outline-none focus:border-accent"
              />
              </div>
              <span className="text-zinc-500">.</span>
              <div className="relative w-14">
              {(() => {
                const showAutofill = deadlineFieldsFilled.day && !deadlineFieldsFilled.year;
                const now = new Date();
                const currentYear = String(now.getFullYear()).slice(-2);

                return showAutofill ? (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white" style={{ opacity: 0.3 }}>
                    {currentYear}
                  </div>
                ) : null;
              })()}
              <input
                type="text"
                placeholder="ГГ"
                value={formData.deadline ? formData.deadline.split('-')[0].slice(-2) : ''}
                onKeyDown={(e) => {
                  if (e.key >= '0' && e.key <= '9') {
                    e.preventDefault();
                    const parts = formData.deadline ? formData.deadline.split('-') : ['', '', ''];
                    const currentYear = parts[0] ? parts[0].slice(-2) : '';

                    let newYear;
                    if (currentYear.length >= 2) {
                      // Shift: берем последнюю цифру и добавляем новую
                      newYear = currentYear.slice(-1) + e.key;
                    } else {
                      // Просто добавляем
                      newYear = currentYear + e.key;
                    }

                    const now = new Date();
                    const currentYearFull = now.getFullYear();
                    const maxYearFull = currentYearFull + 1;
                    const maxYearShort = String(maxYearFull).slice(-2);

                    let fullYear = '20' + newYear.padStart(2, '0');
                    let fullYearNum = parseInt(fullYear);

                    // Если год больше чем на 1 год позже текущего, ставим максимальный
                    if (fullYearNum > maxYearFull) {
                      fullYear = String(maxYearFull);
                      newYear = maxYearShort;
                    }

                    const month = parts[1] || String(now.getMonth() + 1).padStart(2, '0');
                    let day = parts[2] || '01';

                    // Корректируем день, если он больше максимального для выбранного месяца и года
                    const maxDays = new Date(parseInt(fullYear), parseInt(month), 0).getDate();
                    const dayNum = parseInt(day);
                    if (dayNum > maxDays) {
                      day = String(maxDays).padStart(2, '0');
                    }

                    setFormData(prev => ({ ...prev, deadline: `${fullYear}-${month}-${day}` }));
                    setDeadlineFieldsFilled(prev => ({ ...prev, year: true }));
                  } else if (e.key === 'Backspace') {
                    e.preventDefault();
                    const parts = formData.deadline ? formData.deadline.split('-') : ['', '', ''];
                    if (parts[0]) {
                      const currentYear = parts[0].slice(-2);
                      const newYear = currentYear.slice(0, -1);
                      if (newYear && parts[1] && parts[2]) {
                        const fullYear = '20' + newYear.padStart(2, '0');
                        setFormData(prev => ({ ...prev, deadline: `${fullYear}-${parts[1]}-${parts[2]}` }));
                      } else {
                        setDeadlineFieldsFilled(prev => ({ ...prev, year: false }));
                      }
                    }
                  }
                }}
                onChange={() => {}}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-center focus:outline-none focus:border-accent"
              />
              </div>
              <div className="relative w-8 h-8 flex items-center justify-center calendar-icon-wrapper">
                <style>{`
                  .calendar-icon-wrapper {
                    cursor: pointer !important;
                  }
                  .calendar-icon-wrapper input[type="date"] {
                    cursor: pointer !important;
                  }
                  .calendar-icon-wrapper input[type="date"]::-webkit-calendar-picker-indicator {
                    cursor: pointer !important;
                  }
                `}</style>
                <input
                  type="date"
                  value={formData.deadline || ''}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, deadline: e.target.value }));
                    if (e.target.value) {
                      setDeadlineFieldsFilled({ day: true, month: true, year: true });
                    }
                  }}
                  className="absolute opacity-0"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 10
                  }}
                />
                <svg
                  className="w-5 h-5 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  style={{ pointerEvents: 'none', position: 'relative', zIndex: 5 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Cost</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={formData.cost}
                  onChange={(e) => setFormData(prev => ({ ...prev, cost: e.target.value }))}
                  placeholder="0"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value as 'USD' | 'RUB' | 'EUR' }))}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                >
                  <option value="USD">USD</option>
                  <option value="RUB">RUB</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Software Tools</label>
            <div className="grid grid-cols-3 gap-2">
              {SOFTWARE_OPTIONS.map(sw => (
                <button
                  key={sw}
                  onClick={() => toggleSoftware(sw)}
                  className={`px-3 py-2 rounded-lg border transition-colors text-sm flex items-center gap-2 ${
                    formData.software.includes(sw)
                      ? 'bg-accent border-accent'
                      : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <SoftwareIcon name={sw} />
                  <span className="truncate">{sw}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Project Thumbnail <span className="text-xs text-zinc-500">(Ctrl+V to paste)</span></label>
            <div className="flex gap-2 items-center">
              {formData.thumbnailPath && (
                <div className="w-16 h-16 rounded-lg overflow-hidden border border-zinc-700 flex-shrink-0 bg-zinc-800">
                  <img
                    src={convertFileSrc(formData.thumbnailPath)}
                    alt="Thumbnail preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.error('Failed to load thumbnail preview:', formData.thumbnailPath);
                      console.error('Converted src:', convertFileSrc(formData.thumbnailPath));
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="flex gap-2 flex-1">
                <button
                  type="button"
                  onClick={async () => {
                    const { selectImageFile } = await import('./utils/tauri');
                    const imagePath = await selectImageFile();
                    if (imagePath) {
                      // If there's already a thumbnail, clear it first to ensure React updates
                      if (formData.thumbnailPath) {
                        setFormData(prev => ({ ...prev, thumbnailPath: '' }));
                        // Use setTimeout to ensure state update completes before setting new path
                        await new Promise(resolve => setTimeout(resolve, 0));
                      }
                      setFormData(prev => ({ ...prev, thumbnailPath: imagePath }));
                    }
                  }}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm"
                >
                  Choose Image
                </button>
                {formData.thumbnailPath && (
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, thumbnailPath: '' }))}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.hasShots}
                onChange={(e) => setFormData(prev => ({ ...prev, hasShots: e.target.checked }))}
                className="w-4 h-4"
              />
              <span className="text-sm">Has shots</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useDefaultPath}
                onChange={(e) => setUseDefaultPath(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Use default path</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Project Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.path}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, path: e.target.value }));
                  setUseDefaultPath(false);
                }}
                disabled={useDefaultPath}
                placeholder="/home/user/projects/my-project"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
              />
              <button
                onClick={handleBrowse}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm"
              >
                Browse
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!formData.name || !formData.path}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium animate-button text-sm"
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;