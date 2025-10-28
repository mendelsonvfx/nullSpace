# WorkSession System - Refactoring Plan

## Цель
Заменить текущую систему отслеживания времени проекта (с поиском "самой ранней сессии") на явную систему **WorkSession**, которая создает "зону" для каждого проекта, в которую попадают все запущенные софты.

## Ключевые принципы

1. **WorkSession = таймер проекта** - тикает каждую минуту независимо от софтов
2. **TimeEntry = таймер софта** - тикает каждую секунду для виджета, каждую минуту для статистики
3. **Независимость проектов** - каждый проект имеет свою WorkSession
4. **Восстановление после краша** - проверка PID при запуске приложения
5. **Модульность** - следовать структуре `src/features/time-tracking/`

---

## 1. Структура данных

### 1.1 WorkSession Type

```typescript
// src/features/time-tracking/types/workSession.ts

export interface WorkSession {
  id: string;                    // UUID сессии
  projectId: string;             // К какому проекту относится
  startTime: string;             // ISO timestamp начала сессии
  elapsedMinutes: number;        // Сколько минут прошло (тикает каждую минуту)
  isActive: boolean;             // Активна ли сессия
  softwareSessions: string[];    // ID TimeEntry, которые в этой сессии
  createdAt: string;             // Когда создана
  updatedAt: string;             // Последнее обновление
}
```

### 1.2 TimeEntry Type (изменения)

```typescript
// src/features/time-tracking/types/timeEntry.ts

export interface TimeEntry {
  id: string;
  projectId: string;
  shotId?: string;
  software: SoftwareName;
  startTime: string;             // Когда запущен софт
  endTime?: string;              // Когда закрыт софт

  // Время
  elapsedSeconds: number;        // Для виджета (тикает каждую секунду)
  durationMinutes: number;       // Общее время работы софта (для завершенных)
  softwareMinutes: number;       // Focused time (для статистики)

  // Связи
  workSessionId?: string;        // К какой WorkSession привязан

  // Состояние
  isActive: boolean;
  isManual: boolean;
  pid?: number;                  // PID процесса (для восстановления)

  // UI
  widgetVisible?: boolean;       // Показывать ли виджет
  countedInStats?: boolean;      // Засчитан ли в статистику
}
```

### 1.3 Project Type (изменения)

```typescript
// src/types/project.ts

export interface Project {
  // ... существующие поля ...

  // Удалить:
  // currentProjectTime?: number;  ← УДАЛИТЬ

  // Добавить:
  workSession?: WorkSession | null;  // Активная WorkSession

  // Оставить без изменений:
  totalMinutesSpent?: number;        // Общее время проекта (завершенные сессии)
  timeEntries?: TimeEntry[];         // Все записи времени
}
```

---

## 2. Файловая структура

### Новые файлы:

```
src/features/time-tracking/
├── types/
│   └── workSession.ts                    [NEW] - Тип WorkSession
├── stores/
│   └── workSessionStore.ts               [NEW] - Zustand store для WorkSession
├── services/
│   └── WorkSessionService.ts             [NEW] - Логика работы с WorkSession
└── utils/
    └── workSessionUtils.ts               [NEW] - Утилиты для WorkSession
```

### Файлы для изменения:

```
src/features/time-tracking/
├── types/
│   └── timeEntry.ts                      [MODIFY] - Добавить elapsedSeconds, workSessionId
├── stores/
│   └── timeTrackingStore.ts              [MODIFY] - Интеграция с WorkSession
├── services/
│   ├── SessionService.ts                 [MODIFY] - Проверка PID
│   └── TimerService.ts                   [MODIFY] - Два типа таймеров
└── components/
    └── InlineTimer/InlineTimer.tsx       [MODIFY] - Использовать elapsedSeconds

src/types/
└── project.ts                            [MODIFY] - Добавить workSession, удалить currentProjectTime

src/store/
└── projectStore.ts                       [MODIFY] - Миграция currentProjectTime
```

