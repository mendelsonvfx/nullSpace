// src/features/time-tracking/stores/timeTrackingStore.ts
import { create } from 'zustand';
import { SessionService } from '../services/SessionService';
import { TimerService } from '../services/TimerService';
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
      widgetVisible: false,  // Widget starts hidden, shown after 1.5s delay
      _visibilityTimeoutId: undefined  // For clearing timeout on stopSession
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
    TimerService.start(entryId, params.software, async () => {
      // Empty callback - stats now handled by WorkSession
    }, now, 0);

    // Set up process check callback to auto-stop session if process dies
    // Uses backend session status (includes window detection, grace period)
    // Also handles PID migration for launcher-based apps (Blender, Adobe, etc.)
    TimerService.setProcessCheckCallback(entryId, async (id) => {
      const session = get().sessions.get(id);
      if (!session || !session.pid) {
        console.log(`[TimeTrackingStore] ⚠️ No session or PID for ${id}, stopping process check`);
        return false;
      }

      try {
        // STEP 1: Check backend session status (respects window detection & grace periods)
        const backendSession = await SessionService.getSessionStatus(session.id);

        if (backendSession?.process_alive) {
          // Backend says alive (may be in grace period for window detection) - trust it
          console.log(`[TimeTrackingStore] ✅ Backend confirms ${session.software} alive (PID: ${backendSession.pid})`);

          // Sync PID if backend changed it (defensive check)
          if (backendSession.pid !== session.pid) {
            console.log(`[TimeTrackingStore] 🔄 Syncing PID: ${session.pid} -> ${backendSession.pid}`);
            const updatedSessions = new Map(get().sessions);
            updatedSessions.set(id, { ...session, pid: backendSession.pid });
            set({ sessions: updatedSessions });
          }

          return true;
        }

        // STEP 2: Backend says dead - try PID migration (handles Blender launcher case)
        console.log(`[TimeTrackingStore] ⚠️ Backend says dead (PID: ${session.pid}), attempting migration...`);
        const newPid = await SessionService.migrateToChildProcess(session.pid, session.software);

        if (newPid) {
          // Successfully found child process
          console.log(`[TimeTrackingStore] ✅ Migrated to child PID: ${newPid}`);

          // Update BOTH backend and frontend session PIDs
          try {
            await SessionService.updateSessionPid(session.id, newPid);
            console.log(`[TimeTrackingStore] ✅ Backend PID updated`);
          } catch (error) {
            console.error(`[TimeTrackingStore] ⚠️ Failed to update backend PID:`, error);
          }

          // Update frontend session
          const updatedSessions = new Map(get().sessions);
          updatedSessions.set(id, { ...session, pid: newPid });
          set({ sessions: updatedSessions });

          return true;
        }

        // STEP 3: No migration possible - session truly dead
        console.log(`[TimeTrackingStore] ❌ No migration possible, stopping session for ${session.software}`);
        await get().stopSession(id);
        return false;

      } catch (error) {
        console.error('[TimeTrackingStore] ❌ Session status check failed:', error);

        // Fallback: use simple process check if backend communication fails
        try {
          const isAlive = await SessionService.checkProcessAlive(session.pid);
          if (!isAlive) {
            await get().stopSession(id);
          }
          return isAlive;
        } catch (fallbackError) {
          console.error('[TimeTrackingStore] ❌ Fallback process check also failed:', fallbackError);
          return false;
        }
      }
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
    const timeoutId = setTimeout(async () => {
      // Update widgetVisible in timeTrackingStore
      set(state => {
        const sessions = new Map(state.sessions);
        const entry = sessions.get(entryId);
        if (entry) {
          sessions.set(entryId, { ...entry, widgetVisible: true, _visibilityTimeoutId: undefined });
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

    // Store timeout ID for cleanup on stopSession
    set(state => {
      const sessions = new Map(state.sessions);
      const entry = sessions.get(entryId);
      if (entry) {
        sessions.set(entryId, { ...entry, _visibilityTimeoutId: timeoutId });
      }
      return { sessions };
    });

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

    // Clear visibility timeout if exists (prevent widgetVisible: true on stopped session)
    if (entry._visibilityTimeoutId) {
      clearTimeout(entry._visibilityTimeoutId);
      console.log('[TimeTrackingStore] ⏹️  Cleared visibility timeout for', entryId);
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
        isActive: false,
        widgetVisible: false
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

    // Save to projectStore and disk (non-blocking to avoid UI freeze)
    // Fire and forget - UI state is already updated above
    (async () => {
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
                  isActive: false,
                  widgetVisible: false
                }
              : e
          );

          // DO NOT RECALCULATE totalMinutesSpent - it's incremented in real-time by WorkSession
          // Recalculating from TimeEntries can overwrite correct values with stale data
          // Only update the timeEntries array to save the stopped session
          const updatedProject = {
            ...project,
            timeEntries: updatedEntries,
            // totalMinutesSpent: KEEP EXISTING VALUE, don't recalculate
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
    })();

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
   *
   * NEW APPROACH: Restore from project.timeEntries instead of backend
   * Backend loses session data on app close, so we use frontend data as source of truth
   */
  initializeFromBackend: async () => {
    console.log('[TimeTrackingStore] Initializing from projects...');

    try {
      // Import projectStore to get timeEntry data
      const { useProjectStore } = await import('../../../store/projectStore');
      const projects = useProjectStore.getState().projects;

      const sessions = new Map<string, TimeEntry>();
      let timerCount = 0;

      // Find all active timeEntries across all projects
      for (const project of projects) {
        if (!project.timeEntries) continue;

        const activeEntries = project.timeEntries.filter(e => e.isActive && !e.isManual && e.pid);

        for (const existingEntry of activeEntries) {
          console.log(`[TimeTrackingStore] Restoring ${existingEntry.software} for project ${project.name}: ${existingEntry.durationMinutes}m total, ${existingEntry.softwareMinutes}m focused`);

          // Check if process is still alive before restoring
          const isProcessAlive = await SessionService.checkProcessAlive(existingEntry.pid!);
          console.log(`[TimeTrackingStore] 🔍 Pre-restore check: PID ${existingEntry.pid} alive? ${isProcessAlive}`);

          if (!isProcessAlive) {
            console.log(`[TimeTrackingStore] ❌ Process ${existingEntry.pid} (${existingEntry.software}) is dead, stopping and recording time`);

            // Stop this session properly (records time to totalMinutesSpent)
            const { useProjectStore } = await import('../../../store/projectStore');
            const currentProject = useProjectStore.getState().projects.find(p => p.id === project.id);

            if (currentProject && existingEntry.workSessionId) {
              // Find the WorkSession
              const workSession = currentProject.workSession;

              if (workSession && workSession.id === existingEntry.workSessionId) {
                // Remove this software from WorkSession
                await WorkSessionService.removeSoftware(workSession, existingEntry.id);
              }
            }

            // Mark as inactive
            if (currentProject) {
              const updatedEntry = { ...existingEntry, isActive: false };
              const updatedTimeEntries = currentProject.timeEntries?.map(e =>
                e.id === existingEntry.id ? updatedEntry : e
              );
              await useProjectStore.getState().updateProject({
                ...currentProject,
                timeEntries: updatedTimeEntries,
                updatedAt: new Date().toISOString()
              });
            }

            continue; // Skip this entry
          }

          // Restart backend tracking for this entry
          try {
            await SessionService.start({
              entryId: existingEntry.id,
              projectId: project.id,
              projectPath: project.path,
              shotId: existingEntry.shotId,
              software: existingEntry.software,
              pid: existingEntry.pid!
            });
            console.log(`[TimeTrackingStore] ✅ Restarted backend tracking for ${existingEntry.software} (PID: ${existingEntry.pid})`);
          } catch (error) {
            console.error(`[TimeTrackingStore] ❌ Failed to restart backend tracking for ${existingEntry.software}:`, error);
            // Continue anyway - we'll still restore the frontend timer
          }

          // Create TimeEntry with widgetVisible
          const entry: TimeEntry = {
            ...existingEntry,
            widgetVisible: true  // Show widget immediately on restored sessions
          };

          sessions.set(entry.id, entry);

          // Start widget timer (ticks every second)
          TimerService.startWidgetTimer(entry);

          // Start minute timer (stats now handled by WorkSession)
          TimerService.start(
            entry.id,
            entry.software,
            async () => {
              // Empty callback - stats now handled by WorkSession
              console.log('[TimeTrackingStore] ⏰ Entry minute tick (restored, stats by WorkSession)');
            },
            entry.startTime,
            entry.durationMinutes
          );

          // Set up process check callback to auto-stop session if process dies
          TimerService.setProcessCheckCallback(entry.id, async (id) => {
            const session = get().sessions.get(id);
            if (!session || !session.pid) {
              console.log(`[TimeTrackingStore] ⚠️ No session or PID for ${id}, stopping process check`);
              return false;
            }

            // Check the actual PID directly
            const isAlive = await SessionService.checkProcessAlive(session.pid);
            console.log(`[TimeTrackingStore] 🔍 Process check for ${session.software} (PID: ${session.pid}): ${isAlive ? '✅ ALIVE' : '❌ DEAD'}`);

            if (!isAlive) {
              console.log(`[TimeTrackingStore] ❌ Process died for ${session.software}, auto-stopping restored session`);
              await get().stopSession(id);
            }
            return isAlive;
          });

          timerCount++;
          console.log('[TimeTrackingStore] ✅ Restored timer for', entry.software);
        }
      }

      set({ sessions });
      console.log(`[TimeTrackingStore] ✅ Initialized ${sessions.size} session(s), ${timerCount} timer(s)`);

      // Restore WorkSessions for projects with active sessions
      console.log('[TimeTrackingStore] Restoring WorkSessions...');
      let restoredWorkSessions = 0;
      for (const project of projects) {
        // Check if project has active timeEntries (not just workSession flag)
        const hasActiveEntries = project.timeEntries?.some(e => e.isActive && !e.isManual && e.pid);

        if (hasActiveEntries) {
          try {
            // If workSession exists, restore it; otherwise create new one
            if (project.workSession && project.workSession.isActive) {
              await WorkSessionService.restoreFromProject(project);
            } else {
              // Create new WorkSession from active entries
              console.log(`[TimeTrackingStore] Creating new WorkSession for project: ${project.name}`);

              const activeEntries = project.timeEntries?.filter(e => e.isActive && !e.isManual && e.pid) || [];

              // Restore elapsedMinutes from saved WorkSession (NOT from sum of TimeEntry durations)
              // This is critical: TimeEntry.durationMinutes is per-software, WorkSession.elapsedMinutes is project-level
              const savedElapsedMinutes = project.workSession?.elapsedMinutes || 0;
              console.log(`[TimeTrackingStore] Restoring elapsedMinutes: ${savedElapsedMinutes}m from saved WorkSession (${activeEntries.length} active entries)`);

              // Create WorkSession manually to set elapsedMinutes
              const { createWorkSession } = await import('../utils/workSessionUtils');
              const { useWorkSessionStore } = await import('./workSessionStore');

              const newSession = createWorkSession(project.id);
              newSession.elapsedMinutes = savedElapsedMinutes; // Restore from WorkSession, NOT sum

              useWorkSessionStore.getState().createSession(newSession);

              // Add all active entries to the session
              for (const entry of activeEntries) {
                WorkSessionService.addSoftware(newSession, entry.id);
              }

              // Start session timer
              TimerService.startSessionTimer(newSession);
            }

            restoredWorkSessions++;
            console.log(`[TimeTrackingStore] ✅ Restored WorkSession for project: ${project.name}`);
          } catch (error) {
            console.error(`[TimeTrackingStore] ❌ Failed to restore WorkSession for ${project.name}:`, error);
          }
        }
      }
      console.log(`[TimeTrackingStore] ✅ Restored ${restoredWorkSessions} WorkSession(s)`);
    } catch (error) {
      console.error('[TimeTrackingStore] ❌ Failed to initialize from backend:', error);
    }
  }
}));
