// src/features/time-tracking/utils/workSessionUtils.ts

import type { WorkSession } from '../types/workSession';

/**
 * Создать новую WorkSession для проекта
 */
export const createWorkSession = (projectId: string): WorkSession => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    projectId,
    startTime: now,
    elapsedMinutes: 0,
    isActive: true,
    softwareSessions: [],
    createdAt: now,
    updatedAt: now
  };
};

/**
 * Проверить, пуста ли сессия (нет активных софтов)
 */
export const isWorkSessionEmpty = (session: WorkSession): boolean => {
  return session.softwareSessions.length === 0;
};

/**
 * Проверить, активна ли сессия
 */
export const isWorkSessionActive = (session: WorkSession): boolean => {
  return session.isActive && session.softwareSessions.length > 0;
};