---

## 3. Детальный план реализации

### Этап 1: Создание типов и базовой инфраструктуры

#### Задача 1.1: Создать тип WorkSession
**Файл:** `src/features/time-tracking/types/workSession.ts`

```typescript
export interface WorkSession {
  id: string;
  projectId: string;
  startTime: string;
  elapsedMinutes: number;
  isActive: boolean;
  softwareSessions: string[];
  createdAt: string;
  updatedAt: string;
}
```

#### Задача 1.2: Обновить тип TimeEntry
**Файл:** `src/features/time-tracking/types/timeEntry.ts`

Добавить:
- `elapsedSeconds: number` - для виджета (тикает каждую секунду)
- `workSessionId?: string` - привязка к WorkSession

#### Задача 1.3: Обновить тип Project
**Файл:** `src/types/project.ts`

Добавить:
- `workSession?: WorkSession | null`

Удалить:
- `currentProjectTime?: number` ← ПОЛНОСТЬЮ УДАЛИТЬ

#### Задача 1.4: Создать утилиты
**Файл:** `src/features/time-tracking/utils/workSessionUtils.ts`

```typescript
import { v4 as uuidv4 } from 'uuid';
import type { WorkSession } from '../types/workSession';

/**
 * Создать новую WorkSession
 */
export const createWorkSession = (projectId: string): WorkSession => {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
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
```

---

### Этап 2: Создание WorkSession Store

#### Задача 2.1: Создать workSessionStore
**Файл:** `src/features/time-tracking/stores/workSessionStore.ts`

```typescript
import { create } from 'zustand';
import type { WorkSession } from '../types/workSession';

interface WorkSessionStore {
  // State: Map<projectId, WorkSession>
  sessions: Map<string, WorkSession>;

  // Получить сессию для проекта
  getSessionForProject: (projectId: string) => WorkSession | undefined;

  // Создать новую сессию
  createSession: (session: WorkSession) => void;

  // Обновить сессию
  updateSession: (session: WorkSession) => void;

  // Остановить сессию
  stopSession: (sessionId: string) => void;

  // Инкремент времени сессии (вызывается таймером каждую минуту)
  incrementMinute: (sessionId: string) => void;

  // Очистить все сессии (для тестирования)
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
    console.log(`[WorkSessionStore] ✅ Created session for project ${session.projectId}`);
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

  incrementMinute: (sessionId: string) => {
    const session = Array.from(get().sessions.values()).find(s => s.id === sessionId);
    if (session && session.isActive) {
      set(state => {
        const sessions = new Map(state.sessions);
        sessions.set(session.projectId, {
          ...session,
          elapsedMinutes: session.elapsedMinutes + 1,
          updatedAt: new Date().toISOString()
        });
        return { sessions };
      });
      console.log(`[WorkSessionStore] ⏱️  Session ${sessionId}: ${session.elapsedMinutes} → ${session.elapsedMinutes + 1}m`);
    }
  },

  clearAll: () => {
    set({ sessions: new Map() });
    console.log('[WorkSessionStore] 🗑️  All sessions cleared');
  }
}));
```

---

### Этап 3: Создание WorkSession Service

#### Задача 3.1: Создать WorkSessionService
**Файл:** `src/features/time-tracking/services/WorkSessionService.ts`

