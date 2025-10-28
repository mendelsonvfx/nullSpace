import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, Folder, Search, X, Settings, Star, Archive, Grid3x3, ChevronRight, Pin, Trash2, Circle, DollarSign, User, Filter, Minus, Square, MessageSquare, Image } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { useProjectStore } from './store/projectStore';
import { useContextMenuStore } from './store/contextMenuStore';
import { SettingsPanel } from './components/SettingsPanel';
import { FeedbackPanel } from './components/FeedbackPanel';
import { AboutPanel } from './components/AboutPanel';
// MDXEditor imports moved to NotesSection component
import { SoftwareIcon } from './components/SoftwareIcon';
import { ProjectCard } from './components/ProjectCard';
import { appWindow } from '@tauri-apps/api/window';
import { DeadlineNotification } from './components/DeadlineNotification';
// useThumbnail moved to child components
import { CategoryTabs } from './components/CategoryTabs';
import { WelcomeSetup } from './components/WelcomeSetup';
import { BreakReminderContainer } from './components/time';
import type { BreakReminder } from './components/time';
import { useTimeTrackingStore, TimerService } from './features/time-tracking';

// Import refactored components
import { EmptyState } from './components/shared';
import { FinancePage } from './components/finance';
import { ProjectDetails, RightSidebar } from './components/project';
import { CreateProjectModal } from './components/modals';
import { darkenColor, STATUS_COLORS, STATUS_LABELS } from './utils';

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
    addCategory,
    launchingStatus
  } = useProjectStore();

  const { activeMenu, setActiveMenu } = useContextMenuStore();

  //const [view, setView] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
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
  const [financePageMounted, setFinancePageMounted] = useState(false);
  const [showTagIcons, setShowTagIcons] = useState(() => {
    const saved = localStorage.getItem('showTagIcons');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'project' | 'client' | 'category'; name: string; id: string; path?: string } | null>(null);
  const [previousProjectId, setPreviousProjectId] = useState<string | null>(null);
  const [deadlineNotifications, setDeadlineNotifications] = useState<Array<{ id: string; projectName: string; daysRemaining: number }>>([]);
  const [notificationsShown, setNotificationsShown] = useState(false); // Track if notifications were shown this session
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [showCategoryBar, setShowCategoryBar] = useState(() => {
    const saved = localStorage.getItem('showCategoryBar');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showWelcomeSetup, setShowWelcomeSetup] = useState(false);
  const [, setIsWindowVisible] = useState(true); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [, setForceRenderKey] = useState(0); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [breakReminders, setBreakReminders] = useState<BreakReminder[]>([]);
  const [shownReminders, setShownReminders] = useState<Set<string>>(new Set());

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
    };

    updateFullscreenClass();

    const unlisten = appWindow.onResized(() => {
      updateFullscreenClass();
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

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
        await appWindow.setFullscreen(!isFullscreen);

        // Update class after state change
        setTimeout(async () => {
          const newFullscreenState = await appWindow.isFullscreen();
          if (newFullscreenState) {
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
        if (selectedProjectId) {
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
              removeCategory(deleteConfirm.id);
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
  }, [viewMode, selectedProjectId, previousProjectId, showCreateModal, showSettings, showFeedback, showAbout, showWelcomeSetup, deleteConfirm]);

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
    if (animationsEnabled !== null && !JSON.parse(animationsEnabled)) {
      document.body.classList.add('animations-disabled');
    }

    // Disable default Windows context menu globally
    const disableContextMenu = (e: MouseEvent) => {
      // Allow context menu only on project cards (for custom menu)
      const target = e.target as HTMLElement;
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

  // Close context menu when another menu opens
  useEffect(() => {
    if (activeMenu !== 'projects' && contextMenu) {
      setContextMenu(null);
    }
  }, [activeMenu]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking on delete button
      if (target.closest('[data-delete-button]')) return;
      setContextMenu(null);
      setActiveMenu(null);
    };
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

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

    // Trigger version list update when project is opened
    // This ensures versions are refreshed even if files were deleted outside the app
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('version-created', {
        detail: { projectPath: project.path }
      }));
    }, 100);
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

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
            <Minus className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          <button
            onClick={() => {
              console.log('Maximize clicked');
              appWindow.toggleMaximize();
            }}
            className="w-8 h-6 hover:bg-zinc-800 flex items-center justify-center transition-colors rounded"
            title="Maximize"
          >
            <Square className="w-3 h-3 text-zinc-400" />
          </button>
          <button
            onClick={() => {
              console.log('Close clicked');
              appWindow.close();
            }}
            className="w-8 h-6 hover:bg-red-600 flex items-center justify-center transition-colors rounded"
            title="Close"
          >
            <X className="w-3.5 h-3.5 text-zinc-400" />
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
          onDeleteCategory={(categoryName) => {
            setDeleteConfirm({
              type: 'category',
              name: categoryName,
              id: categoryName
            });
          }}
          onRenameCategory={(oldName, newName) => {
            const { renameCategory } = useProjectStore.getState();
            renameCategory(oldName, newName);
          }}
          accentColor="#a855f7"
        />
      )}
      {/* Sidebar - Project List */}
      <div className="w-80 border-r border-t border-zinc-800 flex flex-col">
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
                  onClick={handleToggleFinanceMode}
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
              title="All projects"
            >
              <Grid3x3 className="w-3.5 h-3.5" />
              <span className="text-xs">All</span>
            </button>
            <button
              onClick={() => setFilterView('favorites')}
              className={`flex-1 px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                filterView === 'favorites' ? 'bg-accent' : 'bg-zinc-800 hover:bg-zinc-700'
              }`}
              title="Favorites"
            >
              <Star className={`w-3.5 h-3.5 ${filterView === 'favorites' ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              <span className="text-xs">Fav</span>
            </button>
            <button
              onClick={() => setFilterView('archive')}
              className={`flex-1 px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                filterView === 'archive' ? 'bg-accent' : 'bg-zinc-800 hover:bg-zinc-700'
              }`}
              title="Archive"
            >
              <Archive className="w-3.5 h-3.5" />
              <span className="text-xs">Archive</span>
            </button>
            <div className="relative" ref={filterMenuRef}>
              <button
                onClick={() => {
                  setActiveMenu(showFilterMenu ? null : 'filters');
                  setShowFilterMenu(!showFilterMenu);
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  showFilterMenu ? 'bg-accent' : 'bg-zinc-800 hover:bg-zinc-700'
                }`}
                title="Sort & Filter"
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
                      setActiveMenu('projects');
                      setContextMenu({ x: e.clientX, y: e.clientY, projectId: project.id });
                    }}
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-t border-zinc-800">
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
              onLaunchSoftware={(sw: any) => {
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

                launchSoftware({
                  projectPath: selectedProject.path,
                  executablePath: sw.executablePath,
                  software: softwareKey,
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
          )
        )}
        </div>
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
          onDeleteCategory={(categoryName) => {
            setDeleteConfirm({
              type: 'category',
              name: categoryName,
              id: categoryName
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
            className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Confirm Delete</h3>
            <p className="text-zinc-400 mb-6">
              {deleteConfirm.type === 'category'
                ? `Are you sure you want to delete the "${deleteConfirm.name}" category? Projects in this category will be moved to "Personal".`
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
                    removeCategory(deleteConfirm.id);
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
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 z-50 min-w-[180px] animate-context-menu"
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
                // Set completedAt only if changing TO "paid" and it's not already set
                const completedAt = project.paymentStatus === 'paid'
                  ? project.completedAt
                  : (project.completedAt || new Date().toISOString());
                updateProject({ ...project, paymentStatus: 'paid', completedAt });
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

      {/* Break Reminders */}
      <BreakReminderContainer
        reminders={breakReminders}
        onDismiss={(id) => setBreakReminders(prev => prev.filter(r => r.id !== id))}
      />
      </div>
    </div>
  );
}

// ✅ EmptyState now imported from './components/shared'

// ✅ generateBrightColor now imported from './utils'

export default App;