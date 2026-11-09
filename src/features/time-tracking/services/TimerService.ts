// src/features/time-tracking/services/TimerService.ts

import type { WorkSession } from '../types/workSession';
import type { TimeEntry } from '../types/timeEntry';

type NodeJSTimeout = ReturnType<typeof setTimeout>;

/**
 * Callback function that runs every minute
 * @param entryId - The time entry ID
 */
type TimerCallback = (entryId: string) => Promise<void> | void;

/**
 * Callback to check if process is still alive
 * Should return true if alive, false if dead (will auto-stop timer)
 */
type ProcessCheckCallback = (entryId: string) => Promise<boolean>;

interface TimerData {
  startTime: number; // timestamp when timer started
  lastMinuteEmitted: number; // which minute was last emitted (0, 1, 2, ...)
  lastProcessCheck: number; // timestamp of last process check
}

/**
 * Service for managing interval timers
 * Uses startTime-based calculation to avoid desync
 * Emits signals only on actual minute boundaries
 */
export class TimerService {
  private static timers = new Map<string, NodeJSTimeout>();
  private static timerData = new Map<string, TimerData>();
  private static callbacks = new Map<string, TimerCallback>();
  private static processCheckCallbacks = new Map<string, ProcessCheckCallback>();
  private static readonly PROCESS_CHECK_INTERVAL = 5000; // Check process every 5 seconds

  // WorkSession timers - keyed by projectId (stable, never changes)
  private static projectTimers = new Map<string, NodeJSTimeout>();

  // Metadata for backwards compatibility (projectId → sessionId for logging)
  private static projectTimerMeta = new Map<string, { sessionId: string }>();

  // New: Widget timers (tick every second)
  private static widgetTimers = new Map<string, NodeJSTimeout>();

  /**
   * Start a timer for entry with callback on minute mark
   * @param entryId - Unique timer ID (usually time entry ID)
   * @param software - Software name (for logging)
   * @param onMinuteTick - Callback called every time a new minute is reached
   * @param existingStartTime - ISO string of when session originally started (for resuming)
   * @param existingMinutes - Already accumulated minutes (for resuming)
   */
  static start(
    entryId: string,
    software: string,
    onMinuteTick: TimerCallback,
    existingStartTime?: string,
    existingMinutes?: number
  ): void {
    if (this.timers.has(entryId)) {
      console.warn(`[TimerService] ⚠️  Timer already running for ${software} (${entryId})`);
      return;
    }

    // Use existing start time if provided, otherwise use current time
    const startTime = existingStartTime ? new Date(existingStartTime).getTime() : Date.now();
    const lastMinuteEmitted = existingMinutes || 0;

    this.timerData.set(entryId, {
      startTime,
      lastMinuteEmitted,
      lastProcessCheck: Date.now()
    });
    this.callbacks.set(entryId, onMinuteTick);

    // Tick every second
    const timer = setInterval(async () => {
      const data = this.timerData.get(entryId);
      if (!data) return;

      const now = Date.now();
      const elapsed = now - data.startTime;
      const elapsedSeconds = Math.floor(elapsed / 1000);
      const currentMinute = Math.floor(elapsedSeconds / 60);

      // Check if process is still alive (every 5 seconds)
      if (now - data.lastProcessCheck >= this.PROCESS_CHECK_INTERVAL) {
        data.lastProcessCheck = now;

        const processCheckCallback = this.processCheckCallbacks.get(entryId);
        if (processCheckCallback) {
          try {
            const isAlive = await processCheckCallback(entryId);
            if (!isAlive) {
              console.log(`[TimerService] ❌ Process died for ${software}, stopping timer`);
              // Stop timer immediately to prevent zombie interval
              // Callback will continue async to handle full cleanup (backend, disk, WorkSession)
              this.stop(entryId);
              return;
            }
          } catch (error) {
            console.error(`[TimerService] ❌ Process check failed for ${entryId}:`, error);
          }
        }
      }

      // Debug log every 10 seconds (dev builds only)
      if (import.meta.env.DEV && elapsedSeconds % 10 === 0 && elapsedSeconds > 0) {
        console.log(`[TimerService] ⏱️  ${software}: ${elapsedSeconds}s (current minute: ${currentMinute})`);
      }

      // Check if we've entered a new minute
      if (currentMinute > data.lastMinuteEmitted) {
        console.log(`[TimerService] 🎯 New minute reached for ${software}: ${data.lastMinuteEmitted} -> ${currentMinute}`);

        // Update last emitted minute
        data.lastMinuteEmitted = currentMinute;

        const callback = this.callbacks.get(entryId);
        if (callback) {
          try {
            await callback(entryId);
          } catch (error) {
            console.error(`[TimerService] ❌ Callback failed for ${entryId}:`, error);
          }
        }

        console.log(`[TimerService] ✅ Minute ${currentMinute} completed for ${software}`);
      }
    }, 1000);

    this.timers.set(entryId, timer);
  }

  /**
   * Set process check callback for auto-stop when process dies
   */
  static setProcessCheckCallback(entryId: string, callback: ProcessCheckCallback): void {
    this.processCheckCallbacks.set(entryId, callback);
  }

  /**
   * Stop timer
   */
  static stop(entryId: string): void {
    const timer = this.timers.get(entryId);

    if (timer) {
      clearInterval(timer);
      this.timers.delete(entryId);
      this.timerData.delete(entryId);
      this.callbacks.delete(entryId);
      this.processCheckCallbacks.delete(entryId);
      console.log(`[TimerService] ⏹️  Stopped timer for ${entryId}`);
    } else {
      console.warn(`[TimerService] ⚠️  Tried to stop timer ${entryId} but it wasn't running`);
    }
  }