```typescript
import { useWorkSessionStore } from '../stores/workSessionStore';
import { createWorkSession, isWorkSessionEmpty } from '../utils/workSessionUtils';
import type { WorkSession } from '../types/workSession';
import type { TimeEntry } from '../types/timeEntry';

/**
 * Сервис для управления WorkSession
 */
export class WorkSessionService {
  /**
   * Получить или создать WorkSession для проекта
   * @returns Активная WorkSession для проекта
   */
  static getOrCreateForProject(projectId: string): WorkSession {
    const existing = useWorkSessionStore.getState().getSessionForProject(projectId);

    if (existing && existing.isActive) {
      console.log(`[WorkSessionService] 🔄 Reusing existing session for project ${projectId}`);
      return existing;
    }

    const newSession = createWorkSession(projectId);
    useWorkSessionStore.getState().createSession(newSession);
    console.log(`[WorkSessionService] ✨ Created new session for project ${projectId}`);

    return newSession;
  }

  /**
   * Добавить софт в WorkSession
   */
  static addSoftware(session: WorkSession, entryId: string): void {
    if (session.softwareSessions.includes(entryId)) {
      console.log(`[WorkSessionService] ⚠️  Software ${entryId} already in session`);
      return;
    }

    const updated: WorkSession = {
      ...session,
      softwareSessions: [...session.softwareSessions, entryId]
    };

    useWorkSessionStore.getState().updateSession(updated);
    console.log(`[WorkSessionService] ➕ Added software ${entryId} to session (total: ${updated.softwareSessions.length})`);
  }

  /**
   * Удалить софт из WorkSession
   * Если сессия становится пустой - останавливает её
   */
  static async removeSoftware(session: WorkSession, entryId: string): Promise<void> {
    const softwareSessions = session.softwareSessions.filter(id => id !== entryId);

    if (softwareSessions.length === 0) {
      // Последний софт закрылся - останавливаем WorkSession
      console.log(`[WorkSessionService] 🏁 Last software removed, stopping session`);
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
   - Записывает elapsedMinutes в project.totalMinutesSpent
   - Помечает session.isActive = false
   - Удаляет workSession из проекта
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
```

---

### Этап 4: Обновление TimerService

#### Задача 4.1: Добавить таймеры для WorkSession и виджетов
**Файл:** `src/features/time-tracking/services/TimerService.ts`

**Добавить:**

```typescript
// Добавить в класс TimerService:

// Хранилище таймеров WorkSession (тикают каждую минуту)
private static sessionTimers = new Map<string, NodeJS.Timeout>();

// Хранилище таймеров виджетов (тикают каждую секунду)
private static widgetTimers = new Map<string, NodeJS.Timeout>();

/**
 * Запустить таймер для WorkSession (тикает каждую минуту)
 */
static startSessionTimer(session: WorkSession): void {
  // Если уже есть таймер - не создаем дубликат
  if (this.sessionTimers.has(session.id)) {
    console.log(`[TimerService] ⚠️  Session timer already running for ${session.id}`);
    return;
  }

  const timer = setInterval(() => {
    useWorkSessionStore.getState().incrementMinute(session.id);
  }, 60000); // 1 минута

  this.sessionTimers.set(session.id, timer);
  console.log(`[TimerService] ⏱️  Started session timer for ${session.id}`);
}

/**
 * Остановить таймер WorkSession
 */
static stopSessionTimer(sessionId: string): void {
  const timer = this.sessionTimers.get(sessionId);
  if (timer) {
    clearInterval(timer);
    this.sessionTimers.delete(sessionId);
    console.log(`[TimerService] ⏹️  Stopped session timer for ${sessionId}`);
  }
}

/**
 * Запустить таймер виджета (тикает каждую секунду для UI)
 */
static startWidgetTimer(entry: TimeEntry): void {
  // Если уже есть таймер - не создаем дубликат
  if (this.widgetTimers.has(entry.id)) {
    console.log(`[TimerService] ⚠️  Widget timer already running for ${entry.id}`);
    return;
  }

  const timer = setInterval(() => {
    useTimeTrackingStore.getState().incrementSeconds(entry.id);
  }, 1000); // 1 секунда

  this.widgetTimers.set(entry.id, timer);
  console.log(`[TimerService] ⏱️  Started widget timer for ${entry.software}`);
}

/**
 * Остановить таймер виджета
 */
static stopWidgetTimer(entryId: string): void {
  const timer = this.widgetTimers.get(entryId);
  if (timer) {
    clearInterval(timer);
    this.widgetTimers.delete(entryId);
    console.log(`[TimerService] ⏹️  Stopped widget timer for ${entryId}`);
  }
}
```

