import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  IconMinus,
  IconSquare,
  IconX,
  IconSearch,
  IconLayoutGrid,
  IconStarFilled,
  IconStar,
  IconArchive,
  IconFilter,
  IconChevronRight,
  IconFolder,
  IconPlus,
  IconChartBar,
  IconSettings,
  IconPin,
  IconPinFilled,
  IconPhoto,
  IconCircleFilled,
  IconCurrencyDollar,
  IconTrash,
  IconUser,
  IconCalendarEvent,
  IconSortAscendingLetters,
  IconClockHour3,
} from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api/tauri';
import { useProjectStore } from './store/projectStore';
import { useContextMenuStore } from './store/contextMenuStore';
import { useShallow } from 'zustand/react/shallow';
import { SettingsPanel } from './components/modals/SettingsPanel';
import { FeedbackPanel } from './components/modals/FeedbackPanel';
import { AboutPanel } from './components/modals/AboutPanel';
// MDXEditor imports moved to NotesSection component
import { SoftwareIcon } from './components/SoftwareIcon';
import { ProjectCard } from './components/ProjectCard';
import { appWindow } from '@tauri-apps/api/window';
import { DeadlineNotification } from './components/DeadlineNotification';
import { GeneralNotification } from './components/notifications/GeneralNotification';
import type { GeneralNotification as GeneralNotificationType } from './components/notifications/GeneralNotification';
import { RenameSceneConfirmModal } from './components/modals/RenameSceneConfirmModal';
import { useWindowState } from './hooks/useWindowState';
// useThumbnail moved to child components
import { CategoryTabs } from './components/CategoryTabs';
import { WelcomeSetup } from './components/modals/WelcomeSetup';
import { BreakReminderContainer } from './components/time';
import type { BreakReminder } from './components/time';
import { useTimeTrackingStore, TimerService } from './features/time-tracking';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';

// Import refactored components
import { EmptyState } from './components/shared';
import { FinancePage } from './components/finance';
import { ProjectDetails, RightSidebar } from './components/project';
import ShotsBrowser from './components/project/ShotsBrowser';
import { CreateProjectModal } from './components/modals';
import { AssetNameModal } from './components/modals/AssetNameModal';
import { darkenColor, STATUS_COLORS, STATUS_LABELS, hslStringToHex } from './utils';
import { ContextMenu, ContextMenuItem, ContextMenuDivider, GlobalTextContextMenu } from './components/ui/ContextMenu';
import { useContextMenu } from './hooks/useContextMenu';

// darkenColor now imported from utils

// ✅ PieChart now imported from './components/shared'

// ✅ STATUS_COLORS, STATUS_LABELS, SOFTWARE_OPTIONS now imported from './utils'

type ProjectStatus = 'active' | 'archived' | 'completed' | 'paused';
const STATUS_CYCLE: ProjectStatus[] = ['active', 'paused', 'completed'];

// ✅ LinkItem now imported from './components/shared'

// ✅ NotesSection now imported from './components/shared'

// ✅ LinkInputForm now imported from './components/shared'

// ✅ VersionsOverview now imported from './components/project'
// ✅ FinanceProjectDetails now imported from './components/finance'
// ✅ FinancePage now imported from './components/finance'

// Project Breakdown Card Component
// ✅ ProjectBreakdownCard now imported from './components/finance/ProjectBreakdownCard'

