import { appWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

interface WindowSettings {
  autoMaximizeOnLaunch: boolean;
  preferredMonitor: number;
  preferredMonitorName: string;
}

const STORAGE_KEY = 'windowState';
const SETTINGS_KEY = 'windowSettings';
const MIN_WIDTH = 1520;
const MIN_HEIGHT = 700;

export const useWindowState = () => {
  // Get saved window state
  const getSavedState = (): WindowState | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  };

  // Get window settings
  const getSettings = (): WindowSettings => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Fall through to defaults
    }

    return {
      autoMaximizeOnLaunch: false,
      preferredMonitor: 0,
      preferredMonitorName: '',
    };
  };

  // Sync window settings and state to JSON file for Rust startup
  const syncToFile = async () => {
    try {
      const settings = getSettings();
      const state = getSavedState();

      await invoke('save_window_config', {
        config: {
          autoMaximizeOnLaunch: settings.autoMaximizeOnLaunch,
          preferredMonitor: settings.preferredMonitor,
          x: state?.x ?? null,
          y: state?.y ?? null,
          width: state?.width ?? null,
          height: state?.height ?? null,
          isMaximized: state?.isMaximized ?? null,
        }
      });
    } catch (error) {
      console.error('[WindowState] Failed to sync to file:', error);
    }
  };

  // Save current window state to localStorage
  const saveWindowState = async () => {
    try {
      const isMaximized = await appWindow.isMaximized();
      const isFullscreen = await appWindow.isFullscreen();

      // Only save position when window is in normal state
      if (!isMaximized && !isFullscreen) {
        const position = await appWindow.outerPosition();
        const size = await appWindow.outerSize();

        const state: WindowState = {
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
          isMaximized: false,
        };

        console.log('[WindowState] Saving normal state:', state);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        // Sync to file for Rust to read on next startup
        syncToFile();
      } else if (isMaximized) {
        // Save maximized state but keep previous position
        const saved = getSavedState();
        if (saved) {
          saved.isMaximized = true;
          console.log('[WindowState] Saving maximized state');
          localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
          // Sync to file for Rust to read on next startup
          syncToFile();
        }
      }
    } catch (error) {
      console.error('[WindowState] Failed to save window state:', error);
    }
  };

  // Load and restore window state from localStorage
  const loadWindowState = async () => {
    try {
      const saved = getSavedState();

      if (!saved) {
        console.log('[WindowState] No saved state found');
        // Auto-save after 5 seconds if no saved state
        setTimeout(() => saveWindowState(), 5000);
        return;
      }

      // Validate position is still valid (monitor might be disconnected)
      const isValid = await invoke<boolean>('is_position_valid', {
        x: saved.x,
        y: saved.y,
      });

      if (!isValid) {
        console.warn('[WindowState] Saved position is invalid, restoring to center');
        await invoke('reset_window_position');
        return;
      }

      // Ensure size meets minimum requirements
      const width = Math.max(saved.width, MIN_WIDTH);
      const height = Math.max(saved.height, MIN_HEIGHT);

      // Restore position and size
      console.log('[WindowState] Restoring position:', { x: saved.x, y: saved.y, width, height, isMaximized: saved.isMaximized });
      await appWindow.setPosition({ type: 'Physical', x: saved.x, y: saved.y });
      await appWindow.setSize({ type: 'Physical', width, height });

      // Restore maximized state if needed
      if (saved.isMaximized) {
        await new Promise(resolve => setTimeout(resolve, 100));
        await appWindow.maximize();
      }

      console.log('[WindowState] Window state restored successfully');
    } catch (error) {
      console.error('[WindowState] Failed to load window state:', error);
    }
  };

  // Auto-maximize on preferred monitor
  const autoMaximizeOnMonitor = async () => {
    try {
      const settings = getSettings();
      if (!settings.autoMaximizeOnLaunch) {
        return false;
      }

      console.log(`[WindowState] Auto-maximizing on monitor ${settings.preferredMonitor}`);

      // Check if already maximized to avoid flicker
      const isAlreadyMaximized = await appWindow.isMaximized();
      if (isAlreadyMaximized) {
        console.log('[WindowState] Already maximized, skipping');
        return true;
      }

      // Move to preferred monitor
      await invoke('set_window_to_monitor', {
        monitorIndex: settings.preferredMonitor,
      });

      // Wait longer for position update to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      // Maximize window
      await appWindow.maximize();

      console.log('[WindowState] Auto-maximize complete');
      return true;
    } catch (error) {
      console.error('[WindowState] Failed to auto-maximize:', error);
      return false;
    }
  };

  // Reset window to default position and size
  const resetWindowPosition = async () => {
    try {
      await invoke('reset_window_position');

      // Clear saved state
      localStorage.removeItem(STORAGE_KEY);

      console.log('[WindowState] Window position reset');
    } catch (error) {
      console.error('[WindowState] Failed to reset window position:', error);
    }
  };

  // Update window settings
  const updateSettings = (settings: Partial<WindowSettings>) => {
    const current = getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    // Sync to file for Rust to read on next startup
    syncToFile();
  };

  return {
    saveWindowState,
    loadWindowState,
    autoMaximizeOnMonitor,
    resetWindowPosition,
    getSavedState,
    getSettings,
    updateSettings,
  };
};