**Удалить/изменить:**
- Старый код с `start()`, который тикает каждую минуту для TimeEntry
- Заменить на два отдельных таймера (session + widget)

---

### Этап 5: Обновление timeTrackingStore

#### Задача 5.1: Интеграция с WorkSession в startSession()
**Файл:** `src/features/time-tracking/stores/timeTrackingStore.ts`

**Изменить метод `startSession`:**

```typescript
startSession: async (params: StartSessionParams): Promise<string> => {
  const entryId = uuidv4();
  const now = new Date().toISOString();

  // 1. Создать TimeEntry
  const entry: TimeEntry = {
    id: entryId,
    projectId: params.projectId,
    shotId: params.shotId,
    software: params.software as SoftwareName,
    startTime: now,
    elapsedSeconds: 0,        // Для виджета
    durationMinutes: 0,       // Для завершенных
    softwareMinutes: 0,       // Для статистики
    isActive: true,
    isManual: false,
    pid: params.pid,
    widgetVisible: false,
    countedInStats: true
  };

  // 2. Получить или создать WorkSession для проекта
  const session = WorkSessionService.getOrCreateForProject(params.projectId);

  // 3. Привязать entry к WorkSession
  entry.workSessionId = session.id;

  // 4. Добавить entry в WorkSession
  WorkSessionService.addSoftware(session, entry.id);

  // 5. Запустить таймеры
  if (session.softwareSessions.length === 1) {
    // Первый софт в сессии - запускаем session timer
    TimerService.startSessionTimer(session);
  }

  // Запускаем widget timer для этого софта
  TimerService.startWidgetTimer(entry);

  // 6. Регистрируем сессию в backend
  await SessionService.startSession({
    entryId: entry.id,
    projectId: params.projectId,
    projectPath: params.projectPath,
    shotId: params.shotId || null,
    software: params.software,
    pid: params.pid
  });

  // 7. Сохраняем в store
  set(state => ({
    sessions: new Map(state.sessions).set(entryId, entry)
  }));

  // 8. Добавляем в проект
  const { useProjectStore } = await import('../../../store/projectStore');
  const project = useProjectStore.getState().projects.find(p => p.id === params.projectId);
  if (project) {
    const updatedProject = {
      ...project,
      timeEntries: [...(project.timeEntries || []), entry],
      workSession: session, // Сохраняем WorkSession в проект
      updatedAt: now
    };
    await useProjectStore.getState().updateProject(updatedProject);
  }

  console.log(`[TimeTrackingStore] ✅ Started session for ${params.software}`);
  return entryId;
}
```

#### Задача 5.2: Интеграция с WorkSession в stopSession()
**Файл:** `src/features/time-tracking/stores/timeTrackingStore.ts`

**Изменить метод `stopSession`:**

```typescript
stopSession: async (entryId: string): Promise<number> => {
  const entry = get().sessions.get(entryId);
  if (!entry || !entry.isActive) {
    console.warn(`[TimeTrackingStore] Cannot stop - entry not found or inactive: ${entryId}`);
    return 0;
  }

  const now = new Date().toISOString();

  // 1. Остановить widget timer
  TimerService.stopWidgetTimer(entryId);

  // 2. Вычислить финальное время софта
  const finalMinutes = Math.floor(entry.elapsedSeconds / 60);

  // 3. Записать в статистику софта (если был focused)
  if (entry.softwareMinutes > 0) {
    StatsService.addSoftwareTime(entry.software, entry.softwareMinutes);
  }

  // 4. Удалить из WorkSession
  if (entry.workSessionId) {
    const { useWorkSessionStore } = await import('./workSessionStore');
    const session = Array.from(useWorkSessionStore.getState().sessions.values())
      .find(s => s.id === entry.workSessionId);

    if (session) {
      await WorkSessionService.removeSoftware(session, entryId);
    }
  }

  // 5. Остановить backend сессию
  await SessionService.stopSession(entryId);

  // 6. Обновить entry
  const stoppedEntry: TimeEntry = {
    ...entry,
    isActive: false,
    endTime: now,
    durationMinutes: finalMinutes
  };

  set(state => ({
    sessions: new Map(state.sessions).set(entryId, stoppedEntry)
  }));

  // 7. Сохранить в проект
  const { useProjectStore } = await import('../../../store/projectStore');
  const project = useProjectStore.getState().projects.find(p => p.id === entry.projectId);
  if (project) {
    const updatedEntries = (project.timeEntries || []).map(e =>
      e.id === entryId ? stoppedEntry : e
    );

    const updatedProject = {
      ...project,
      timeEntries: updatedEntries,
      updatedAt: now
    };

    await useProjectStore.getState().updateProject(updatedProject);
  }

  console.log(`[TimeTrackingStore] 🛑 Stopped ${entry.software}: ${finalMinutes}m`);
  return finalMinutes;
}
```

