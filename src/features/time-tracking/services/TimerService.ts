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

  // New: WorkSession timers (tick every minute)
  private static sessionTimers = new Map<string, NodeJSTimeout>();

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
              // Process died - callback will handle stopSession which will stop timers
              // Don't call this.stop() here to avoid duplicate stop attempts
              return;
            }
          } catch (error) {
            console.error(`[TimerService] ❌ Process check failed for ${entryId}:`, error);
          }
        }
      }

      // Debug log every 10 seconds
      if (elapsedSeconds % 10 === 0 && elapsedSeconds > 0) {
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
    this.sessionTimers.clear();
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
   * Updates WorkSession.elapsedMinutes
   */
  static startSessionTimer(session: WorkSession): void {
    if (this.sessionTimers.has(session.id)) {
      console.log(`[TimerService] ⚠️  Session timer already running for ${session.id}`);
      return;
    }

    const timer = setInterval(async () => {
      const { useWorkSessionStore } = await import('../stores/workSessionStore');
      useWorkSessionStore.getState().incrementMinute(session.id);
    }, 60000); // 1 minute

    this.sessionTimers.set(session.id, timer);
  }

  /**
   * Stop WorkSession timer
   */
  static stopSessionTimer(sessionId: string): void {
    const timer = this.sessionTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.sessionTimers.delete(sessionId);
    }
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
