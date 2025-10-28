// src/features/time-tracking/stores/workSessionStore.ts

import { create } from 'zustand';
import type { WorkSession } from '../types/workSession';

interface WorkSessionStore {
  /** Map<projectId, WorkSession> - активные сессии по проектам */
  sessions: Map<string, WorkSession>;

  /** Получить сессию для проекта */
  getSessionForProject: (projectId: string) => WorkSession | undefined;

  /** Создать новую сессию */
  createSession: (session: WorkSession) => void;

  /** Обновить сессию */
  updateSession: (session: WorkSession) => void;

  /** Остановить сессию */
  stopSession: (sessionId: string) => void;

  /** Инкремент времени сессии (вызывается таймером каждую минуту) */
  incrementMinute: (sessionId: string) => Promise<void>;

  /** Очистить все сессии (для тестирования) */
  clearAll: () => void;
}

export const useWorkSessionStore = create<WorkSessionStore>((set, get) => ({
  sessions: new Map(),

  getSessionForProject: (projectId: string) => {
    return Array.from(get().sessions.values()).find(
      s => s.projectId === projectId && s.isActive
    );
  },

  createSession: (session: WorkSession) => {
    set(state => ({
      sessions: new Map(state.sessions).set(session.projectId, session)
    }));
  },

  updateSession: (session: WorkSession) => {
    set(state => ({
      sessions: new Map(state.sessions).set(session.projectId, {
        ...session,
        updatedAt: new Date().toISOString()
      })
    }));
  },

  stopSession: (sessionId: string) => {
    const session = Array.from(get().sessions.values()).find(s => s.id === sessionId);
    if (session) {
      set(state => {
        const sessions = new Map(state.sessions);
        sessions.set(session.projectId, {
          ...session,
          isActive: false,
          updatedAt: new Date().toISOString()
        });
        return { sessions };
      });
      console.log(`[WorkSessionStore] ⏹️ Stopped session ${sessionId}`);
    }
  },

  incrementMinute: async (sessionId: string) => {
    const session = Array.from(get().sessions.values()).find(s => s.id === sessionId);
    if (session && session.isActive) {
      const updatedSession = {
        ...session,
        elapsedMinutes: session.elapsedMinutes + 1,
        updatedAt: new Date().toISOString()
      };

      set(state => {
        const sessions = new Map(state.sessions);
        sessions.set(session.projectId, updatedSession);
        return { sessions };
      });

      // Save workSession to disk IMMEDIATELY so UI updates without delay
      (async () => {
        try {
          const { useProjectStore } = await import('../../../store/projectStore');
          const projectStore = useProjectStore.getState();
          const project = projectStore.projects.find(p => p.id === session.projectId);

          if (project) {
            const updatedProject = {
              ...project,
              workSession: updatedSession,
              updatedAt: new Date().toISOString()
            };
            await projectStore.updateProject(updatedProject);
            console.log(`[WorkSession] ⏱️  Project +1min (total: ${updatedSession.elapsedMinutes}m)`);
          }
        } catch (error) {
          console.error('[WorkSessionStore] ❌ Failed to save WorkSession:', error);
        }
      })();

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
              const currentSoftwareMinutes = entry.softwareMinutes || 0;
              const updatedEntry = { ...entry, softwareMinutes: currentSoftwareMinutes + 1 };
              timeTrackingStore.sessions.set(entry.id, updatedEntry);
            }

            console.log(`[WorkSession] 📊 ${software} +1min (${totalFocusedSeconds}s focused)`);
          }
        }
      } catch (error) {
        console.error('[WorkSessionStore] Failed to count software stats:', error);
      }

      // Save to disk immediately
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

          const updatedProject = {
            ...project,
            timeEntries: updatedEntries,
            workSession: updatedSession,
            updatedAt: new Date().toISOString()
          };

          await projectStore.updateProject(updatedProject);
          console.log(`[WorkSession] 💾 Updated timeEntries with softwareMinutes`);
        }
      } catch (error) {
        console.error('[WorkSessionStore] ❌ Failed to update timeEntries:', error);
      }
    }
  },

  clearAll: () => {
    set({ sessions: new Map() });
    console.log('[WorkSessionStore] 🗑️  All sessions cleared');
  }
}));
