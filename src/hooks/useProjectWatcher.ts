import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

/**
 * Runs the project file watcher (version-changed / output-changed events) while `projectPath` is set.
 * Pass null to keep it off. Only one owner should be active at a time — the backend watcher is global.
 */
export function useProjectWatcher(projectPath: string | null) {
  useEffect(() => {
    if (!projectPath) return;

    // Debounce watcher start: intermediate projects during rapid switching don't need a watcher
    const watcherTimer = setTimeout(() => {
      const autoDeleteWatcher = localStorage.getItem('autoDeleteBlend1Backups') === 'true';
      invoke('start_watching_project', {
        projectPath,
        autoDeleteBackups: autoDeleteWatcher
      }).catch((err) => {
        console.error('Failed to start watching project:', err);
      });
    }, 150);

    return () => {
      clearTimeout(watcherTimer);
      invoke('stop_watching_project').catch((err) => {
        console.error('Failed to stop watching project:', err);
      });
    };
  }, [projectPath]);
}