  /**
   * Get current seconds for a timer (0-59)
   * Calculates from startTime - no desync possible
   */
  static getSeconds(entryId: string): number {
    const data = this.timerData.get(entryId);
    if (!data) return 0;

    const elapsed = Date.now() - data.startTime;
    const totalSeconds = Math.floor(elapsed / 1000);
    return totalSeconds % 60; // Only the seconds part (0-59)
  }

  /**
   * Check if timer is running
   */
  static isRunning(entryId: string): boolean {
    return this.timers.has(entryId);
  }

  /**
   * Stop all timers (cleanup on app exit)
   */
  static stopAll(): void {
    console.log(`[TimerService] Stopping ${this.timers.size} timer(s)...`);

    this.timers.forEach((timer, entryId) => {
      clearInterval(timer);
      console.log(`[TimerService] Stopped timer for ${entryId}`);
    });

    this.timers.clear();
    this.timerData.clear();
    this.callbacks.clear();
    this.projectTimers.clear();
    this.projectTimerMeta.clear();
    this.widgetTimers.clear();

    console.log('[TimerService] ✅ All timers stopped');
  }

  /**
   * Get all running timer IDs
   */
  static getRunningTimers(): string[] {
    return Array.from(this.timers.keys());
  }

  /**
   * Get count of running timers
   */
  static getRunningCount(): number {
    return this.timers.size;
  }

  // ============================================================================
  // New WorkSession Timer Methods
  // ============================================================================

  /**
   * Start WorkSession timer (ticks every minute)
   * Uses projectId as primary key (stable, never changes)
   */
  static startSessionTimer(session: WorkSession): void {
    // VALIDATION: Don't start timer for inactive session
    if (!session.isActive) {
      console.error(`[TimerService] 🚨 Attempted to start timer for INACTIVE session ${session.id}`);
      return;
    }

    const { projectId } = session;

    // Stop existing timer for this project first (idempotent)
    if (this.projectTimers.has(projectId)) {
      console.log(`[TimerService] 🔄 Replacing existing timer for project ${projectId}`);
      this.stopSessionTimerByProjectId(projectId);
    }

    // CRITICAL: Capture projectId (stable) not sessionId (can change)
    const timer = setInterval(async () => {
      console.log(`[TimerService] ⏰ setInterval tick for project ${projectId}`);
      const { useWorkSessionStore } = await import('../stores/workSessionStore');
      // Find CURRENT session for this project (not stale sessionId from closure)
      const currentSession = useWorkSessionStore.getState().getSessionForProject(projectId);
      console.log(`[TimerService] ⏰ currentSession: ${currentSession?.id}, isActive: ${currentSession?.isActive}`);
      if (currentSession && currentSession.isActive) {
        useWorkSessionStore.getState().incrementMinute(currentSession.id);
      } else {
        // Session no longer active - stop timer to prevent orphan
        console.log(`[TimerService] ⚠️  No active session for project ${projectId}, stopping timer`);
        this.stopSessionTimerByProjectId(projectId);
      }
    }, 60000); // 1 minute

    this.projectTimers.set(projectId, timer);
    this.projectTimerMeta.set(projectId, { sessionId: session.id });
    console.log(`[TimerService] ▶️  Started timer for project ${projectId} (session: ${session.id})`);
  }

  /**
   * Stop WorkSession timer by sessionId (backwards compatibility)
   * Finds projectId by sessionId and stops the timer
   */
  static stopSessionTimer(sessionId: string): void {
    // Find projectId by sessionId in metadata
    for (const [projectId, meta] of this.projectTimerMeta.entries()) {
      if (meta.sessionId === sessionId) {
        this.stopSessionTimerByProjectId(projectId);
        return;
      }
    }
    console.warn(`[TimerService] ⚠️  Timer not found for sessionId: ${sessionId}`);
  }

  /**
   * Stop session timer by projectId (PRIMARY method)
   * This is the reliable way to stop timers since projectId never changes
   */
  static stopSessionTimerByProjectId(projectId: string): boolean {
    if (!projectId || projectId.trim() === '') {
      console.error('[TimerService] Invalid projectId');
      return false;
    }

    const timer = this.projectTimers.get(projectId);
    if (timer) {
      clearInterval(timer);
      this.projectTimers.delete(projectId);
      const meta = this.projectTimerMeta.get(projectId);
      this.projectTimerMeta.delete(projectId);
      console.log(`[TimerService] ⏹️  Stopped timer for project ${projectId}${meta ? ` (session: ${meta.sessionId})` : ''}`);
      return true;
    }
    console.log(`[TimerService] ⚠️  No timer found for projectId: ${projectId}`);
    return false;
  }

  // ============================================================================
  // New Widget Timer Methods
  // ============================================================================

  /**
   * Start widget timer (ticks every second)
   * Updates TimeEntry.elapsedSeconds for UI display
   */
  static startWidgetTimer(entry: TimeEntry): void {
    if (this.widgetTimers.has(entry.id)) {
      console.log(`[TimerService] ⚠️  Widget timer already running for ${entry.id}`);
      return;
    }

    const timer = setInterval(async () => {
      const { useTimeTrackingStore } = await import('../stores/timeTrackingStore');
      useTimeTrackingStore.getState().incrementSeconds(entry.id);
    }, 1000); // 1 second

    this.widgetTimers.set(entry.id, timer);
  }

  /**
   * Stop widget timer
   */
  static stopWidgetTimer(entryId: string): void {
    const timer = this.widgetTimers.get(entryId);
    if (timer) {
      clearInterval(timer);
      this.widgetTimers.delete(entryId);
    }
  }
}
