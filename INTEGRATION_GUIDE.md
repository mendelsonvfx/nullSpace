# Time Tracking Integration Guide

Этот документ описывает, как интегрировать новые компоненты тайм-трекинга в существующее приложение.

## Обзор новых компонентов

### 1. TimeAnalytics
Компонент для отображения аналитики времени на странице Finance.

**Местоположение:** `src/components/time/TimeAnalytics.tsx`

**Использование:**
```tsx
import { TimeAnalytics } from '../time';

<TimeAnalytics projects={projects} />
```

### 2. ManualTimeEntryModal
Модальное окно для ручного добавления записей о времени.

**Местоположение:** `src/components/time/ManualTimeEntryModal.tsx`

**Использование:**
```tsx
import { ManualTimeEntryModal } from '../time';
import { useProjectStore } from '../../store/projectStore';

const [showManualTimeModal, setShowManualTimeModal] = useState(false);
const { addManualTimeEntry } = useProjectStore();

<ManualTimeEntryModal
  isOpen={showManualTimeModal}
  onClose={() => setShowManualTimeModal(false)}
  project={project}
  onAddEntry={(software, minutes, date, shotId, notes) => {
    addManualTimeEntry(project.id, software, minutes, date, shotId, notes);
  }}
/>
```

### 3. BreakReminderNotification
Компонент для напоминаний о перерывах.

**Местоположение:** `src/components/time/BreakReminderNotification.tsx`

**Использование:**
```tsx
import { BreakReminderContainer } from '../time';
import type { BreakReminder } from '../time';

const [breakReminders, setBreakReminders] = useState<BreakReminder[]>([]);

<BreakReminderContainer
  reminders={breakReminders}
  onTakeBreak={handleTakeBreak}
  onDismiss={(id) => setBreakReminders(prev => prev.filter(r => r.id !== id))}
/>
```

### 4. ExportButton
Кнопка для экспорта отчетов о времени в CSV/JSON/Markdown.

**Местоположение:** `src/components/time/ExportButton.tsx`

**Использование:**
```tsx
import { ExportButton } from '../time';

<ExportButton project={project} client={client} />
```

---

## Интеграция в FinancePage

### Шаг 1: Добавить TimeAnalytics в конец страницы

**Файл:** `src/components/finance/FinancePage.tsx`

```tsx
import { TimeAnalytics } from '../time';

// В конце компонента, перед закрывающим тегом </div>
export const FinancePage = ({ projects, selectedProjectId, onClose }: FinancePageProps) => {
  // ... existing code ...

  return (
    <div className="flex-1 overflow-y-auto p-8">
      {/* ... existing content ... */}

      {/* Time Analytics Section */}
      {!selectedProject && (
        <TimeAnalytics projects={projects} />
      )}
    </div>
  );
};
```

---

## Интеграция в ProjectDetails

### Шаг 1: Добавить кнопку "Add Time Manually"

**Файл:** `src/components/project/ProjectDetails.tsx`

```tsx
import { ManualTimeEntryModal } from '../time';
import { Clock } from 'lucide-react';
import { useState } from 'react';

export const ProjectDetails = ({ project }: ProjectDetailsProps) => {
  const [showManualTimeModal, setShowManualTimeModal] = useState(false);
  const { addManualTimeEntry } = useProjectStore();

  return (
    <div>
      {/* Existing content */}

      {/* Quick Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowManualTimeModal(true)}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Clock className="w-4 h-4" />
          Add Time Manually
        </button>
      </div>

      {/* Manual Time Entry Modal */}
      <ManualTimeEntryModal
        isOpen={showManualTimeModal}
        onClose={() => setShowManualTimeModal(false)}
        project={project}
        onAddEntry={(software, minutes, date, shotId, notes) => {
          addManualTimeEntry(project.id, software, minutes, date, shotId, notes);
        }}
      />
    </div>
  );
};
```

---

## Интеграция Break Reminders в App.tsx

### Шаг 1: Добавить логику проверки активных сессий

**Файл:** `src/App.tsx`