#### Задача 5.3: Добавить incrementSeconds() для виджетов
**Файл:** `src/features/time-tracking/stores/timeTrackingStore.ts`

**Добавить новый метод:**

```typescript
/**
 * Инкремент секунд для виджета (вызывается таймером каждую секунду)
 */
incrementSeconds: (entryId: string) => {
  set(state => {
    const sessions = new Map(state.sessions);
    const entry = sessions.get(entryId);

    if (entry && entry.isActive) {
      sessions.set(entryId, {
        ...entry,
        elapsedSeconds: entry.elapsedSeconds + 1
      });
    }

    return { sessions };
  });
}
```

#### Задача 5.4: Удалить старую логику
**Файл:** `src/features/time-tracking/stores/timeTrackingStore.ts`

**Удалить:**
- Метод `incrementSessionTime()` - больше не нужен (используем incrementSeconds + WorkSession)
- Всю логику поиска "earliest session"
- Логику с `currentProjectTime` в project

---

### Этап 6: Обновление UI компонентов

#### Задача 6.1: Использовать elapsedSeconds в InlineTimer
**Файл:** `src/features/time-tracking/components/InlineTimer/InlineTimer.tsx`

**Было:**
```typescript
const totalSeconds = useMemo(() => {
  const elapsed = Math.floor((Date.now() - new Date(activeEntry.startTime).getTime()) / 1000);
  const totalMinutes = activeEntry.durationMinutes || 0;
  return (totalMinutes * 60) + elapsed;
}, [activeEntry.startTime, activeEntry.durationMinutes, timerSeconds]);
```

**Стало:**
```typescript
const totalSeconds = useMemo(() => {
  return activeEntry.elapsedSeconds || 0;
}, [activeEntry.elapsedSeconds]);
```

#### Задача 6.2: Обновить TimeInfoBar
**Файл:** `src/features/time-tracking/components/TimeInfoBar/TimeInfoBar.tsx`

**Было:**
```typescript
const completedMinutes = project.totalMinutesSpent || 0;
const currentProjectMinutes = project.currentProjectTime || 0;
const totalMinutes = completedMinutes + currentProjectMinutes;
```

**Стало:**
```typescript
const completedMinutes = project.totalMinutesSpent || 0;
const currentSessionMinutes = project.workSession?.elapsedMinutes || 0;
const totalMinutes = completedMinutes + currentSessionMinutes;
```

---

### Этап 7: Миграция данных

#### Задача 7.1: Миграция currentProjectTime
**Файл:** `src/store/projectStore.ts`

**Добавить в loadProjects():**

