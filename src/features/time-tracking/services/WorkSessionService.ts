// src/features/time-tracking/services/WorkSessionService.ts

import { useWorkSessionStore } from '../stores/workSessionStore';
import { createWorkSession } from '../utils/workSessionUtils';
import type { WorkSession } from '../types/workSession';
import type { TimeEntry } from '../types/timeEntry';

/**
 * Сервис для управления WorkSession
 * Отвечает за создание, обновление и остановку рабочих сессий проектов
 */
export class WorkSessionService {
  /**
   * Получить или создать WorkSession для проекта
   * @returns Активная WorkSession для проекта
   */
  static getOrCreateForProject(projectId: string): WorkSession {
    const existing = useWorkSessionStore.getState().getSessionForProject(projectId);

    if (existing && existing.isActive) {
      return existing;
    }

    const newSession = createWorkSession(projectId);
    useWorkSessionStore.getState().createSession(newSession);

    return newSession;
  }

  /**
   * Добавить софт в WorkSession
   */
  static addSoftware(session: WorkSession, entryId: string): void {
    if (session.softwareSessions.includes(entryId)) {
      return;
    }

    const updated: WorkSession = {
      ...session,
      softwareSessions: [...session.softwareSessions, entryId]
    };

    useWorkSessionStore.getState().updateSession(updated);
  }

  /**
   * Удалить софт из WorkSession
   * Если сессия становится пустой - останавливает её
   */
  static async removeSoftware(session: WorkSession, entryId: string): Promise<void> {
    const softwareSessions = session.softwareSessions.filter(id => id !== entryId);

    if (softwareSessions.length === 0) {
      // Последний софт закрылся - останавливаем WorkSession
      await this.stopSession(session.id);
    } else {
      // Ещё есть софты - обновляем список
      const updated: WorkSession = {
        ...session,
        softwareSessions
      };
      useWorkSessionStore.getState().updateSession(updated);
      console.log(`[WorkSessionService] ➖ Removed software ${entryId} from session (remaining: ${softwareSessions.length})`);
    }
  }

  /**
   * Остановить WorkSession
   * - Останавливает таймер
   * - Записывает elapsedMinutes в project.totalMinutesSpent
   * - Помечает session.isActive = false
   * - Удаляет workSession из проекта
   */
  static async stopSession(sessionId: string): Promise<void> {
    const session = Array.from(useWorkSessionStore.getState().sessions.values())
      .find(s => s.id === sessionId);

    if (!session) {
      console.warn(`[WorkSessionService] ⚠️  Session ${sessionId} not found`);
      return;
    }

    console.log(`[WorkSessionService] ⏹️  Stopping session ${sessionId} (${session.elapsedMinutes}m elapsed)`);

    // 1. Остановить таймер
    const { TimerService } = await import('./TimerService');
    TimerService.stopSessionTimer(sessionId);

    // 2. Записать накопленное время в проект
    const { useProjectStore } = await import('../../../store/projectStore');
    const project = useProjectStore.getState().projects.find(p => p.id === session.projectId);

    if (project) {
      const updatedProject = {
        ...project,
        totalMinutesSpent: (project.totalMinutesSpent || 0) + session.elapsedMinutes,
        workSession: null, // Удаляем WorkSession из проекта
        updatedAt: new Date().toISOString()
      };

      await useProjectStore.getState().updateProject(updatedProject);
      console.log(`[WorkSessionService] 💾 Saved ${session.elapsedMinutes}m to project total (new total: ${updatedProject.totalMinutesSpent}m)`);
    }

    // 3. Помечаем сессию как неактивную
    useWorkSessionStore.getState().stopSession(sessionId);
  }

  /**
   * Восстановить WorkSession из проекта при запуске приложения
   * Проверяет все PID софтов в сессии
   * Убирает мертвые процессы, продолжает с живыми
   */
  static async restoreFromProject(project: any): Promise<void> {
    if (!project.workSession || !project.workSession.isActive) {
      return;
    }

    const session = project.workSession as WorkSession;
    console.log(`[WorkSessionService] 🔄 Restoring session for project ${project.name} (${session.softwareSessions.length} software)`);

    // Проверяем каждый софт в сессии
    const { SessionService } = await import('./SessionService');
    const aliveSessions: string[] = [];
    const deadSessions: string[] = [];

    for (const entryId of session.softwareSessions) {
      const entry = project.timeEntries?.find((e: TimeEntry) => e.id === entryId);
      if (!entry || !entry.pid) {
        deadSessions.push(entryId);
        continue;
      }

      // Проверяем жив ли процесс
      const isAlive = await SessionService.verifySession(entryId);
      if (isAlive) {
        aliveSessions.push(entryId);
        console.log(`[WorkSessionService] ✅ Process alive: ${entry.software} (PID: ${entry.pid})`);
      } else {
        deadSessions.push(entryId);
        console.log(`[WorkSessionService] ❌ Process dead: ${entry.software} (PID: ${entry.pid})`);
      }
    }

    // Обновляем WorkSession
    if (aliveSessions.length === 0) {
      // Все процессы мертвы - останавливаем сессию
      console.log(`[WorkSessionService] 🛑 All processes dead, stopping session`);
      await this.stopSession(session.id);
    } else {
      // Есть живые процессы - обновляем список и продолжаем
      const updatedSession: WorkSession = {
        ...session,
        softwareSessions: aliveSessions
      };

      useWorkSessionStore.getState().createSession(updatedSession);

      // Записываем мертвые сессии в статистику и останавливаем их
      const { useTimeTrackingStore } = await import('../stores/timeTrackingStore');
      for (const deadEntryId of deadSessions) {
        const entry = project.timeEntries?.find((e: TimeEntry) => e.id === deadEntryId);
        if (entry) {
          // Останавливаем entry и записываем в статистику
          await useTimeTrackingStore.getState().stopSession(deadEntryId);
        }
      }

      // Запускаем таймер для WorkSession
      const { TimerService } = await import('./TimerService');
      TimerService.startSessionTimer(updatedSession);

      console.log(`[WorkSessionService] ✅ Session restored (${aliveSessions.length} alive, ${deadSessions.length} dead)`);
    }
  }
}
