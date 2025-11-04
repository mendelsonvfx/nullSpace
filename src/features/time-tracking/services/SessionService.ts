// src/features/time-tracking/services/SessionService.ts
import { invoke } from '@tauri-apps/api/tauri';
import type { ActiveSession, StartSessionParams } from '../types/session';

/**
 * Service for managing time tracking sessions (backend communication)
 * Provides abstraction layer over Tauri commands
 */
export class SessionService {
  /**
   * Start tracking session in backend
   */
  static async start(params: StartSessionParams): Promise<void> {
    await invoke('start_time_tracking', {
      entryId: params.entryId,
      projectId: params.projectId,
      projectPath: params.projectPath,
      shotId: params.shotId || null,
      software: params.software,
      pid: params.pid
    });
  }

  /**
   * Stop tracking session
   * @returns Final duration in minutes
   */
  static async stop(entryId: string): Promise<number> {
    const finalMinutes = await invoke<number>('stop_time_tracking', { entryId });
    return finalMinutes;
  }

  /**
   * Get all active sessions from backend
   */
  static async getActiveSessions(): Promise<ActiveSession[]> {
    const sessions = await invoke<ActiveSession[]>('get_active_sessions');
    return sessions;
  }

  /**
   * Check if session window is focused
   * Returns false if session not found or any error occurs
   */
  static async isSessionFocused(entryId: string): Promise<boolean> {
    try {
      const isFocused = await invoke<boolean>('is_session_focused', { entryId });
      return isFocused;
    } catch (error) {
      return false;
    }
  }

  /**
   * Increment software statistics (focused time)
   * Should only be called when session is focused
   */
  static async incrementSoftwareStats(entryId: string): Promise<void> {
    try {
      await invoke('increment_software_stats', { entryId });
    } catch (error) {
      console.error('[SessionService] ❌ Failed to increment software stats:', error);
      throw error;
    }
  }

  /**
   * Verify session exists and is alive in backend
   * Returns true if session found and process is alive
   */
  static async verifySession(entryId: string): Promise<boolean> {
    try {
      const sessions = await this.getActiveSessions();
      const session = sessions.find(s => s.entry_id === entryId);
      return session ? session.process_alive : false;
    } catch (error) {
      console.error('[SessionService] Failed to verify session:', error);
      return false;
    }
  }

  /**
   * Get focus summary for a session (how many seconds focused in last 60 seconds)
   */
  static async getFocusSummary(entryId: string): Promise<{ focused_seconds: number; total_checks: number }> {
    try {
      const summary = await invoke<{ focused_seconds: number; total_checks: number }>('get_focus_summary', { entryId });
      return summary;
    } catch (error) {
      console.error('[SessionService] ❌ Failed to get focus summary:', error);
      return { focused_seconds: 0, total_checks: 0 };
    }
  }

  /**
   * Check if a process with given PID is alive
   * Returns true if process exists
   */
  static async checkProcessAlive(pid: number): Promise<boolean> {
    try {
      const isAlive = await invoke<boolean>('check_process_alive', { pid });
      console.log(`[SessionService] Process ${pid} check result: ${isAlive ? '✅ ALIVE' : '❌ DEAD'}`);
      return isAlive;
    } catch (error) {
      console.error('[SessionService] ❌ Failed to check process:', error);
      return false;
    }
  }

  /**
   * Attempt to migrate to a child process when parent process dies
   * This handles launcher-based applications (Blender, Adobe apps, etc.)
   * @param oldPid - The dead parent process PID
   * @param softwareName - Name of the software to find (e.g., "Blender")
   * @returns New child process PID if found, null otherwise
   */
  static async migrateToChildProcess(oldPid: number, softwareName: string): Promise<number | null> {
    try {
      console.log(`[SessionService] 🔄 Attempting to migrate PID ${oldPid} for ${softwareName}`);
      const newPid = await invoke<number | null>('migrate_to_child_process', {
        oldPid,
        softwareName,
      });

      if (newPid) {
        console.log(`[SessionService] ✅ Migrated to child process PID: ${newPid}`);
      } else {
        console.log(`[SessionService] ❌ No child process found for migration`);
      }

      return newPid;
    } catch (error) {
      console.error('[SessionService] ❌ Failed to migrate to child process:', error);
      return null;
    }
  }

  /**
   * Get full session status from backend (includes window detection, grace period, etc.)
   * This is the source of truth for whether a session should be tracking
   * @param entryId - The session entry ID
   * @returns Session status or null if not found
   */
  static async getSessionStatus(entryId: string): Promise<ActiveSession | null> {
    try {
      const session = await invoke<ActiveSession>('get_session_status', { entryId });
      return session;
    } catch (error) {
      console.error(`[SessionService] Failed to get session status for ${entryId}:`, error);
      return null;
    }
  }

  /**
   * Update session PID after migration
   * This syncs the backend session PID with the new child process PID
   * @param entryId - The session entry ID
   * @param newPid - The new process ID to track
   */
  static async updateSessionPid(entryId: string, newPid: number): Promise<void> {
    try {
      await invoke('update_session_pid', { entryId, newPid });
      console.log(`[SessionService] ✅ Updated backend session ${entryId} PID to ${newPid}`);
    } catch (error) {
      console.error(`[SessionService] ❌ Failed to update session PID:`, error);
      throw error;
    }
  }
}