```typescript
loadProjects: async () => {
  // ... существующий код загрузки ...

  const projects = await invoke<Project[]>('get_all_projects');

  // Миграция: обнулить currentProjectTime
  const migratedProjects = projects.map(project => {
    if (project.currentProjectTime && project.currentProjectTime > 0) {
      console.log(`[Migration] Clearing currentProjectTime for ${project.name}: ${project.currentProjectTime}m`);
      return {
        ...project,
        currentProjectTime: undefined, // Обнуляем
        workSession: null              // Нет активной сессии
      };
    }
    return project;
  });

  set({ projects: migratedProjects });

  // Восстановить WorkSession из проектов
  for (const project of migratedProjects) {
    if (project.workSession) {
      await WorkSessionService.restoreFromProject(project);
    }
  }
}
```

#### Задача 7.2: Восстановление WorkSession при запуске
**Файл:** `src/store/projectStore.ts`

**В методе loadProjects() после загрузки:**

```typescript
// Восстановить активные WorkSession
console.log('[ProjectStore] Restoring WorkSessions...');
for (const project of projects) {
  if (project.workSession && project.workSession.isActive) {
    await WorkSessionService.restoreFromProject(project);
  }
}
```

---

## 4. Сценарии работы (с новой логикой)

### Сценарий 1: Один проект, один софт

```
10:00:00 - Открыл PS в Project A
  ✅ Создана WorkSession A (elapsedMinutes=0)
  ✅ Создан TimeEntry PS (elapsedSeconds=0)
  ✅ PS добавлен в WorkSession.softwareSessions
  ✅ Запущен session timer (тикает каждую минуту)
  ✅ Запущен widget timer (тикает каждую секунду)

10:01:00 - Прошла минута
  ✅ WorkSession A: elapsedMinutes=1
  ✅ TimeEntry PS: elapsedSeconds=60
  ✅ Виджет показывает: 1:00

10:02:30 - Закрыл PS
  ✅ TimeEntry PS: durationMinutes=2 (150 секунд / 60)
  ✅ PS удален из WorkSession.softwareSessions
  ✅ WorkSession пуста → остановлена
  ✅ Project.totalMinutesSpent += 2
  ✅ Project.workSession = null
```

### Сценарий 2: Один проект, два софта

```
10:00:00 - Открыл PS в Project A
  ✅ Создана WorkSession A (elapsedMinutes=0)
  ✅ PS добавлен в WorkSession
  ✅ Таймеры запущены

10:00:30 - Открыл AE в Project A
  ✅ WorkSession A уже существует (используем её)
  ✅ AE добавлен в WorkSession.softwareSessions
  ✅ Запущен widget timer для AE
  ✅ Session timer продолжает работать

10:01:00 - Прошла минута
  ✅ WorkSession A: elapsedMinutes=1
  ✅ TimeEntry PS: elapsedSeconds=60 → виджет: 1:00
  ✅ TimeEntry AE: elapsedSeconds=30 → виджет: 0:30

10:01:30 - Закрыл PS
  ✅ PS удален из WorkSession
  ✅ WorkSession НЕ пуста (AE еще активен)
  ✅ Session timer продолжает работать

10:02:00 - Прошла минута
  ✅ WorkSession A: elapsedMinutes=2
  ✅ TimeEntry AE: elapsedSeconds=90 → виджет: 1:30

10:02:30 - Закрыл AE (последний)
  ✅ AE удален из WorkSession
  ✅ WorkSession пуста → остановлена
  ✅ Project.totalMinutesSpent += 2 (от WorkSession)
  ✅ Project.workSession = null
```

### Сценарий 3: Два проекта одновременно

```
10:00:00 - Открыл PS в Project A
  ✅ Создана WorkSession A
  ✅ PS добавлен в WorkSession A

10:00:30 - Открыл Blender в Project B
  ✅ Создана WorkSession B (НЕЗАВИСИМАЯ!)
  ✅ Blender добавлен в WorkSession B
  ✅ Два session timer работают параллельно

10:01:00 - Прошла минута
  ✅ WorkSession A: elapsedMinutes=1
  ✅ WorkSession B: elapsedMinutes=1
```

### Сценарий 4: Восстановление после краша