```tsx
import { BreakReminderContainer } from './components/time';
import type { BreakReminder } from './components/time';
import { invoke } from '@tauri-apps/api/tauri';

export const App = () => {
  const [breakReminders, setBreakReminders] = useState<BreakReminder[]>([]);
  const [shownReminders, setShownReminders] = useState<Set<string>>(new Set());
  const { pauseTimeTracking, resumeTimeTracking, projects } = useProjectStore();

  // Check for break reminders every minute
  useEffect(() => {
    const checkBreakReminders = async () => {
      try {
        const sessions = await invoke<any[]>('get_active_sessions');

        sessions.forEach(session => {
          const minutesWorked = session.accumulated_minutes;

          // Trigger at 2h, 4h, 6h
          const thresholds = [
            { minutes: 120, breakDuration: 5 },
            { minutes: 240, breakDuration: 15 },
            { minutes: 360, breakDuration: 30 }
          ];

          thresholds.forEach(({ minutes, breakDuration }) => {
            const reminderKey = `${session.entry_id}-${minutes}`;

            // Only trigger once per threshold
            if (minutesWorked >= minutes && !shownReminders.has(reminderKey)) {
              // Find project name
              const project = projects.find(p => p.id === session.project_id);
              const projectName = project?.name || 'Unknown Project';

              setBreakReminders(prev => [...prev, {
                id: crypto.randomUUID(),
                sessionId: session.entry_id,
                projectName,
                duration: minutesWorked,
                breakDuration,
                type: 'break'
              }]);

              setShownReminders(prev => new Set(prev).add(reminderKey));
            }
          });
        });
      } catch (error) {
        console.error('Failed to check break reminders:', error);
      }
    };

    // Check immediately and then every minute
    checkBreakReminders();
    const interval = setInterval(checkBreakReminders, 60000);

    return () => clearInterval(interval);
  }, [projects, shownReminders]);

  const handleTakeBreak = async (sessionId: string, breakMinutes: number) => {
    const project = projects.find(p =>
      p.timeEntries?.some(e => e.id === sessionId && e.isActive)
    );

    if (!project) return;

    // Pause tracking
    await pauseTimeTracking(project.id, sessionId);

    // Auto-resume after break
    setTimeout(async () => {
      await resumeTimeTracking(project.id, sessionId);

      // Show "Break over" notification
      setBreakReminders(prev => [...prev, {
        id: crypto.randomUUID(),
        sessionId,
        projectName: project.name,
        duration: 0,
        breakDuration: 0,
        type: 'break-over',
        message: 'Break over! Back to work.'
      }]);
    }, breakMinutes * 60 * 1000);
  };

  return (
    <div>
      {/* Existing app content */}

      {/* Break Reminders */}
      <BreakReminderContainer
        reminders={breakReminders}
        onTakeBreak={handleTakeBreak}
        onDismiss={(id) => setBreakReminders(prev => prev.filter(r => r.id !== id))}
      />
    </div>
  );
};
```

---

## Интеграция ExportButton в FinanceProjectDetails

### Шаг 1: Добавить кнопку экспорта

**Файл:** `src/components/finance/FinanceProjectDetails.tsx`

```tsx
import { ExportButton } from '../time';

export const FinanceProjectDetails = ({ project, client }: FinanceProjectDetailsProps) => {
  return (
    <div>
      {/* Existing content */}

      {/* Export Section */}
      <div className="mt-6">
        <ExportButton project={project} client={client} />
      </div>
    </div>
  );
};
```

---

## Настройка Break Reminders в Settings

### Добавить настройки в SettingsPanel

```tsx
// src/components/settings/SettingsPanel.tsx

const [breakRemindersEnabled, setBreakRemindersEnabled] = useState(() => {
  const saved = localStorage.getItem('breakRemindersEnabled');
  return saved ? JSON.parse(saved) : true;
});

const [breakIntervals, setBreakIntervals] = useState<number[]>(() => {
  const saved = localStorage.getItem('breakIntervals');
  return saved ? JSON.parse(saved) : [120, 240, 360]; // 2h, 4h, 6h
});

const handleToggleBreakReminders = (enabled: boolean) => {
  setBreakRemindersEnabled(enabled);
  localStorage.setItem('breakRemindersEnabled', JSON.stringify(enabled));
};

const handleUpdateBreakInterval = (index: number, value: number) => {
  const newIntervals = [...breakIntervals];
  newIntervals[index] = value;
  setBreakIntervals(newIntervals);
  localStorage.setItem('breakIntervals', JSON.stringify(newIntervals));
};

// In the settings UI
<div className="mb-6">
  <h3 className="text-lg font-semibold mb-3">Break Reminders</h3>

  <label className="flex items-center gap-2 mb-3">
    <input
      type="checkbox"
      checked={breakRemindersEnabled}
      onChange={(e) => handleToggleBreakReminders(e.target.checked)}
      className="w-4 h-4"
    />
    <span>Enable break reminders</span>
  </label>

  {breakRemindersEnabled && (
    <div className="pl-6">
      <label className="text-sm text-zinc-400 mb-2 block">Remind after:</label>
      <div className="flex gap-2">
        <input
          type="number"
          value={breakIntervals[0]}
          onChange={(e) => handleUpdateBreakInterval(0, parseInt(e.target.value))}
          className="w-20 bg-zinc-800 rounded px-2 py-1"
        />
        <span>min</span>
        <input
          type="number"
          value={breakIntervals[1]}
          onChange={(e) => handleUpdateBreakInterval(1, parseInt(e.target.value))}
          className="w-20 bg-zinc-800 rounded px-2 py-1"
        />
        <span>min</span>
        <input
          type="number"
          value={breakIntervals[2]}
          onChange={(e) => handleUpdateBreakInterval(2, parseInt(e.target.value))}
          className="w-20 bg-zinc-800 rounded px-2 py-1"
        />
        <span>min</span>
      </div>
    </div>
  )}
</div>
```

