// src/features/time-tracking/stores/timeTrackingStore.ts
import { create } from 'zustand';
import { SessionService } from '../services/SessionService';
import { TimerService } from '../services/TimerService';
import { StatsService } from '../services/StatsService';
import { WorkSessionService } from '../services/WorkSessionService';
import type { TimeEntry } from '../types/timeEntry';
import type { SoftwareName } from '../../../types/project';
import type { StartSessionParams } from '../types/session';

interface TimeTrackingState {
  // State
  sessions: Map<string, TimeEntry>;

  // Actions
  startSession: (params: Omit<StartSessionParams, 'entryId'>) => Promise<string>;
  stopSession: (entryId: string) => Promise<number>;
  incrementSeconds: (entryId: string) => void;
  getSession: (entryId: string) => TimeEntry | undefined;
  getSessionByPid: (pid: number) => TimeEntry | undefined;
  getAllSessions: () => TimeEntry[];
  getActiveSessionsForProject: (projectId: string) => TimeEntry[];
  initializeFromBackend: () => Promise<void>;
}

/**
 * Store for managing time tracking sessions
 * Handles active session state and communicates with backend
 */
export const useTimeTrackingStore = create<TimeTrackingState>((set, get) => ({
  sessions: new Map(),

  /**
   * Start a new tracking session
   * Creates entry, starts backend tracking, WorkSession, and starts timers
   */
  startSession: async (params) => {
    // Check if time tracking is enabled
    const timeTrackingEnabled = localStorage.getItem('timeTrackingEnabled');
    const isTimeTrackingEnabled = timeTrackingEnabled !== null ? JSON.parse(timeTrackingEnabled) : true;

    if (!isTimeTrackingEnabled) {
      console.log('[TimeTracking] ⏸️  Time tracking is disabled, rejecting session start');
      throw new Error('Time tracking is disabled');
    }

    // Check if this software+project is already tracking
    const existingSession = get().getActiveSessionsForProject(params.projectId)
      .find(s => s.software === params.software && s.pid === params.pid);

    if (existingSession) {
      console.log(`[TimeTracking] ✓ Session already exists for ${params.software} (PID: ${params.pid})`);
      return existingSession.id;
    }

    // Check if this PID is tracked by ANY other project (PS/AE process reuse)
    const pidConflict = get().getSessionByPid(params.pid);
    if (pidConflict && pidConflict.projectId !== params.projectId) {
      console.warn(`[TimeTracking] ⚠️  PID ${params.pid} already tracked by another project (${pidConflict.software})`);
      console.log(`[TimeTracking] 🔄 Stopping old session and starting new session for current project`);

      // Stop the conflicting session
      await get().stopSession(pidConflict.id);
    }

    const entryId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Get or create WorkSession for this project
    const workSession = WorkSessionService.getOrCreateForProject(params.projectId);
    const isFirstSoftware = workSession.softwareSessions.length === 0;

    const entry: TimeEntry = {
      id: entryId,
      projectId: params.projectId,
      shotId: params.shotId,
      software: params.software as SoftwareName,
      startTime: now,
      durationMinutes: 0,
      softwareMinutes: 0,  // Focused time counter (incremented by WorkSession)
      elapsedSeconds: 0,  // NEW: for widget display
      workSessionId: workSession.id,  // NEW: link to WorkSession
      isActive: true,
      isManual: false,
      pid: params.pid,
      countedInStats: true,
      widgetVisible: false  // Widget starts hidden, shown after 1.5s delay
    };

    // Start backend tracking
    await SessionService.start({
      ...params,
      entryId
    });

    // Add to store
    set(state => {
      const sessions = new Map(state.sessions);
      sessions.set(entryId, entry);
      return { sessions };
    });

    // Add software to WorkSession
    WorkSessionService.addSoftware(workSession, entryId);

    // Start WorkSession timer if this is the first software
    if (isFirstSoftware) {
      TimerService.startSessionTimer(workSession);
    }

    // Start widget timer (ticks every second for display)
    TimerService.startWidgetTimer(entry);

    // Note: Software stats are now counted by WorkSession timer (not per-entry)
    // This timer is kept for potential future per-entry tracking needs
    TimerService.start(entryId, params.software, async (entryId) => {
      // Empty callback - stats now handled by WorkSession
    }, now, 0);

    // Set up process check callback to auto-stop session if process dies
    TimerService.setProcessCheckCallback(entryId, async (id) => {
      const isAlive = await SessionService.verifySession(id);
      if (!isAlive) {
        await get().stopSession(id);
      }
      return isAlive;
    });

    // Save WorkSession to project
    try {
      const { useProjectStore } = await import('../../../store/projectStore');
      const projectStore = useProjectStore.getState();
      const project = projectStore.projects.find(p => p.id === params.projectId);

      if (project) {
        const updatedEntries = [...(project.timeEntries || []), entry];

        const updatedProject = {
          ...project,
          timeEntries: updatedEntries,
          workSession,
          updatedAt: new Date().toISOString()
        };

        await projectStore.updateProject(updatedProject);
      }
    } catch (error) {
      console.error('[TimeTrackingStore] ❌ Failed to save WorkSession:', error);
    }

    // Show widget after 1.5 second delay
    setTimeout(async () => {
      // Update widgetVisible in timeTrackingStore
      set(state => {
        const sessions = new Map(state.sessions);
        const entry = sessions.get(entryId);
        if (entry) {
          sessions.set(entryId, { ...entry, widgetVisible: true });
        }
        return { sessions };
      });

      // Update widgetVisible in project store
      try {
        const { useProjectStore } = await import('../../../store/projectStore');
        const projectStore = useProjectStore.getState();
        const project = projectStore.projects.find(p => p.id === params.projectId);

        if (project) {
          const updatedEntries = (project.timeEntries || []).map(e =>
            e.id === entryId ? { ...e, widgetVisible: true } : e
          );

          const updatedProject = {
            ...project,
            timeEntries: updatedEntries,
            updatedAt: new Date().toISOString()
          };

          await projectStore.updateProject(updatedProject);
        }
      } catch (error) {
        console.error('[TimeTrackingStore] ❌ Failed to show widget:', error);
      }
    }, 1500);

    return entryId;
  },

  /**
   * Stop a tracking session
   * Stops timers, backend tracking, updates WorkSession, saves to disk
   */
  stopSession: async (entryId) => {
    console.log('[TimeTrackingStore] Stopping session:', entryId);

    const entry = get().sessions.get(entryId);
    if (!entry) {
      console.warn('[TimeTrackingStore] Cannot stop - entry not found:', entryId);
      return 0;
    }

    // Stop widget timer
    TimerService.stopWidgetTimer(entryId);

    // Stop minute timer
    TimerService.stop(entryId);

    // Calculate final minutes from elapsedSeconds
    const finalMinutes = Math.floor(entry.elapsedSeconds / 60);
    const now = new Date().toISOString();

    console.log(`[TimeTrackingStore] 🛑 Stopped ${entry.software}: ${finalMinutes}m total (${entry.elapsedSeconds}s)`);

    // Update entry in timeTrackingStore
    set(state => {
      const sessions = new Map(state.sessions);
      sessions.set(entryId, {
        ...entry,
        endTime: now,
        durationMinutes: finalMinutes,
        isActive: false
      });
      return { sessions };
    });

    // Stop backend tracking
    await SessionService.stop(entryId);

    // Remove from WorkSession and handle session closure
    if (entry.workSessionId) {
      console.log(`[TimeTrackingStore] 🔗 Entry has workSessionId: ${entry.workSessionId}`);
      const { useWorkSessionStore } = await import('./workSessionStore');
      const workSession = Array.from(useWorkSessionStore.getState().sessions.values())
        .find(s => s.id === entry.workSessionId);

      if (workSession) {
        console.log(`[TimeTrackingStore] ✅ Found WorkSession, removing software. Remaining software count: ${workSession.softwareSessions.length}`);
        await WorkSessionService.removeSoftware(workSession, entryId);
      } else {
        console.warn(`[TimeTrackingStore] ⚠️  WorkSession ${entry.workSessionId} not found!`);
      }
    } else {
      console.warn(`[TimeTrackingStore] ⚠️  Entry has no workSessionId!`);
    }

    // Save to projectStore and disk
    try {
      const { useProjectStore } = await import('../../../store/projectStore');
      const projectStore = useProjectStore.getState();
      const project = projectStore.projects.find(p => p.id === entry.projectId);

      if (project) {
        const updatedEntry = get().sessions.get(entryId);
        const updatedEntries = (project.timeEntries || []).map(e =>
          e.id === entryId
            ? {
                ...e,
                endTime: now,
                durationMinutes: finalMinutes,
                softwareMinutes: updatedEntry?.softwareMinutes || 0,  // Save focused minutes
                isActive: false
              }
            : e
        );

        const completedMinutes = updatedEntries
          .filter(e => !e.isActive)
          .reduce((sum, e) => sum + e.durationMinutes, 0);

        const updatedProject = {
          ...project,
          timeEntries: updatedEntries,
          totalMinutesSpent: completedMinutes,
          workSession: project.workSession,  // Keep WorkSession (updated by WorkSessionService)
          updatedAt: new Date().toISOString()
        };

        await projectStore.updateProject(updatedProject);
        const focusedMinutes = updatedEntry?.softwareMinutes || 0;
        console.log(`[TimeTrackingStore] 💾 Saved stopped session to disk: ${entry.software} ${finalMinutes}m total, ${focusedMinutes}m focused`);
      }
    } catch (error) {
      console.error('[TimeTrackingStore] ❌ Failed to save stopped session to disk:', error);
    }

    return finalMinutes;
  },

  /**
   * Increment elapsedSeconds by 1
   * Called by widget timer every second for UI display
   */
  incrementSeconds: (entryId) => {
    const entry = get().sessions.get(entryId);

    if (!entry || !entry.isActive) {
      return;
    }

    set(state => {
      const sessions = new Map(state.sessions);
      sessions.set(entryId, {
        ...entry,
        elapsedSeconds: entry.elapsedSeconds + 1
      });
      return { sessions };
    });
  },

  /**
   * Get session by ID
   */
  getSession: (entryId) => {
    return get().sessions.get(entryId);
  },

  /**
   * Get session by PID (for detecting process reuse in PS/AE)
   */
  getSessionByPid: (pid) => {
    return get()
      .getAllSessions()
      .find(s => s.pid === pid && s.isActive);
  },

  /**
   * Get all sessions
   */
  getAllSessions: () => {
    return Array.from(get().sessions.values());
  },

  /**
   * Get active sessions for a specific project
   */
  getActiveSessionsForProject: (projectId) => {
    return get()
      .getAllSessions()
      .filter(s => s.projectId === projectId && s.isActive);
  },

  /**
   * Initialize sessions from backend on app startup
   * Restores timers for active sessions and WorkSessions
   * IMPORTANT: Must be called AFTER projectStore.loadProjects() to get accurate data
   */
  initializeFromBackend: async () => {
    console.log('[TimeTrackingStore] Initializing from backend...');

    try {
      // Import projectStore to get accurate timeEntry data
      const { useProjectStore } = await import('../../../store/projectStore');
      const projects = useProjectStore.getState().projects;

      const backendSessions = await SessionService.getActiveSessions();
      console.log('[TimeTrackingStore] Found', backendSessions.length, 'backend session(s)');

      const sessions = new Map<string, TimeEntry>();
      let timerCount = 0;

      for (const backendSession of backendSessions) {
        if (!backendSession.process_alive) {
          console.log('[TimeTrackingStore] ⏭️ Skipping dead session:', backendSession.software);
          continue;
        }

        // Find the actual timeEntry in projectStore to get accurate data
        const project = projects.find(p => p.id === backendSession.project_id);
        const existingEntry = project?.timeEntries?.find(e => e.id === backendSession.entry_id);

        // Use data from projectStore if available
        const durationMinutes = existingEntry?.durationMinutes ?? 0;
        const softwareMinutes = existingEntry?.softwareMinutes ?? 0;
        const elapsedSeconds = existingEntry?.elapsedSeconds ?? durationMinutes * 60;
        const workSessionId = existingEntry?.workSessionId;

        console.log(`[TimeTrackingStore] Restoring ${backendSession.software}: ${durationMinutes}m total, ${softwareMinutes}m focused (from ${existingEntry ? 'projectStore' : 'backend'})`);

        // Create TimeEntry from backend session
        const entry: TimeEntry = {
          id: backendSession.entry_id,
          projectId: backendSession.project_id,
          shotId: backendSession.shot_id || undefined,
          software: backendSession.software as SoftwareName,
          startTime: backendSession.start_time,
          durationMinutes,
          softwareMinutes,
          elapsedSeconds,
          workSessionId,
          isActive: true,
          isManual: false,
          pid: backendSession.pid,
          countedInStats: true
        };

        sessions.set(entry.id, entry);

        // Start widget timer (ticks every second)
        TimerService.startWidgetTimer(entry);

        // Start minute timer (stats now handled by WorkSession)
        TimerService.start(
          entry.id,
          entry.software,
          async (entryId) => {
            // Empty callback - stats now handled by WorkSession
            console.log('[TimeTrackingStore] ⏰ Entry minute tick (restored, stats by WorkSession)');
          },
          entry.startTime,
          entry.durationMinutes
        );

        // Set up process check callback to auto-stop session if process dies
        TimerService.setProcessCheckCallback(entry.id, async (id) => {
          const isAlive = await SessionService.verifySession(id);
          if (!isAlive) {
            console.log(`[TimeTrackingStore] ❌ Process died for ${entry.software}, auto-stopping restored session`);
            await get().stopSession(id);
          }
          return isAlive;
        });

        timerCount++;
        console.log('[TimeTrackingStore] ✅ Restored timer for', entry.software);
      }

      set({ sessions });
      console.log(`[TimeTrackingStore] ✅ Initialized ${sessions.size} session(s), ${timerCount} timer(s)`);
    } catch (error) {
      console.error('[TimeTrackingStore] ❌ Failed to initialize from backend:', error);
    }
  }
}));
