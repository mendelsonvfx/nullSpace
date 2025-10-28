// src/features/time-tracking/hooks/useTimeTracking.ts
import { useTimeTrackingStore } from '../stores/timeTrackingStore';
import type { SoftwareName } from '../../../types/project';

/**
 * Hook for managing time tracking for a specific project
 * Provides convenient interface to start/stop sessions
 */
export function useTimeTracking(projectId: string, projectPath: string) {
  const {
    startSession,
    stopSession,
    getActiveSessionsForProject
  } = useTimeTrackingStore();

  // Get active session for this project (if any)
  const activeSessions = getActiveSessionsForProject(projectId);
  const activeSession = activeSessions.length > 0 ? activeSessions[0] : null;

  /**
   * Start tracking session for this project
   */
  const start = async (
    software: SoftwareName,
    pid: number,
    shotId?: string
  ): Promise<string> => {
    return await startSession({
      projectId,
      projectPath,
      software,
      pid,
      shotId
    });
  };

  /**
   * Stop active session for this project
   */
  const stop = async (): Promise<number | null> => {
    if (!activeSession) {
      console.warn('[useTimeTracking] No active session to stop');
      return null;
    }
    return await stopSession(activeSession.id);
  };

  /**
   * Stop specific session by ID
   */
  const stopById = async (entryId: string): Promise<number> => {
    return await stopSession(entryId);
  };

  return {
    activeSession,
    start,
    stop,
    stopById,
    isTracking: activeSession !== null
  };
}