---

## Использование утилит

```tsx
import {
  formatTime,
  formatTimeDetailed,
  groupTimeEntriesBySoftware,
  groupTimeEntriesByWeek,
  calculateHourlyRate,
  formatSoftwareName,
  getSoftwareColor
} from '../utils/timeTracking';

// Format time
const formattedTime = formatTime(125); // "2h 5m"

// Group by software
const timeBySoftware = groupTimeEntriesBySoftware(project.timeEntries || []);

// Calculate hourly rate
const rate = calculateHourlyRate(project.cost || 0, project.totalMinutesSpent || 0);

// Get software color for charts
const color = getSoftwareColor('blender'); // "#E87D0D"
```

---

## Важные замечания

### 1. Переменные accumulated_minutes vs software_minutes

В Rust backend существуют две переменные для учета времени:

- **`accumulated_minutes`** - время, засчитываемое для ПРОЕКТА (только самая ранняя сессия)
- **`software_minutes`** - время, засчитываемое для СТАТИСТИКИ СОФТА (все активные окна)

**Использование в аналитике:**
```tsx
// Для проектной аналитики используйте timeEntry.durationMinutes
// Это соответствует accumulated_minutes из backend

const totalProjectTime = project.timeEntries
  ?.filter(e => !e.isActive)
  .reduce((sum, e) => sum + e.durationMinutes, 0) || 0;

// Для статистики софта также используйте durationMinutes,
// так как software_minutes автоматически учитывается при сохранении entry
```

### 2. Учет только фокусированного времени

Система учитывает:
- **Фокусированное время**: когда окно софта активно
- **CPU активность**: когда процесс активен (> 0.5% CPU)

Это означает:
- Рендеринг в фоне = ✅ учитывается (CPU активность)
- Окно свернуто, процесс спит = ❌ не учитывается
- Работа в другом приложении = ❌ не учитывается

### 3. Множественные сессии одного проекта

Если запущено несколько программ для одного проекта:
- **Только самая ранняя сессия** засчитывается для `accumulated_minutes` (время проекта)
- **Все активные сессии** засчитываются для `software_minutes` (статистика софта)

Пример:
```
10:00 - Запущен Blender → accumulated_minutes++, software_minutes++
10:30 - Запущен Houdini → accumulated_minutes (только Blender), software_minutes++ (оба)
```

---

## Тестирование

### 1. Проверка TimeAnalytics
1. Запустите несколько проектов с разным софтом
2. Поработайте некоторое время
3. Откройте Finance → прокрутите вниз → должна появиться секция Time Analytics
4. Проверьте графики и статистику

### 2. Проверка Manual Entry
1. Откройте проект
2. Нажмите "Add Time Manually"
3. Заполните форму
4. Проверьте, что запись добавилась в TimeInfoBar

### 3. Проверка Break Reminders
1. Запустите софт
2. Подождите 2 часа (или измените thresholds в коде на меньшие значения для теста)
3. Должно появиться уведомление о перерыве
4. Нажмите "Take break" → трекинг приостановится
5. После окончания перерыва появится уведомление "Break over"

### 4. Проверка Export
1. Откройте проект с записями времени
2. Нажмите "Export Time Report"
3. Выберите формат (CSV/JSON/Markdown)
4. Проверьте скачанный файл

---

## Поддержка

Если возникнут проблемы или вопросы, обратитесь к:
- [TIME_TRACKING_ROADMAP.md](TIME_TRACKING_ROADMAP.md) - детальный roadmap
- [src/utils/timeTracking.ts](src/utils/timeTracking.ts) - утилиты для работы с временем
- [src-tauri/src/time_tracking.rs](src-tauri/src/time_tracking.rs) - backend логика