```
BEFORE CRASH:
  WorkSession A активна (elapsedMinutes=5)
  - PS (PID 1234)
  - AE (PID 5678)

CRASH → Приложение закрылось

AFTER RESTART:
  ✅ Читаем project.workSession
  ✅ Проверяем PID 1234 → мертв
  ✅ Проверяем PID 5678 → жив
  ✅ Убираем PS из WorkSession
  ✅ PS.durationMinutes записываем в статистику
  ✅ Продолжаем WorkSession с AE
  ✅ Запускаем session timer
  ✅ WorkSession.elapsedMinutes=5 (продолжаем с того же времени)
```

---

## 5. Контрольный список (Checklist)

### Типы и интерфейсы
- [ ] Создать `src/features/time-tracking/types/workSession.ts`
- [ ] Обновить `src/features/time-tracking/types/timeEntry.ts` (добавить elapsedSeconds, workSessionId)
- [ ] Обновить `src/types/project.ts` (добавить workSession, удалить currentProjectTime)

### Утилиты
- [ ] Создать `src/features/time-tracking/utils/workSessionUtils.ts`
  - [ ] createWorkSession()
  - [ ] isWorkSessionEmpty()

### Stores
- [ ] Создать `src/features/time-tracking/stores/workSessionStore.ts`
  - [ ] getSessionForProject()
  - [ ] createSession()
  - [ ] updateSession()
  - [ ] stopSession()
  - [ ] incrementMinute()
  - [ ] clearAll()

### Services
- [ ] Создать `src/features/time-tracking/services/WorkSessionService.ts`
  - [ ] getOrCreateForProject()
  - [ ] addSoftware()
  - [ ] removeSoftware()
  - [ ] stopSession()
  - [ ] restoreFromProject()

- [ ] Обновить `src/features/time-tracking/services/TimerService.ts`
  - [ ] startSessionTimer()
  - [ ] stopSessionTimer()
  - [ ] startWidgetTimer()
  - [ ] stopWidgetTimer()
  - [ ] Удалить старый код с start() для TimeEntry

### TimeTracking Store
- [ ] Обновить `src/features/time-tracking/stores/timeTrackingStore.ts`
  - [ ] Изменить startSession() - интеграция с WorkSession
  - [ ] Изменить stopSession() - интеграция с WorkSession
  - [ ] Добавить incrementSeconds()
  - [ ] Удалить incrementSessionTime()
  - [ ] Удалить логику поиска earliest session
  - [ ] Удалить логику с currentProjectTime

### UI Components
- [ ] Обновить `src/features/time-tracking/components/InlineTimer/InlineTimer.tsx`
  - [ ] Использовать activeEntry.elapsedSeconds вместо расчета

- [ ] Обновить `src/features/time-tracking/components/TimeInfoBar/TimeInfoBar.tsx`
  - [ ] Использовать project.workSession?.elapsedMinutes вместо currentProjectTime

### Project Store
- [ ] Обновить `src/store/projectStore.ts`
  - [ ] Миграция currentProjectTime в loadProjects()
  - [ ] Восстановление WorkSession в loadProjects()

### Тестирование
- [ ] Сценарий 1: Один софт
- [ ] Сценарий 2: Два софта последовательно
- [ ] Сценарий 3: Два софта одновременно
- [ ] Сценарий 4: Два проекта одновременно
- [ ] Сценарий 5: Закрытие первого софта (второй продолжает)
- [ ] Сценарий 6: Восстановление после краша (все процессы мертвы)
- [ ] Сценарий 7: Восстановление после краша (один процесс жив)
- [ ] Сценарий 8: Миграция старых проектов с currentProjectTime

---

## 6. Важные заметки

### Что удаляется:
- ❌ `Project.currentProjectTime` - полностью удаляется из типа
- ❌ `timeTrackingStore.incrementSessionTime()` - больше не нужен
- ❌ Логика поиска "earliest session" - заменена на WorkSession
- ❌ Расчет времени от `Date.now()` - заменен на инкремент

