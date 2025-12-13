// src/features/time-tracking/stores/workSessionStore.ts

import { create } from 'zustand';
import type { WorkSession } from '../types/workSession';
import type { TimeEntry } from '../../../types/project';

interface WorkSessionStore {
  /** Map<sessionId, WorkSession> - активные сессии по ID */
  sessions: Map<string, WorkSession>;

  /** Получить сессию для проекта */
  getSessionForProject: (projectId: string) => WorkSession | undefined;

  /** Создать новую сессию */
  createSession: (session: WorkSession) => void;

  /** Обновить сессию */
  updateSession: (session: WorkSession) => void;

  /** Остановить сессию по sessionId */
  stopSession: (sessionId: string) => void;

  /** Остановить сессию по projectId (PRIMARY - более надежный метод) */
  stopSessionByProjectId: (projectId: string) => void;

  /** Инкремент времени сессии (вызывается таймером каждую минуту) */
  incrementMinute: (sessionId: string) => Promise<void>;

  /** Очистить все сессии (для тестирования) */
  clearAll: () => void;
}

// Track active incrementMinute operations for cancellation
const activeIncrements = new Map<string, boolean>();

export const useWorkSessionStore = create<WorkSessionStore>((set, get) => ({
  sessions: new Map(),

  getSessionForProject: (projectId: string) => {
    return Array.from(get().sessions.values()).find(
      s => s.projectId === projectId && s.isActive
    );
  },

  createSession: (session: WorkSession) => {
    set(state => ({
      sessions: new Map(state.sessions).set(session.id, session)
    }));
  },

  updateSession: (session: WorkSession) => {
    set(state => ({
      sessions: new Map(state.sessions).set(session.id, {
        ...session,
        updatedAt: new Date().toISOString()
      })
    }));
  },

  stopSession: (sessionId: string) => {
    // CRITICAL: Cancel any in-flight incrementMinute operations
    activeIncrements.set(sessionId, true);
    setTimeout(() => activeIncrements.delete(sessionId), 5000);

    const session = Array.from(get().sessions.values()).find(s => s.id === sessionId);

    if (session) {
      // Also cancel by projectId (belt-and-suspenders)
      activeIncrements.set(session.projectId, true);
      setTimeout(() => activeIncrements.delete(session.projectId), 5000);

      set(state => {
        const sessions = new Map(state.sessions);
        sessions.set(session.id, {
          ...session,
          isActive: false,
          updatedAt: new Date().toISOString()
        });
        return { sessions };
      });
      console.log(`[WorkSessionStore] ⏹️ Stopped session ${sessionId}`);
    } else {
      console.warn(`[WorkSessionStore] ⚠️  Session ${sessionId} not found`);
    }
  },

  stopSessionByProjectId: (projectId: string) => {
    // CRITICAL: Cancel by projectId (stable, never changes)
    activeIncrements.set(projectId, true);
    setTimeout(() => activeIncrements.delete(projectId), 5000);

    const session = get().getSessionForProject(projectId);

    if (session) {
      // Also cancel by sessionId
      activeIncrements.set(session.id, true);
      setTimeout(() => activeIncrements.delete(session.id), 5000);

      set(state => {
        const sessions = new Map(state.sessions);
        sessions.set(session.id, {
          ...session,
          isActive: false,
          updatedAt: new Date().toISOString()
        });
        return { sessions };
      });
      console.log(`[WorkSessionStore] ⏹️ Stopped session for project ${projectId} (session: ${session.id})`);
    } else {
      console.warn(`[WorkSessionStore] ⚠️  No active session for project ${projectId}`);
    }
  },

  incrementMinute: async (sessionId: string) => {
    console.log(`[WorkSession] 📥 incrementMinute called for session: ${sessionId}`);
    const session = Array.from(get().sessions.values()).find(s => s.id === sessionId);
    console.log(`[WorkSession] 📥 session found: ${!!session}, isActive: ${session?.isActive}`);

    // Check cancellation by sessionId
    if (activeIncrements.get(sessionId) === true) {
      console.log(`[WorkSession] ⚠️  incrementMinute cancelled for ${sessionId} (sessionId token)`);
      activeIncrements.delete(sessionId);
      return;
    }

    // Check cancellation by projectId (more reliable - projectId never changes)
    if (session && activeIncrements.get(session.projectId) === true) {
      console.log(`[WorkSession] ⚠️  incrementMinute cancelled for ${sessionId} (projectId token)`);
      activeIncrements.delete(session.projectId);
      return;
    }

    // CHECK: Early exit if session not found or inactive
    if (!session || !session.isActive) {
      activeIncrements.delete(sessionId);
      return;
    }

    // Direct update - no redundant check needed since we already validated above
    const updatedSession = {
      ...session,
      elapsedMinutes: session.elapsedMinutes + 1,
      updatedAt: new Date().toISOString()
    };

    set(state => {
      const sessions = new Map(state.sessions);
      sessions.set(session.id, updatedSession);
      return { sessions };
    });

    // Count software statistics using focus history (last 60 seconds) - runs in parallel
    try {
        const { useTimeTrackingStore } = await import('./timeTrackingStore');
        const { SessionService } = await import('../services/SessionService');
        const { StatsService } = await import('../services/StatsService');
        const timeTrackingStore = useTimeTrackingStore.getState();

        // Get all TimeEntries for this WorkSession
        const entries = session.softwareSessions
          .map(entryId => timeTrackingStore.sessions.get(entryId))
          .filter(e => e && e.isActive);

        // Group by software
        const softwareGroups = new Map<string, typeof entries>();
        for (const entry of entries) {
          if (entry) {
            const software = entry.software;
            if (!softwareGroups.has(software)) {
              softwareGroups.set(software, []);
            }
            softwareGroups.get(software)!.push(entry);
          }
        }

        // For each unique software, check focus history (last 60 seconds)
        const THRESHOLD_SECONDS = 30; // Need at least 30 seconds focused to count the minute

        for (const [software, softwareEntries] of softwareGroups) {
          let totalFocusedSeconds = 0;

          // Get focus summary for all instances of this software
          for (const entry of softwareEntries) {
            if (!entry) continue;
            try {
              const summary = await SessionService.getFocusSummary(entry.id);
              totalFocusedSeconds += summary.focused_seconds;
            } catch (error) {
              console.error(`[WorkSession] Failed to get focus summary for ${entry.id}:`, error);
            }
          }

          // Use majority voting: if focused ≥30 seconds out of last 60, count it
          if (totalFocusedSeconds >= THRESHOLD_SECONDS) {
            // Increment stats for this software (only once, regardless of how many instances)
            StatsService.addSoftwareTime(software as any, 1);

            // Increment softwareMinutes for each entry of this software
            for (const entry of softwareEntries) {
              if (!entry || !entry.id) continue;
              const currentSoftwareMinutes = entry.softwareMinutes || 0;
              const updatedEntry: TimeEntry = { ...entry, id: entry.id, softwareMinutes: currentSoftwareMinutes + 1 };
              timeTrackingStore.sessions.set(entry.id, updatedEntry);
            }

            console.log(`[WorkSession] 📊 ${software} +1min (${totalFocusedSeconds}s focused)`);
          }
        }
      } catch (error) {
        console.error('[WorkSessionStore] Failed to count software stats:', error);
      }

      // Save to disk immediately - ATOMIC UPDATE to prevent race conditions
      try {
        const { useTimeTrackingStore } = await import('./timeTrackingStore');
        const { useProjectStore } = await import('../../../store/projectStore');
        const timeTrackingStore = useTimeTrackingStore.getState();
        const projectStore = useProjectStore.getState();
        const project = projectStore.projects.find(p => p.id === session.projectId);

        if (project) {
          // Update timeEntries with new softwareMinutes from timeTrackingStore
          const updatedEntries = (project.timeEntries || []).map(entry => {
            const trackedEntry = timeTrackingStore.sessions.get(entry.id);
            if (trackedEntry && trackedEntry.isActive) {
              return {
                ...entry,
                softwareMinutes: trackedEntry.softwareMinutes || 0
              };
            }
            return entry;
          });

          // CHECK #2: Cancellation check before disk write
          if (activeIncrements.get(sessionId) === true) {
            console.log(`[WorkSession] ⚠️  incrementMinute cancelled for ${sessionId} (cancellation token)`);
            activeIncrements.delete(sessionId);
            return;
          }

          // CHECK #3: Double-check isActive RIGHT BEFORE disk write (race protection)
          const freshSession = Array.from(get().sessions.values()).find(s => s.id === sessionId);
          if (!freshSession || !freshSession.isActive) {
            console.log(`[WorkSession] ⚠️  Session became inactive during increment, aborting disk write`);
            activeIncrements.delete(sessionId);
            return;
          }

          // ATOMIC UPDATE: Combine all three updates into ONE database write
          // This prevents race conditions when multiple projects are active
          const updatedProject = {
            ...project,
            workSession: updatedSession,                          // Update 1: workSession
            totalMinutesSpent: (project.totalMinutesSpent || 0) + 1,  // Update 2: totalMinutesSpent
            timeEntries: updatedEntries,                          // Update 3: timeEntries with softwareMinutes
            updatedAt: new Date().toISOString()
          };

          await projectStore.updateProject(updatedProject);
          console.log(`[WorkSession] 💾 Atomic update: +1min (total: ${updatedProject.totalMinutesSpent}m), workSession, timeEntries`);

          // Cleanup: Remove from active operations
          activeIncrements.delete(sessionId);
        }
    } catch (error) {
      console.error('[WorkSessionStore] ❌ Failed to update project:', error);
      // Cleanup on error
      activeIncrements.delete(sessionId);
    }
    // Final cleanup (in case no disk write happened)
    activeIncrements.delete(sessionId);
  },

  clearAll: () => {
    set({ sessions: new Map() });
    console.log('[WorkSessionStore] 🗑️  All sessions cleared');
  }
}));