function App() {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  console.log('[App] RENDER', { renderCount: renderCountRef.current, timestamp: performance.now() });

  // Window state management
  const { saveWindowState } = useWindowState();

  // ✅ OPTIMIZATION APPROACH:
  // Problem: state.projects array is recreated every second when timer updates timeEntries
  // Solution: Subscribe to projects but use useMemo to prevent unnecessary re-renders downstream

  // Get full projects array (will update every second, but that's OK)
  const projects = useProjectStore((state) => state.projects);

  // Get other store values with useShallow for shallow comparison
  const {
    isLoading,
    loadProjects,
    selectProject,
    openInExplorer,
    launchSoftware,
    launchSoftwareWithoutProject,
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
    addCategory,
    launchingStatus,
    isRenaming,
    renameProgress
  } = useProjectStore(
    useShallow((state) => ({
      isLoading: state.isLoading,
      loadProjects: state.loadProjects,
      selectProject: state.selectProject,
      openInExplorer: state.openInExplorer,
      launchSoftware: state.launchSoftware,
      launchSoftwareWithoutProject: state.launchSoftwareWithoutProject,
      createProject: state.createProject,
      updateStatus: state.updateStatus,
      deleteProject: state.deleteProject,
      togglePin: state.togglePin,
      toggleFavorite: state.toggleFavorite,
      updateProject: state.updateProject,
      clients: state.clients,
      deleteClient: state.deleteClient,
      categories: state.categories,
      selectedCategory: state.selectedCategory,
      setSelectedCategory: state.setSelectedCategory,
      addCategory: state.addCategory,
      launchingStatus: state.launchingStatus,
      isRenaming: state.isRenaming,
      renameProgress: state.renameProgress,
    }))
  );

  const { activeMenu, setActiveMenu } = useContextMenuStore();

  // Subscribe to sessions changes for proper reactivity
  const timeTrackingSessions = useTimeTrackingStore(state => state.sessions);

  //const [view, setView] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [assetNameDialog, setAssetNameDialog] = useState<{
    software: any;
    projectName: string;
    projectPath: string;
    softwareKey: string;
  } | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [filterView, setFilterView] = useState<'all' | 'favorites' | 'archive'>('all');
  // Context menu for project cards using centralized hook
  const { isOpen: isProjectMenuOpen, position: projectMenuPosition, data: projectMenuData, openMenu: openProjectMenu, closeMenu: closeProjectMenu } = useContextMenu<string>();
  const [contextMenuMounted, setContextMenuMounted] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showClientSubmenu, setShowClientSubmenu] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const clientSubmenuTimeoutRef = useRef<number | null>(null);
  const categorySubmenuTimeoutRef = useRef<number | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const categorySubmenuRef = useRef<HTMLDivElement>(null);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'deadline' | 'cost'>('createdAt');
  const [viewMode, setViewMode] = useState<'projects' | 'finance'>('projects');
  const [financePageMounted, setFinancePageMounted] = useState(false);
  const [showTagIcons, setShowTagIcons] = useState(() => {
    const saved = localStorage.getItem('showTagIcons');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'project' | 'client' | 'category'; name: string; id: string; path?: string; projectCount?: number } | null>(null);
  const [previousProjectId, setPreviousProjectId] = useState<string | null>(null);
  const [deadlineNotifications, setDeadlineNotifications] = useState<Array<{ id: string; projectName: string; daysRemaining: number }>>([]);
  const [notificationsShown, setNotificationsShown] = useState(false); // Track if notifications were shown this session
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [showCategoryBar, setShowCategoryBar] = useState(() => {
    const saved = localStorage.getItem('showCategoryBar');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [shotsBrowserDocked, setShotsBrowserDocked] = useState(() => {
    const saved = localStorage.getItem('shotsBrowserDocked');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [showWelcomeSetup, setShowWelcomeSetup] = useState(false);
  const [, setIsWindowVisible] = useState(true); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [, setForceRenderKey] = useState(0); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [breakReminders, setBreakReminders] = useState<BreakReminder[]>([]);
  const [shownReminders, setShownReminders] = useState<Set<string>>(new Set());
  const [generalNotifications, setGeneralNotifications] = useState<GeneralNotificationType[]>([]);
  const [showCategorySubmenu, setShowCategorySubmenu] = useState(false);
  const [accentColor, setAccentColor] = useState(() => {
    return localStorage.getItem('accentColor') || '#8B5CF6';
  });
  const [showBottomShadow, setShowBottomShadow] = useState(true);
  const [showTopShadow, setShowTopShadow] = useState(false);
  const projectListRef = useRef<HTMLDivElement>(null);

  // Scene rename confirmation state
  const [sceneRenameConfirm, setSceneRenameConfirm] = useState<{
    isOpen: boolean;
    sceneName: string;
    fileCount: { versionFiles: number; thumbnails: number };
    onConfirm: () => void;
    onCancel: () => void;
    isShot?: boolean;
  } | null>(null);

  // Add general notification
  const addGeneralNotification = (
    type: 'success' | 'error' | 'warning' | 'info',
    message: string,
    title?: string,
    duration?: number
  ) => {
    const id = `${Date.now()}-${Math.random()}`;
    const notification: GeneralNotificationType = { id, type, message, title, duration };
    setGeneralNotifications(prev => [...prev, notification]);
  };

  // Remove general notification
  const removeGeneralNotification = (id: string) => {
    setGeneralNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Expose notification function to window for projectStore
  useEffect(() => {
    (window as any).showNotification = addGeneralNotification;

    // Watch for scene rename confirmation requests
    const checkInterval = setInterval(() => {
      if ((window as any).showSceneRenameConfirm && (window as any).confirmSceneRename) {
        const data = (window as any).confirmSceneRename;

        // Clear flags immediately to prevent double-trigger
        delete (window as any).showSceneRenameConfirm;
        delete (window as any).confirmSceneRename;

        setSceneRenameConfirm({
          isOpen: true,
          sceneName: data.sceneName,
          fileCount: data.fileCount,
          isShot: data.isShot || false,
          onConfirm: () => {
            data.onConfirm();
            setSceneRenameConfirm(null);
          },
          onCancel: () => {
            data.onCancel();
            setSceneRenameConfirm(null);
          }
        });
      }
    }, 100);

    return () => {
      clearInterval(checkInterval);
      delete (window as any).showNotification;
      delete (window as any).showSceneRenameConfirm;
      delete (window as any).confirmSceneRename;
    };
  }, [addGeneralNotification]);

  // Check if we should show welcome setup
  useEffect(() => {
    const completed = localStorage.getItem('setupCompleted');
    const hasDefaultPath = localStorage.getItem('defaultProjectsPath');

    // Show welcome if setup not completed OR no default path set
    if (!completed || !hasDefaultPath) {
      setShowWelcomeSetup(true);
    }
  }, []);

  // Handle window maximize/unmaximize to cover rounded corners
  useEffect(() => {
    let saveTimeout: ReturnType<typeof setTimeout>;

    const updateFullscreenClass = async () => {
      const isMaximized = await appWindow.isMaximized();
      const isFullscreen = await appWindow.isFullscreen();

      if (isMaximized || isFullscreen) {
        document.documentElement.classList.add('fullscreen');
        document.body.classList.add('fullscreen');
      } else {
        document.documentElement.classList.remove('fullscreen');
        document.body.classList.remove('fullscreen');
      }

      // Save window state after resize (debounced)
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveWindowState();
      }, 300);
    };

    updateFullscreenClass();

    const unlisten = appWindow.onResized(() => {
      updateFullscreenClass();
    });

    return () => {
      clearTimeout(saveTimeout);
      unlisten.then(f => f());
    };
  }, [saveWindowState]);

  // Handle window focus and visibility to fix blank screen on restore
  useEffect(() => {
    let isCleanedUp = false;

    // Tauri window focus listener
    const setupFocusListener = async () => {
      const unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
        if (isCleanedUp) return;

        if (focused) {
          // Window gained focus - force re-render with requestAnimationFrame
          console.log('[Window] Focus gained - forcing re-render');
          requestAnimationFrame(() => {
            if (!isCleanedUp) {
              setIsWindowVisible(true);
              setForceRenderKey(prev => prev + 1);
            }
          });
        } else {
          console.log('[Window] Focus lost');
          setIsWindowVisible(false);
        }
      });
      return unlisten;
    };

    const unlistenPromise = setupFocusListener();

    // Browser visibility change listener
    const handleVisibilityChange = () => {
      if (isCleanedUp) return;

      if (!document.hidden) {
        console.log('[Document] Visibility restored - forcing re-render');
        requestAnimationFrame(() => {
          if (!isCleanedUp) {
            setIsWindowVisible(true);
            setForceRenderKey(prev => prev + 1);
          }
        });
      } else {
        console.log('[Document] Hidden');
        setIsWindowVisible(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isCleanedUp = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  // Show window after WebView is ready (prevents white flash)
  // Rust applies position/size in setup hook, but doesn't show window
  // We show it here after React has rendered
  useEffect(() => {
    let didRun = false;

    const initWindow = async () => {
      if (didRun) return;
      didRun = true;

      // Rust already applied window settings (position, size, maximize)
      // Double rAF ensures paint is complete
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(undefined))));
      await invoke('show_main_window');
    };

    initWindow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - run only once on mount

  // Save window state on move
  useEffect(() => {
    let saveTimeout: ReturnType<typeof setTimeout>;

    const unlisten = appWindow.onMoved(() => {
      // Debounce saves to avoid excessive writes
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveWindowState();
      }, 300);
    });

    return () => {
      clearTimeout(saveTimeout);
      unlisten.then(f => f());
    };
  }, [saveWindowState]);

  // Save window state before closing
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveWindowState();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveWindowState]);

  // Temporary keybind to show welcome setup (numpad decimal/dot)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'NumpadDecimal' || e.key === 'Decimal') {
        e.preventDefault();
        setShowWelcomeSetup(true);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Stop all active time tracking sessions when time tracking is disabled
  useEffect(() => {
    const handleTimeTrackingToggle = async () => {
      const timeTrackingEnabled = localStorage.getItem('timeTrackingEnabled');
      const isEnabled = timeTrackingEnabled !== null ? JSON.parse(timeTrackingEnabled) : true;

      if (!isEnabled) {
        console.log('[TimeTracking] 🛑 Time tracking disabled, stopping all active sessions');
        const { getAllSessions, stopSession } = useTimeTrackingStore.getState();
        const activeSessions = getAllSessions().filter(s => s.isActive);

        if (activeSessions.length > 0) {
          console.log(`[TimeTracking] 🛑 Stopping ${activeSessions.length} active session(s)`);

          // Stop all active sessions
          for (const session of activeSessions) {
            try {
              await stopSession(session.id);
              console.log(`[TimeTracking] ✓ Stopped session ${session.id} (${session.software})`);
            } catch (error) {
              console.error(`[TimeTracking] ✗ Failed to stop session ${session.id}:`, error);
            }
          }

          console.log('[TimeTracking] ✓ All active sessions stopped');
        } else {
          console.log('[TimeTracking] No active sessions to stop');
        }
      }
    };

    window.addEventListener('storage', handleTimeTrackingToggle);
    return () => window.removeEventListener('storage', handleTimeTrackingToggle);
  }, []);

  // Hotkeys: F to toggle Finance mode, Ctrl+N to create new project, F11 for fullscreen, Escape to close modals
  useEffect(() => {
    const handleGlobalHotkeys = async (e: KeyboardEvent) => {
      // Ignore if typing in input, textarea, or contenteditable element
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' ||
                       target.tagName === 'TEXTAREA' ||
                       target.isContentEditable;

      // F11 - Toggle fullscreen
      if (e.key === 'F11') {
        e.preventDefault();
        const isFullscreen = await appWindow.isFullscreen();
        const isMaximized = await appWindow.isMaximized();

        if (isFullscreen) {
          // Exit fullscreen mode
          await appWindow.setFullscreen(false);
        } else {
          // Enter fullscreen mode - unmaximize first if needed
          if (isMaximized) {
            await appWindow.unmaximize();
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          await appWindow.setFullscreen(true);
        }

        // Update class after state change
        setTimeout(async () => {
          const newFullscreenState = await appWindow.isFullscreen();
          const newMaximizedState = await appWindow.isMaximized();
          if (newFullscreenState || newMaximizedState) {
            document.documentElement.classList.add('fullscreen');
            document.body.classList.add('fullscreen');
          } else {
            document.documentElement.classList.remove('fullscreen');
            document.body.classList.remove('fullscreen');
          }
        }, 100);
        return;
      }

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
        if (showAbout) {
          e.preventDefault();
          setShowAbout(false);
          return;
        }
        if (deleteConfirm) {
          e.preventDefault();
          setDeleteConfirm(null);
          return;
        }
        if (sceneRenameConfirm) {
          e.preventDefault();
          sceneRenameConfirm.onCancel();
          setSceneRenameConfirm(null);
          return;
        }
        if (selectedProjectId) {
          // Don't close project if user is editing (input/textarea has focus)
          const target = e.target as HTMLElement;
          const isEditing = target?.tagName === 'INPUT' ||
                           target?.tagName === 'TEXTAREA' ||
                           target?.isContentEditable ||
                           document.activeElement?.tagName === 'INPUT' ||
                           document.activeElement?.tagName === 'TEXTAREA';
          if (isEditing) {
            return; // Let the input handle ESC
          }
          e.preventDefault();
          setSelectedProjectId(null);
          return;
        }
      }

      // Enter - Confirm delete
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        if (deleteConfirm) {
          e.preventDefault();
          // Execute delete action
          (async () => {
            if (deleteConfirm.type === 'project' && deleteConfirm.path) {
              await deleteProject(deleteConfirm.path);
            } else if (deleteConfirm.type === 'client') {
              deleteClient(deleteConfirm.id);
            } else if (deleteConfirm.type === 'category') {
              const { removeCategory } = useProjectStore.getState();
              await removeCategory(deleteConfirm.id);
            }
            setDeleteConfirm(null);
          })();
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
        // React 18 batches these state updates automatically in event handlers
        if (viewMode === 'projects') {
          // Entering Finance mode - all updates batched together
          setViewMode('finance');
          setFinancePageMounted(true);
          setPreviousProjectId(selectedProjectId);
          setSelectedProjectId(null);
        } else {
          // Exiting Finance mode - restore previous project
          setViewMode('projects');
          setSelectedProjectId(previousProjectId);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalHotkeys);
    return () => window.removeEventListener('keydown', handleGlobalHotkeys);
  }, [viewMode, selectedProjectId, previousProjectId, showCreateModal, showSettings, showFeedback, showAbout, showWelcomeSetup, deleteConfirm, sceneRenameConfirm]);

  // Break reminders - check active sessions every minute
  useEffect(() => {
    // Check if break reminders are enabled
    const breakRemindersEnabled = (() => {
      const saved = localStorage.getItem('breakRemindersEnabled');
      return saved ? JSON.parse(saved) : true; // Default: enabled
    })();

    if (!breakRemindersEnabled) return;

    // Get break intervals from settings (default: 2h, 4h, 6h)
    const breakIntervals = (() => {
      const saved = localStorage.getItem('breakIntervals');
      return saved ? JSON.parse(saved) : [120, 240, 360];
    })();

    const checkBreakReminders = async () => {
      try {
        const sessions = await invoke<any[]>('get_active_sessions');

        sessions.forEach(session => {
          const minutesWorked = session.accumulated_minutes;

          // Trigger at configured thresholds
          const thresholds = [
            { minutes: breakIntervals[0], breakDuration: 5 },
            { minutes: breakIntervals[1], breakDuration: 15 },
            { minutes: breakIntervals[2], breakDuration: 30 }
          ];

          thresholds.forEach(({ minutes, breakDuration }) => {
            const reminderKey = `${session.entry_id}-${minutes}`;

            // Only trigger once per threshold when we reach it
            if (minutesWorked >= minutes && !shownReminders.has(reminderKey)) {
              // Find project name
              const project = projects.find(p => p.id === session.project_id);
              const projectName = project?.name || 'Unknown Project';

              setBreakReminders(prev => [...prev, {
                id: crypto.randomUUID(),
                sessionId: session.entry_id,
                projectName,
                duration: minutesWorked,
                breakDuration,
                type: 'break'
              }]);

              setShownReminders(prev => new Set(prev).add(reminderKey));
            }
          });
        });
      } catch (error) {
        console.error('Failed to check break reminders:', error);
      }
    };

    // Check immediately and then every minute
    checkBreakReminders();
    const interval = setInterval(checkBreakReminders, 60000);

    return () => clearInterval(interval);
  }, [projects, shownReminders]);

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

      // Clean up temp file after successful copy
      const { removeFile } = await import('@tauri-apps/api/fs');
      await removeFile(tempPath).catch(() => {}); // Ignore errors

      updateProject({ ...project, thumbnail: thumbnailName });
    } catch (error) {
      console.error('Failed to process image:', error);
    }
  };

  useEffect(() => {
    console.log('[App] Loading projects and initializing time tracking...');
    loadProjects().then(() => {
      console.log('[App] Projects loaded');
      // NOTE: Global statistics are persisted in localStorage via timeStatsStore
      // No need to sync from timeEntries - stats are incremented in real-time

      console.log('[App] Initializing time tracking sessions from backend...');
      // Initialize time tracking from backend active sessions
      const { initializeFromBackend } = useTimeTrackingStore.getState();
      initializeFromBackend();
    });

    // Cleanup on unmount
    return () => {
      console.log('[App] Unmounting, stopping all timers...');
      TimerService.stopAll();
    };
  }, []);

  // Separate useEffect for accent color and animations
  useEffect(() => {
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
    console.log('ANIMATIONS DEBUG:', { animationsEnabled, parsed: animationsEnabled !== null ? JSON.parse(animationsEnabled) : null, bodyClasses: document.body.className });
    if (animationsEnabled !== null && !JSON.parse(animationsEnabled)) {
      document.body.classList.add('animations-disabled');
    }
    console.log('ANIMATIONS AFTER:', document.body.className);

    // Disable default Windows context menu globally
    const disableContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Allow context menu on input/textarea for copy/paste
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }

      // Allow context menu on contenteditable elements (Notes/MDXEditor)
      if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
        return;
      }

      // Allow context menu when text is selected
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        return;
      }

      // Allow context menu only on project cards (for custom menu)
      if (!target.closest('[data-project-card]')) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', disableContextMenu);
    return () => document.removeEventListener('contextmenu', disableContextMenu);
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

      // Get custom deadline days from settings (default 3)
      const deadlineNotificationDays = localStorage.getItem('deadlineNotificationDays');
      const maxDays = deadlineNotificationDays ? parseInt(deadlineNotificationDays) : 3;

      projects.forEach((project) => {
        if (project.deadline && project.status !== 'completed' && project.status !== 'archived') {
          const deadlineDate = new Date(project.deadline);
          deadlineDate.setHours(0, 0, 0, 0); // Reset time to start of day
          const timeDiff = deadlineDate.getTime() - now.getTime();
          const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

          // Show notification if within custom days range (excluding overdue projects)
          if (daysRemaining >= 0 && daysRemaining <= maxDays) {
            notifications.push({
              id: project.id,
              projectName: project.name,
              daysRemaining: daysRemaining
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
        setAccentColor(savedColor);
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

  // Helper function to close context menu
  const closeContextMenu = useCallback(() => {
    closeProjectMenu();
    setContextMenuMounted(false);
  }, [closeProjectMenu]);

  // Close context menu when another menu opens
  useEffect(() => {
    if (activeMenu !== 'projects' && isProjectMenuOpen) {
      closeContextMenu();
      setShowCategorySubmenu(false);
    }
  }, [activeMenu, isProjectMenuOpen, closeContextMenu]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking on delete button
      if (target.closest('[data-delete-button]')) return;
      closeContextMenu();
      setShowCategorySubmenu(false);
      setActiveMenu(null);
    };
    if (isProjectMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isProjectMenuOpen, closeContextMenu]);

  // Force re-render context menu after mount to get correct dimensions
  useEffect(() => {
    if (isProjectMenuOpen && !contextMenuMounted) {
      // Use RAF to ensure the menu is fully rendered
      requestAnimationFrame(() => {
        setContextMenuMounted(true);
      });
    }
  }, [isProjectMenuOpen, contextMenuMounted]);

  // Close filter menu when another menu opens
  useEffect(() => {
    if (activeMenu !== 'filters' && showFilterMenu) {
      setShowFilterMenu(false);
      setShowClientSubmenu(false);
    }
  }, [activeMenu]);

  // Close filter menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
        setShowClientSubmenu(false);
        setActiveMenu(null);
      }
    };
    if (showFilterMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilterMenu]);

  // ✅ OPTIMIZATION: Memoize expensive filter/sort operations
  // Only recalculates when dependencies actually change
  const filteredProjects = useMemo(() => {
    return projects
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
  }, [projects, searchQuery, selectedCategory, selectedClientId, filterView, sortBy]);

  // ✅ OPTIMIZATION: Memoize event handlers to maintain stable function references
  const handleOpenProject = useCallback((project: any) => {
    setSelectedProjectId(project.id);
    selectProject(project);

    // Trigger version list update when project is opened
    // This ensures versions are refreshed even if files were deleted outside the app
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('version-created', {
        detail: { projectPath: project.path }
      }));
    }, 100);
  }, [selectProject]);

  const selectedProject = useMemo(() =>
    projects.find(p => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const cycleStatus = useCallback((projectId: string, currentStatus: ProjectStatus) => {
    const currentIndex = STATUS_CYCLE.indexOf(currentStatus);
    const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIndex];
    updateStatus(projectId, nextStatus);
  }, [updateStatus]);

  // Check if project list is scrolled to bottom
  const handleProjectListScroll = useCallback(() => {
    if (projectListRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = projectListRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 5;
      const isAtTop = scrollTop < 5;
      setShowBottomShadow(!isAtBottom);
      setShowTopShadow(!isAtTop);
    }
  }, []);

  // Check scroll position when projects change
  useEffect(() => {
    handleProjectListScroll();
  }, [filteredProjects, handleProjectListScroll]);

  // Add scroll event listener to project list
  useEffect(() => {
    const scrollElement = projectListRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleProjectListScroll);
      return () => {
        scrollElement.removeEventListener('scroll', handleProjectListScroll);
      };
    }
  }, [handleProjectListScroll]);

  // ✅ OPTIMIZATION: Memoize expensive computations to avoid recalculating on every render
  // Create a Map of clients by ID for O(1) lookup instead of O(n) find operations
  const clientsById = useMemo(() => {
    const map = new Map();
    clients.forEach(client => map.set(client.id, client));
    return map;
  }, [clients]);

  // Memoize active sessions lookup - uses timeTrackingSessions for proper reactivity
  const activeSessionsByProject = useMemo(() => {
    const map = new Map();
    // Check sessions directly from the subscribed state
    Array.from(timeTrackingSessions.values()).forEach(session => {
      if (session.isActive) {
        map.set(session.projectId, true);
      }
    });
    return map;
  }, [timeTrackingSessions]);

  const getDaysRemaining = useCallback((deadline?: string): number | null => {
    if (!deadline) return null;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadlineDate.setHours(0, 0, 0, 0);
    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, []);

  // Memoize the onClose callback to prevent unnecessary re-renders
  const handleCloseFinance = useCallback(() => {
    setSelectedProjectId(null);
  }, []);

  // Memoize the finance mode toggle - using React 18 automatic batching
  const handleToggleFinanceMode = useCallback(() => {
    // React 18 batches these automatically in event handlers
    setViewMode('finance');
    setFinancePageMounted(true); // Mount FinancePage on first use
    setPreviousProjectId(selectedProjectId);
    setSelectedProjectId(null);
  }, [selectedProjectId]);

  // Prevent file drop and show correct cursor - simplified approach
  useEffect(() => {
    const preventDrop = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'none';
      }
    };

    // Both dragenter and dragover are needed to prevent flashing
    document.addEventListener('dragenter', preventDrop);
    document.addEventListener('dragover', preventDrop);
    document.addEventListener('drop', preventDrop);

    return () => {
      document.removeEventListener('dragenter', preventDrop);
      document.removeEventListener('dragover', preventDrop);
      document.removeEventListener('drop', preventDrop);
    };
  }, []);

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

      {/* General Notifications */}
      <div className="fixed top-12 right-4 z-50 flex flex-col gap-3 pointer-events-none">
        <div className="flex flex-col gap-3 pointer-events-auto">
          {generalNotifications.map((notification) => (
            <GeneralNotification
              key={notification.id}
              notification={notification}
              onClose={() => removeGeneralNotification(notification.id)}
            />
          ))}
        </div>
      </div>

      {/* Scene Rename Confirmation Modal */}
      {sceneRenameConfirm && (
        <RenameSceneConfirmModal
          isOpen={sceneRenameConfirm.isOpen}
          onClose={() => {
            if (!isRenaming) {
              sceneRenameConfirm.onCancel();
              setSceneRenameConfirm(null);
            }
          }}
          onConfirm={sceneRenameConfirm.onConfirm}
          sceneName={sceneRenameConfirm.sceneName}
          fileCount={sceneRenameConfirm.fileCount}
          isRenaming={isRenaming}
          progress={renameProgress}
          isShot={sceneRenameConfirm.isShot || false}
        />
      )}

      {/* Custom Title Bar */}
      <div className="h-8 bg-sidebar-bg flex items-center justify-between select-none flex-shrink-0 rounded-t-lg relative z-[60]">
        <div
          className="flex items-center gap-2 flex-1 h-full"
          style={{ paddingLeft: '13px' }}
          onMouseDown={(e) => {
            // Only drag if not clicking on the logo button
            if (!(e.target as HTMLElement).closest('button')) {
              appWindow.startDragging();
            }
          }}
        >
          <button
            onClick={() => setShowAbout(true)}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
            title="About"
          >
            <img src="/icon.png" alt="Logo" className="w-4 h-4 select-none pointer-events-none" />
          </button>
        </div>

        <div
          className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-1 pointer-events-none"
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
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={showCategoryBar ? "text-zinc-400 opacity-80" : "text-zinc-600 opacity-80"}>
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
            <IconMinus stroke={1.5} className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          <button
            onClick={async () => {
              console.log('Maximize clicked');
              const isFullscreen = await appWindow.isFullscreen();
              if (isFullscreen) {
                // Exit fullscreen if currently in fullscreen mode
                await appWindow.setFullscreen(false);
              } else {
                // Normal maximize toggle
                appWindow.toggleMaximize();
              }

              // Save window state after animation completes
              setTimeout(() => {
                saveWindowState();
              }, 200);
            }}
            className="w-8 h-6 hover:bg-zinc-800 flex items-center justify-center transition-colors rounded"
            title="Maximize"
          >
            <IconSquare stroke={1.5} className="w-3 h-3 text-zinc-400" />
          </button>
          <button
            onClick={() => {
              console.log('Close clicked');
              appWindow.close();
            }}
            className="w-8 h-6 hover:bg-red-600 flex items-center justify-center transition-colors rounded"
            title="Close"
          >
            <IconX stroke={1.5} className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
      {/* Category Tabs - крайний левый */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          width: showCategoryBar ? '40px' : '0px',
          opacity: showCategoryBar ? 1 : 0
        }}
      >
        <CategoryTabs
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onAddCategory={addCategory}
          onDeleteCategory={(categoryName) => {
            const projectCount = projects.filter(p => p.category === categoryName).length;
            setDeleteConfirm({
              type: 'category',
              name: categoryName,
              id: categoryName,
              projectCount: projectCount > 0 ? projectCount : undefined
            });
          }}
          onRenameCategory={async (oldName, newName) => {
            const { renameCategory } = useProjectStore.getState();
            await renameCategory(oldName, newName);
          }}
          accentColor={accentColor}
        />
      </div>
      {/* Sidebar - Project List */}
      <div className="w-80 border-r border-t border-border-primary bg-sidebar-bg flex flex-col relative">
        {/* Sidebar Header */}
        <div className="px-4 pt-5 pb-0 flex flex-col relative">
          {/* Search */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <IconSearch stroke={1.5} className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-search-bar
                className="bg-hover-bg border border-border-secondary rounded-button pl-10 pr-3.5 py-2.5 w-full focus:outline-none focus:border-border-hover transition-colors text-sm text-text-primary placeholder:text-text-muted"
              />
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mb-1 relative">
            <button
              onClick={() => setFilterView('all')}
              className={`flex-1 px-3 py-2 rounded-button text-[13px] transition-all font-normal flex items-center justify-center gap-1.5 border ${
                filterView === 'all'
                  ? 'bg-hover-bg border-border-hover text-text-primary'
                  : 'bg-transparent border-border-secondary text-text-muted hover:border-border-hover'
              }`}
              title="All projects"
            >
              <IconLayoutGrid stroke={1.5} className="w-3.5 h-3.5" />
              <span>All</span>
            </button>
            <button
              onClick={() => setFilterView('favorites')}
              className={`flex-1 px-3 py-2 rounded-button text-[13px] transition-all font-normal flex items-center justify-center gap-1.5 border ${
                filterView === 'favorites'
                  ? 'bg-hover-bg border-border-hover text-text-primary'
                  : 'bg-transparent border-border-secondary text-text-muted hover:border-border-hover'
              }`}
              title="Favorites"
            >
              {filterView === 'favorites' ? <IconStarFilled stroke={1.5} className="w-3.5 h-3.5 text-yellow-400" /> : <IconStar stroke={1.5} className="w-3.5 h-3.5" />}
              <span>Fav</span>
            </button>
            <button
              onClick={() => setFilterView('archive')}
              className={`flex-1 px-3 py-2 rounded-button text-[13px] transition-all font-normal flex items-center justify-center gap-1.5 border ${
                filterView === 'archive'
                  ? 'bg-hover-bg border-border-hover text-text-primary'
                  : 'bg-transparent border-border-secondary text-text-muted hover:border-border-hover'
              }`}
              title="Archive"
            >
              <IconArchive stroke={1.5} className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
            <div className="relative" ref={filterMenuRef}>
              <button
                onClick={() => {
                  setActiveMenu(showFilterMenu ? null : 'filters');
                  setShowFilterMenu(!showFilterMenu);
                }}
                className={`px-3 rounded-button text-[13px] transition-all font-normal flex items-center justify-center gap-1.5 border h-full ${
                  showFilterMenu ? 'bg-hover-bg border-border-hover text-text-primary' : 'bg-transparent border-border-secondary text-text-muted hover:border-border-hover'
                }`}
                title="Sort & Filter"
              >
                <IconFilter stroke={1.5} className="w-3.5 h-3.5" />
              </button>
              {showFilterMenu && (
                <div className="absolute top-full mt-1 right-0 bg-zinc-800/80 backdrop-blur-xl border border-zinc-600/50 rounded-lg shadow-xl p-1 z-50 min-w-[160px] space-y-0.5">
                  <button
                    onClick={() => {
                      setSortBy('createdAt');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs rounded-md transition-colors hover:bg-white/10 flex items-center gap-2 ${
                      sortBy === 'createdAt' ? 'bg-white/10 text-text-primary' : 'text-text-primary'
                    }`}
                  >
                    <IconClockHour3 size={14} />
                    By Creation date
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('deadline');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs rounded-md transition-colors hover:bg-white/10 flex items-center gap-2 ${
                      sortBy === 'deadline' ? 'bg-white/10 text-text-primary' : 'text-text-primary'
                    }`}
                  >
                    <IconCalendarEvent size={14} />
                    By Deadline
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('name');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs rounded-md transition-colors hover:bg-white/10 flex items-center gap-2 ${
                      sortBy === 'name' ? 'bg-white/10 text-text-primary' : 'text-text-primary'
                    }`}
                  >
                    <IconSortAscendingLetters size={14} />
                    By Name
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('cost');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs rounded-md transition-colors hover:bg-white/10 flex items-center gap-2 ${
                      sortBy === 'cost' ? 'bg-white/10 text-text-primary' : 'text-text-primary'
                    }`}
                  >
                    <IconCurrencyDollar size={14} />
                    By Cost
                  </button>
                  <div className="h-px bg-zinc-600/50 my-1" />
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
                    <button className="w-full px-3 py-1.5 text-left text-xs rounded-md transition-colors hover:bg-white/10 text-text-primary flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <IconUser size={14} />
                        By Client
                      </span>
                      <IconChevronRight stroke={1.5} className="w-3 h-3" />
                    </button>
                    {showClientSubmenu && (
                      <div
                        className="absolute left-full top-0 ml-2 bg-zinc-800/80 backdrop-blur-xl border border-zinc-600/50 rounded-lg shadow-xl p-1 min-w-[160px] space-y-0.5"
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
                          className={`w-full px-3 py-1.5 text-left text-xs rounded-md transition-colors hover:bg-white/10 ${
                            selectedClientId === null ? 'bg-white/10 text-text-primary' : 'text-text-primary'
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
                            className={`w-full px-3 py-1.5 text-left text-xs rounded-md transition-colors hover:bg-white/10 flex items-center gap-2 ${
                              selectedClientId === client.id ? 'bg-white/10 text-text-primary' : 'text-text-primary'
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
          {/* Gradient fade at the bottom of filter tabs */}
          <div className="absolute -bottom-8 left-0 right-0 h-8 pointer-events-none z-10 transition-opacity duration-300" style={{
            background: 'linear-gradient(to bottom, #0f0f0f 0%, rgba(15, 15, 15, 0.9) 20%, rgba(15, 15, 15, 0.7) 40%, rgba(15, 15, 15, 0.4) 60%, rgba(15, 15, 15, 0.15) 80%, transparent 100%)',
            opacity: showTopShadow ? 1 : 0
          }}></div>
        </div>

        {/* Project List */}
        <SimpleBar
          className="flex-1 custom-page-scrollbar"
          autoHide={false}
          scrollableNodeProps={{ ref: projectListRef }}
        >
          <div className="px-4 pr-2 pt-4" style={{ paddingBottom: '110px' }}>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-text-muted text-sm">
                <IconFolder stroke={1.5} className="w-8 h-8 mb-2 opacity-50" />
                <p>No projects found</p>
              </div>
            ) : (
              <div className="space-y-3 pr-2">
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
                      onClick={() => handleOpenProject(project)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setActiveMenu('projects');
                        openProjectMenu(e, project.id);
                      }}
                    >
                      {/* Header with title, pin, favorite, status */}
                      <div className="flex items-center gap-2.5 mb-1">
                        <h3 className="font-bold text-card-title text-text-primary truncate flex-1">{project.name}</h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {project.isPinned && (
                            <IconPinFilled stroke={1.5} className="w-3.5 h-3.5 text-text-primary" />
                          )}
                          {project.isFavorite && (
                            <IconStarFilled stroke={1.5} className="w-3.5 h-3.5 text-yellow-400" />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              cycleStatus(project.id, project.status as ProjectStatus);
                            }}
                            className={`w-3 h-3 rounded-full ${STATUS_COLORS[project.status as keyof typeof STATUS_COLORS]} ${
                              activeSessionsByProject.get(project.id) && project.status !== 'archived'
                                ? project.status === 'active'
                                  ? 'status-glow-green brightness-150'
                                  : project.status === 'paused'
                                  ? 'status-glow-yellow brightness-150'
                                  : project.status === 'completed'
                                  ? 'status-glow-blue brightness-150'
                                  : ''
                                : ''
                            } hover:ring-2 hover:ring-white/50 transition-all cursor-pointer`}
                            title={`Status: ${STATUS_LABELS[project.status as keyof typeof STATUS_LABELS]} (click to change)`}
                          />
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-text-secondary truncate mb-3">{project.description}</p>

                      {(() => {
                        const hasClient = project.clientId && clientsById.get(project.clientId);
                        const hasPayment = project.paymentStatus === 'paid' || project.paymentStatus === 'prepaid';
                        const hasDeadline = project.deadline && project.status !== 'completed' && project.status !== 'archived';

                        // Show tags in bottom row when NOT both payment AND deadline exist
                        const showTagsBottom = !(hasPayment && hasDeadline);
                        // Show tags in top row when BOTH payment AND deadline exist
                        const showTagsTop = hasPayment && hasDeadline;

                        return (
                          <>
                            {/* Software Icons + Tags (top) row */}
                            {((project.software && project.software.length > 0) || (showTagsTop && project.tags && project.tags.length > 0)) && (
                              <div className="flex items-center justify-between gap-2 mb-3">
                                {/* Left: Software icons */}
                                <div className="flex gap-2">
                                  {project.software && project.software.slice(0, 6).map((sw: any) => (
                                    <div
                                      key={sw.name}
                                      className="transition-transform hover:scale-110 duration-200"
                                    >
                                      <SoftwareIcon name={sw.name} className="w-7 h-7" />
                                    </div>
                                  ))}
                                </div>

                                {/* Right: Tags (only when both payment AND deadline exist) */}
                                {showTagsTop && project.tags && project.tags.length > 0 && (
                                  <div className="flex gap-1.5 flex-shrink-0">
                                    {project.tags.slice(0, 2).map(tag => (
                                      <span key={tag} className="px-2 py-1 bg-hover-bg rounded-full text-badge text-text-muted">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Bottom section */}
                            <div className="flex items-center justify-between gap-2">
                              {/* Left: Client */}
                              <div className="flex gap-1.5 flex-wrap flex-1 min-w-0">
                                {hasClient && (
                                  <span
                                    className="px-2 py-1 rounded-button text-badge font-medium flex items-center gap-1 flex-shrink-0"
                                    style={{ backgroundColor: darkenColor(hslStringToHex(clientsById.get(project.clientId)!.color || '#808080'), 60), color: '#ffffff' }}
                                  >
                                    {showTagIcons && <IconUser stroke={1.5} className="w-3 h-3 fill-current opacity-40" />}
                                    {clientsById.get(project.clientId)!.name}
                                  </span>
                                )}
                              </div>

                              {/* Right: Tags + Payment + Deadline */}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {/* Tags - show only when NOT both payment AND deadline */}
                                {showTagsBottom && project.tags && project.tags.length > 0 && (
                                  <>
                                    {project.tags.slice(0, 2).map(tag => (
                                      <span key={tag} className="px-2 py-1 bg-hover-bg rounded-full text-badge text-text-muted">
                                        {tag}
                                      </span>
                                    ))}
                                  </>
                                )}
                                {/* Payment Status */}
                                {project.paymentStatus === 'paid' && (
                                  <span className="text-badge px-2 py-1 bg-green-900 text-green-400 rounded-button flex items-center gap-1 font-medium">
                                    {showTagIcons && <IconCurrencyDollar stroke={1.5} className="w-3 h-3" />}
                                    Paid
                                  </span>
                                )}
                                {project.paymentStatus === 'prepaid' && (
                                  <span className="text-badge px-2 py-1 bg-yellow-900 text-yellow-400 rounded-button flex items-center gap-1 font-medium">
                                    {showTagIcons && <IconCurrencyDollar stroke={1.5} className="w-3 h-3" />}
                                    Prepaid
                                  </span>
                                )}
                                {/* Deadline */}
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
                                    <span className={`text-badge px-2 py-1 rounded-button whitespace-nowrap font-medium border ${
                                      daysLeft < 0
                                        ? 'bg-red-900 text-red-400 border-red-900'
                                        : daysLeft === 0
                                        ? 'bg-red-900 text-red-400 border-red-900'
                                        : daysLeft < 5
                                        ? 'bg-red-900 text-red-400 border-red-900'
                                        : daysLeft < 10
                                        ? 'bg-yellow-900 text-yellow-400 border-yellow-900'
                                        : 'bg-hover-bg text-text-muted border-border-secondary'
                                    }`}>
                                      {displayText}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                  </ProjectCard>
                </div>
              ))}
            </div>
            )}
          </div>
        </SimpleBar>

        {/* Bottom gradient shadow */}
        <div
          className="absolute left-0 right-0 pointer-events-none transition-opacity duration-1000"
          style={{
            bottom: '0',
            height: '60px',
            background: 'linear-gradient(to top, rgba(0, 0, 0, 0.5), transparent)',
            zIndex: 40,
            opacity: showBottomShadow ? 1 : 0
          }}
        />

        {/* Sidebar Footer */}
        <div className="absolute bottom-0 left-0 right-0 px-2 pb-2 pointer-events-none z-50">
          <div className="bg-card-bg border border-border-primary rounded-xl p-2 space-y-2 pointer-events-auto">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full border border-accent px-4 py-2 rounded-button flex items-center justify-center gap-2 font-medium text-white animate-button"
              style={{
                background: 'linear-gradient(135deg, var(--accent-color) 0%, var(--accent-color-hover) 100%)',
                backgroundSize: '200% 200%',
                backgroundPosition: '0% 50%',
                transition: 'background-position 0.5s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundPosition = '100% 50%';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundPosition = '0% 50%';
              }}
            >
              <IconPlus stroke={1.5} className="w-5 h-5" />
              New Project
            </button>

            {/* Mode Switcher */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-app-bg bg-opacity-50 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('projects')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                    viewMode === 'projects'
                      ? 'bg-hover-bg text-white'
                      : 'bg-transparent text-zinc-500 hover:text-zinc-400'
                  }`}
                  title="Projects"
                >
                  <IconFolder stroke={1.5} className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Projects</span>
                </button>
                <button
                  onClick={handleToggleFinanceMode}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                    viewMode === 'finance'
                      ? 'bg-hover-bg text-white'
                      : 'bg-transparent text-zinc-500 hover:text-zinc-400'
                  }`}
                  title="Statistics"
                >
                  <IconChartBar stroke={1.5} className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Statistics</span>
                </button>
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="px-3 hover:bg-hover-bg rounded-lg transition-colors flex-shrink-0 flex items-center justify-center py-1.5"
                title="Settings"
              >
                <IconSettings stroke={1.5} className="w-4 h-4 text-text-muted animate-settings-icon" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-t border-border-primary">
        {/* Lazy load FinancePage - only mount after first use, then keep mounted but hidden */}
        {financePageMounted && (
          <div style={{ display: viewMode === 'finance' ? 'flex' : 'none', height: '100%' }} className="flex flex-col">
            <FinancePage projects={projects} selectedProjectId={selectedProjectId} onClose={handleCloseFinance} />
          </div>
        )}

        {/* Projects view */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ display: viewMode !== 'finance' ? 'flex' : 'none' }}>
        {viewMode !== 'finance' && (
          selectedProject ? (
            <ProjectDetails
              project={selectedProject}
              launchingStatus={launchingStatus}
              onClose={() => setSelectedProjectId(null)}
              onOpenFolder={() => {
               console.log('Opening folder:', selectedProject.path);
               openInExplorer(selectedProject.path);
               }}
              showNotification={addGeneralNotification}
              onLaunchSoftwareWithoutProject={launchSoftwareWithoutProject}
              onLaunchSoftware={(sw: any) => {
                // Get special context if exists
                let specialContext = null;
                if (selectedProject.currentSpecialContextId) {
                  specialContext = selectedProject.specialContexts?.find(
                    (c: any) => c.id === selectedProject.currentSpecialContextId
                  );
                }

                const currentScene = selectedProject.hasScenes && selectedProject.currentSceneId
                  ? selectedProject.scenes?.find((s: any) => s.id === selectedProject.currentSceneId)
                  : null;

                const currentShot = selectedProject.hasShots && selectedProject.currentShotId
                  ? selectedProject.shots?.find((s: any) => s.id === selectedProject.currentShotId)
                  : null;

                // Convert display name to SoftwareName key
                const nameToKey: Record<string, string> = {
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
                  'Photoshop': 'photoshop'
                };
                const softwareKey = nameToKey[sw.name] || sw.name.toLowerCase().replace(/\s+/g, '-');

                // If in asset context - show dialog to enter asset name
                if (specialContext?.type === 'asset') {
                  setAssetNameDialog({
                    software: sw,
                    projectName: selectedProject.name,
                    projectPath: selectedProject.path,
                    softwareKey: softwareKey
                  });
                  return;
                }

                launchSoftware({
                  projectPath: selectedProject.path,
                  executablePath: sw.executablePath,
                  software: softwareKey,
                  projectName: selectedProject.name,
                  sceneName: currentScene?.name,
                  sceneNumber: currentScene?.number,
                  shotNumber: currentShot?.number,
                  specialContext: specialContext ? 'COMP' : undefined
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
          )
        )}
        </div>
      </div>

      {/* ShotsBrowser - between ProjectDetails and TreeView (only when not docked) */}
      {selectedProject && viewMode !== 'finance' && (selectedProject.hasShots || selectedProject.hasScenes) && !shotsBrowserDocked && (
        <ShotsBrowser
          projectId={selectedProject.id}
          className="w-80 flex-shrink-0"
          onToggleDock={() => {
            setShotsBrowserDocked(true);
            localStorage.setItem('shotsBrowserDocked', 'true');
          }}
        />
      )}

      {/* Right Sidebar */}
      {selectedProject && viewMode !== 'finance' && (
        <RightSidebar
          project={selectedProject}
          shotsBrowserDocked={shotsBrowserDocked && (selectedProject.hasShots || selectedProject.hasScenes)}
          onToggleDock={() => {
            setShotsBrowserDocked(false);
            localStorage.setItem('shotsBrowserDocked', 'false');
          }}
        />
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createProject}
          onProjectCreated={(projectId) => setSelectedProjectId(projectId)}
        />
      )}

      {/* Asset Name Modal */}
      {assetNameDialog && (
        <AssetNameModal
          isOpen={true}
          onClose={() => setAssetNameDialog(null)}
          onConfirm={(assetName) => {
            launchSoftware({
              projectPath: assetNameDialog.projectPath,
              executablePath: assetNameDialog.software.executablePath,
              software: assetNameDialog.softwareKey,
              projectName: assetNameDialog.projectName,
              specialContext: 'ASSET',
              assetName: assetName
            });
            setAssetNameDialog(null);
          }}
          softwareName={assetNameDialog.software.name}
          projectName={assetNameDialog.projectName}
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

      {/* About Panel */}
      {showAbout && (
        <AboutPanel
          onClose={() => setShowAbout(false)}
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
            className="bg-zinc-900 border border-red-700 rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Confirm Delete</h3>
            <p className="text-zinc-400 mb-6">
              {deleteConfirm.type === 'category' && deleteConfirm.projectCount
                ? `Are you sure you want to delete category "${deleteConfirm.name}" and move its ${deleteConfirm.projectCount} project(s) to "Personal"? This action cannot be undone.`
                : deleteConfirm.type === 'category'
                ? `Are you sure you want to delete the "${deleteConfirm.name}" category?`
                : `Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`
              }
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors animate-button"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (deleteConfirm.type === 'project' && deleteConfirm.path) {
                    await deleteProject(deleteConfirm.path);
                  } else if (deleteConfirm.type === 'client') {
                    deleteClient(deleteConfirm.id);
                  } else if (deleteConfirm.type === 'category') {
                    const { removeCategory } = useProjectStore.getState();
                    await removeCategory(deleteConfirm.id);
                  }
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium animate-button"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      <ContextMenu
        ref={contextMenuRef}
        isOpen={isProjectMenuOpen}
        position={projectMenuPosition}
        onClose={closeContextMenu}
        menuId="projects"
      >
        <div>
          <ContextMenuItem
            icon={<IconPin stroke={1.5} className="w-4 h-4" />}
            onClick={() => {
              if (projectMenuData) {
                togglePin(projectMenuData);
                closeContextMenu();
              }
            }}
          >
            {projects.find(p => p.id === projectMenuData)?.isPinned ? 'Unpin' : 'Pin to top'}
          </ContextMenuItem>
          <ContextMenuItem
            icon={<IconStar stroke={1.5} className="w-4 h-4" />}
            onClick={() => {
              if (projectMenuData) {
                toggleFavorite(projectMenuData);
                closeContextMenu();
              }
            }}
          >
            {projects.find(p => p.id === projectMenuData)?.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          </ContextMenuItem>
          <ContextMenuItem
            icon={<IconPhoto stroke={1.5} className="w-4 h-4" />}
            onClick={async () => {
              const project = projects.find(p => p.id === projectMenuData);
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
              closeContextMenu();
            }}
          >
            Paste Thumbnail
          </ContextMenuItem>
          <ContextMenuItem
            icon={<IconX stroke={1.5} className="w-4 h-4" />}
            onClick={() => {
              const project = projects.find(p => p.id === projectMenuData);
              if (project) {
                updateProject({ ...project, thumbnail: undefined });
              }
              closeContextMenu();
            }}
          >
            Remove Thumbnail
          </ContextMenuItem>
          <ContextMenuDivider />

          {/* Status submenu */}
          <div className="px-3 py-1 text-[11px] text-text-muted opacity-70 font-medium">Status</div>
          <ContextMenuItem
            icon={<IconCircleFilled stroke={1.5} className="w-4 h-4 fill-green-500 text-green-500" />}
            onClick={() => {
              if (projectMenuData) {
                updateStatus(projectMenuData, 'active');
                closeContextMenu();
              }
            }}
          >
            Active
          </ContextMenuItem>
          <ContextMenuItem
            icon={<IconCircleFilled stroke={1.5} className="w-4 h-4 fill-yellow-500 text-yellow-500" />}
            onClick={() => {
              if (projectMenuData) {
                updateStatus(projectMenuData, 'paused');
                closeContextMenu();
              }
            }}
          >
            Paused
          </ContextMenuItem>
          <ContextMenuItem
            icon={<IconCircleFilled stroke={1.5} className="w-4 h-4 fill-blue-500 text-blue-500" />}
            onClick={() => {
              if (projectMenuData) {
                updateStatus(projectMenuData, 'completed');
                closeContextMenu();
              }
            }}
          >
            Completed
          </ContextMenuItem>
          <ContextMenuItem
            icon={<IconArchive stroke={1.5} className="w-4 h-4" />}
            onClick={() => {
              if (projectMenuData) {
                updateStatus(projectMenuData, 'archived');
                closeContextMenu();
              }
            }}
          >
            Archived
          </ContextMenuItem>

          <ContextMenuDivider />

          {/* Payment Status submenu */}
          <div className="px-3 py-1 text-[11px] text-text-muted opacity-70 font-medium">Payment Status</div>
          <ContextMenuItem
            icon={<IconCurrencyDollar stroke={1.5} className="w-4 h-4 text-zinc-500" />}
            onClick={() => {
              const project = projects.find(p => p.id === projectMenuData);
              if (project) {
                // Clear completedAt when changing to unpaid
                updateProject({ ...project, paymentStatus: 'unpaid', completedAt: undefined });
              }
              closeContextMenu();
            }}
          >
            Unpaid
          </ContextMenuItem>
          <ContextMenuItem
            icon={<IconCurrencyDollar stroke={1.5} className="w-4 h-4 text-yellow-500" />}
            onClick={() => {
              const project = projects.find(p => p.id === projectMenuData);
              if (project) {
                // Set completedAt only if changing TO "prepaid" and it's not already set
                const completedAt = project.paymentStatus === 'prepaid'
                  ? project.completedAt
                  : (project.completedAt || new Date().toISOString());
                updateProject({ ...project, paymentStatus: 'prepaid', completedAt });
              }
              closeContextMenu();
            }}
          >
            Prepaid
          </ContextMenuItem>
          <ContextMenuItem
            icon={<IconCurrencyDollar stroke={1.5} className="w-4 h-4 text-green-500" />}
            onClick={() => {
              const project = projects.find(p => p.id === projectMenuData);
              if (project) {
                // Set completedAt only if changing TO "paid" and it's not already set
                const completedAt = project.paymentStatus === 'paid'
                  ? project.completedAt
                  : (project.completedAt || new Date().toISOString());
                updateProject({ ...project, paymentStatus: 'paid', completedAt });
              }
              closeContextMenu();
            }}
          >
            Paid
          </ContextMenuItem>

          <ContextMenuDivider />

          {/* Move to Category submenu */}
          <div
            className="relative"
            onMouseEnter={() => {
              if (categorySubmenuTimeoutRef.current) {
                clearTimeout(categorySubmenuTimeoutRef.current);
              }
              setShowCategorySubmenu(true);
            }}
            onMouseLeave={() => {
              categorySubmenuTimeoutRef.current = window.setTimeout(() => {
                setShowCategorySubmenu(false);
              }, 100);
            }}
          >
            <button
              ref={categoryButtonRef}
              className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-white/10 rounded-md flex items-center justify-between gap-2 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 flex items-center justify-center opacity-80">
                  <IconFolder stroke={1.5} className="w-4 h-4" />
                </span>
                Move to...
              </div>
              <IconChevronRight stroke={1.5} className="w-4 h-4 opacity-50" />
            </button>

            {/* Category submenu */}
            {showCategorySubmenu && (
              <div
                ref={categorySubmenuRef}
                className="absolute left-full bottom-0 ml-2.5 bg-zinc-800/95 border border-zinc-600/50 rounded-xl shadow-2xl p-1.5 z-[101] w-auto animate-context-menu"
                onMouseEnter={() => {
                  if (categorySubmenuTimeoutRef.current) {
                    clearTimeout(categorySubmenuTimeoutRef.current);
                  }
                }}
                onMouseLeave={() => {
                  categorySubmenuTimeoutRef.current = window.setTimeout(() => {
                    setShowCategorySubmenu(false);
                  }, 100);
                }}
              >
                {categories.map((category) => {
                  const project = projects.find(p => p.id === projectMenuData);
                  const isCurrentCategory = project?.category === category;

                  return (
                    <button
                      key={category}
                      onClick={() => {
                        if (project && !isCurrentCategory) {
                          updateProject({ ...project, category });
                        }
                        closeContextMenu();
                        setShowCategorySubmenu(false);
                      }}
                      className={`block w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-white/10 rounded-md whitespace-nowrap transition-colors ${
                        isCurrentCategory ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      disabled={isCurrentCategory}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <ContextMenuDivider />
          <ContextMenuItem
            icon={<IconTrash stroke={1.5} className="w-4 h-4" />}
            danger
            onClick={() => {
              const projectId = projectMenuData;
              const project = projects.find(p => p.id === projectId);

              if (!project) {
                closeContextMenu();
                return;
              }

              // Close menu and show custom confirm dialog
              closeContextMenu();
              setDeleteConfirm({
                type: 'project',
                name: project.name,
                id: project.id,
                path: project.path
              });
            }}
          >
            Delete project
          </ContextMenuItem>
        </div>
      </ContextMenu>

      {/* Break Reminders */}
      <BreakReminderContainer
        reminders={breakReminders}
        onDismiss={(id) => setBreakReminders(prev => prev.filter(r => r.id !== id))}
      />
      </div>
      {/* Global Text Context Menu for all inputs/textareas */}
      <GlobalTextContextMenu />
    </div>
  );
}

// ✅ EmptyState now imported from './components/shared'

// ✅ generateBrightColor now imported from './utils'

export default App;