### Что добавляется:
- ✅ `WorkSession` - явная структура для "рабочей сессии"
- ✅ `TimeEntry.elapsedSeconds` - для виджета (тикает каждую секунду)
- ✅ `TimeEntry.workSessionId` - привязка к WorkSession
- ✅ `Project.workSession` - активная WorkSession проекта
- ✅ Два типа таймеров: session (1 минута) + widget (1 секунда)

### Ключевые принципы:
1. **WorkSession тикает независимо** - не зависит от софтов
2. **Виджет показывает время софта** - не время проекта
3. **Один проект = одна WorkSession** - независимость проектов
4. **PID для восстановления** - проверка при старте приложения
5. **Модульность** - каждый компонент отвечает за свою задачу

---

## 7. Порядок реализации

### Фаза 1: Подготовка (создание файлов)
1. Создать типы (workSession.ts, обновить timeEntry.ts, project.ts)
2. Создать утилиты (workSessionUtils.ts)
3. Создать workSessionStore.ts
4. Создать WorkSessionService.ts

### Фаза 2: Интеграция (обновление существующих)
5. Обновить TimerService (добавить session/widget timers)
6. Обновить timeTrackingStore (startSession, stopSession, incrementSeconds)
7. Удалить старую логику (incrementSessionTime, earliest session)

### Фаза 3: UI (обновление компонентов)
8. Обновить InlineTimer (использовать elapsedSeconds)
9. Обновить TimeInfoBar (использовать workSession.elapsedMinutes)

### Фаза 4: Миграция (данные)
10. Добавить миграцию в projectStore
11. Добавить восстановление WorkSession

### Фаза 5: Тестирование
12. Протестировать все сценарии
13. Проверить восстановление после краша
14. Проверить миграцию старых проектов

---

## 8. Риски и митигация

### Риск 1: Потеря данных при миграции
**Митигация:**
- Создать backup проектов перед запуском
- Логировать все действия миграции
- Обнуление currentProjectTime безопасно (данные не критичны)

### Риск 2: Дублирование таймеров
**Митигация:**
- Проверка существующих таймеров перед созданием
- Очистка таймеров при остановке
- Логирование всех операций с таймерами

### Риск 3: Рассинхронизация WorkSession и TimeEntry
**Митигация:**
- Всегда обновлять через WorkSessionService
- Привязка через workSessionId
- Восстановление синхронизации при старте

### Риск 4: PID конфликты при восстановлении
**Митигация:**
- Проверка каждого PID отдельно
- Graceful handling мертвых процессов
- Логирование всех проверок PID

---

## 9. Метрики успеха

После завершения рефакторинга должны работать:

✅ **Функциональность:**
- [ ] Виджеты показывают правильное время софта (секунды)
- [ ] TimeInfoBar показывает правильное время проекта
- [ ] Несколько софтов не дублируют время проекта
- [ ] Два проекта работают независимо
- [ ] Восстановление после краша работает корректно

✅ **Качество кода:**
- [ ] Нет логики поиска "earliest session"
- [ ] Нет расчетов от Date.now() для времени
- [ ] Модульная структура (Store → Service → Component)
- [ ] Понятные названия и комментарии
- [ ] Логирование всех операций

✅ **Производительность:**
- [ ] Нет лишних пересчетов времени
- [ ] Таймеры работают эффективно
- [ ] Нет утечек памяти (таймеры останавливаются)

---

## 10. Следующие шаги после рефакторинга

После успешного завершения рефакторинга можно добавить:

1. **Пауза WorkSession** - возможность приостановить рабочую сессию
2. **История WorkSession** - сохранять завершенные сессии для аналитики
3. **UI для WorkSession** - индикатор активной сессии
4. **Notifications** - уведомления о длительных сессиях
5. **Breaks tracking** - отслеживание перерывов между сессиями

---

**ПЛАН ГОТОВ К РЕАЛИЗАЦИИ**
