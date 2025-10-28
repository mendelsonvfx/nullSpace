// src/features/time-tracking/types/workSession.ts

/**
 * WorkSession - рабочая сессия проекта
 * Создается при запуске первого софта в проекте
 * Тикает каждую минуту независимо от софтов
 * Останавливается когда закрывается последний софт
 */
export interface WorkSession {
  /** UUID сессии */
  id: string;

  /** ID проекта, к которому относится сессия */
  projectId: string;

  /** Время начала сессии (ISO timestamp) */
  startTime: string;

  /** Сколько минут прошло с начала сессии (тикает каждую минуту) */
  elapsedMinutes: number;

  /** Активна ли сессия */
  isActive: boolean;

  /** ID софтов (TimeEntry), которые активны в этой сессии */
  softwareSessions: string[];

  /** Когда создана сессия */
  createdAt: string;

  /** Последнее обновление */
  updatedAt: string;
}
