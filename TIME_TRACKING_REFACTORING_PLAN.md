# 🔄 TIME TRACKING REFACTORING PLAN

## 📋 OVERVIEW

**Цель:** Выделить систему тайм-трекинга в отдельный модульный feature, аналогично Finance

**Текущее состояние:** Монолитная архитектура (~2210 строк в 4 файлах)
**Целевое состояние:** Модульная архитектура (~1800 строк в 25 файлах)

**Преимущества:**
- ✅ Переиспользуемость кода
- ✅ Тестируемость
- ✅ Слабая связанность
- ✅ Разделение ответственности
- ✅ Легкость поддержки

---

## 🏗️ ЦЕЛЕВАЯ СТРУКТУРА

```
src/features/time-tracking/
├── stores/
│   ├── timeTrackingStore.ts      # Управление сессиями (~200 строк)
│   ├── timeStatsStore.ts         # Глобальная статистика (уже есть, 70 строк)
│   └── index.ts
│
├── services/
│   ├── SessionService.ts         # Backend API для сессий (~100 строк)
│   ├── TimerService.ts           # Управление таймерами (~80 строк)
│   ├── StatsService.ts           # Синхронизация статистики (~50 строк)
│   └── index.ts
│
├── hooks/
│   ├── useTimeTracking.ts        # Главный хук тайм-трекинга (~60 строк)
│   ├── useActiveSession.ts       # Хук активной сессии (~40 строк)
│   ├── useTimerSeconds.ts        # Хук секунд таймера (~20 строк)
│   └── index.ts
│
├── components/
│   ├── ActiveTimer/
│   │   ├── ActiveTimer.tsx
│   │   ├── TimerControls.tsx
│   │   └── index.ts
│   ├── InlineTimer/
│   │   ├── InlineTimer.tsx
│   │   └── index.ts
│   ├── TimeAnalytics/
│   │   ├── TimeAnalytics.tsx
│   │   ├── StatsCards.tsx
│   │   ├── SoftwareBreakdown.tsx
│   │   ├── WeeklyTimeline.tsx
│   │   ├── StatsGrid.tsx
│   │   └── index.ts
│   ├── ManualTimeEntry/
│   │   ├── ManualTimeEntryModal.tsx
│   │   ├── TimeEntryForm.tsx
│   │   ├── TimeEntryHistory.tsx
│   │   └── index.ts
│   └── TimeInfoBar/
│       ├── TimeInfoBar.tsx
│       └── index.ts
│
├── utils/
│   ├── timeFormatters.ts         # formatTime, formatTimeDetailed, parseTimeInput
│   ├── timeCalculations.ts       # группировки, расчеты ставок
│   ├── weekUtils.ts              # работа с неделями
│   ├── softwareUtils.ts          # normalize, colors, formatSoftwareName
│   └── index.ts
│
├── types/
│   ├── timeEntry.ts              # TimeEntry interface
│   ├── session.ts                # ActiveSession, SessionParams
│   ├── stats.ts                  # Statistics types
│   └── index.ts
│
└── index.ts                      # Публичный API модуля
```

---

## 📝 ЗАДАЧИ ПО ФАЗАМ

### ✅ ФАЗА 0: ПОДГОТОВКА
- [x] Провести полный анализ текущей системы
- [x] Создать детальный план рефакторинга
- [x] Создать структуру папок

### ✅ ФАЗА 1: TYPES & UTILS (без breaking changes)

**1.1 Создать типы**
- [x] `types/timeEntry.ts` - TimeEntry interface
- [x] `types/session.ts` - ActiveSession, SessionParams
- [x] `types/stats.ts` - Statistics types
- [x] `types/index.ts` - экспорты

**1.2 Разбить utils**
- [x] `utils/timeFormatters.ts` - форматирование времени (из timeTracking.ts)
- [x] `utils/weekUtils.ts` - работа с неделями (из timeTracking.ts)
- [x] `utils/timeCalculations.ts` - расчеты (из timeTracking.ts)
- [x] `utils/softwareUtils.ts` - работа с ПО (из timeTracking.ts)
- [x] `utils/index.ts` - экспорты

### ✅ ФАЗА 2: SERVICES (слой абстракции)

**2.1 SessionService**
- [x] Создать `services/SessionService.ts`
- [x] Метод `start()` - запуск сессии в backend
- [x] Метод `stop()` - остановка сессии
- [x] Метод `pause()` - пауза
- [x] Метод `resume()` - возобновление
- [x] Метод `getActiveSessions()` - получить активные
- [x] Метод `isSessionFocused()` - проверка фокуса
- [x] Метод `incrementSoftwareStats()` - инкремент статистики

**2.2 TimerService**
- [x] Создать `services/TimerService.ts`
- [x] Метод `start()` - запуск таймера с callback
- [x] Метод `stop()` - остановка таймера
- [x] Метод `getSeconds()` - получить секунды
- [x] Метод `isRunning()` - проверка работы
- [x] Метод `stopAll()` - остановить все

**2.3 StatsService**
- [x] Создать `services/StatsService.ts`
- [x] Метод `syncFromTimeEntries()` - синхронизация из записей
- [x] Метод `addSoftwareTime()` - добавить время к ПО
- [x] Метод `clearStats()` - очистить статистику
- [x] Метод `getSoftwareBreakdown()` - получить разбивку по ПО
- [x] `services/index.ts` - экспорты

### ✅ ФАЗА 3: STORES (state management)

**3.1 timeTrackingStore**
- [x] Создать `stores/timeTrackingStore.ts`
- [x] State: `sessions: Map<string, TimeEntry>`
- [x] Action: `startSession()` - начать сессию
- [x] Action: `stopSession()` - остановить сессию
- [x] ~~Action: `pauseSession()` - пауза~~ (УДАЛЕНО)
- [x] ~~Action: `resumeSession()` - возобновить~~ (УДАЛЕНО)
- [x] Action: `incrementSessionTime()` - инкремент минут
- [x] Action: `getSession()` - получить сессию
- [x] Action: `getAllSessions()` - все сессии
- [x] Интеграция с TimerService
- [x] Интеграция с SessionService

**3.2 Перенос timeStatsStore**
- [x] Переместить `src/store/timeStatsStore.ts` → `features/time-tracking/stores/`
- [x] Обновить импорты
- [x] `stores/index.ts` - экспорты

### ✅ ФАЗА 4: HOOKS (React integration)

**4.1 useTimeTracking**
- [x] Создать `hooks/useTimeTracking.ts`
- [x] Интеграция с timeTrackingStore
- [x] Методы: `start()`, `stop()`
- [x] Возвращать `activeSession` для projectId

**4.2 useTimerSeconds**
- [x] Создать `hooks/useTimerSeconds.ts`
- [x] Интеграция с TimerService.getSeconds()
- [x] Обновление каждую секунду

**4.3 Экспорты**
- [x] `hooks/index.ts` - экспорты всех хуков

### ✅ ФАЗА 5: COMPONENTS (UI refactoring)

**5.1 InlineTimer**
- [x] Переместить `src/components/time/InlineTimer.tsx` → `features/time-tracking/components/InlineTimer/`
- [x] Использовать `useTimerSeconds()` hook
- [x] Удалить импорт globalTimer
- [x] Создать `index.ts`

**5.2 TimeInfoBar**
- [x] Переместить `src/components/time/TimeInfoBar.tsx` → `features/time-tracking/components/TimeInfoBar/`
- [x] Обновить импорты
- [x] Использовать новые utils
- [x] Создать `index.ts`

**5.3 TimeAnalytics - РАЗБИТЬ НА ПОДКОМПОНЕНТЫ**
- [x] Создать `components/TimeAnalytics/TimeAnalytics.tsx` - главный компонент
- [x] Создать `StatsCards.tsx` - карточки Total Time, Hourly Rate
- [x] Создать `SoftwareBreakdown.tsx` - график по софту
- [x] Создать `WeeklyTimeline.tsx` - недельный график (12 недель)
- [x] Создать `StatsGrid.tsx` - This Week, Avg/Day, Most Productive
- [x] Использовать новые utils
- [x] Создать `index.ts`

**5.4 ManualTimeEntry**
- [x] Переместить `src/components/time/ManualTimeEntryModal.tsx` → `features/time-tracking/components/ManualTimeEntry/`
- [x] Разбить на `ManualTimeEntryModal.tsx` + `TimeEntryForm.tsx` + `TimeEntryHistory.tsx`
- [x] Использовать новые utils
- [x] Создать `index.ts`

### ✅ ФАЗА 6: PUBLIC API

**6.1 Создать публичный API модуля**
- [x] Создать `src/features/time-tracking/index.ts`
- [x] Экспорт stores
- [x] Экспорт hooks
- [x] Экспорт components
- [x] Экспорт services (для продвинутого использования)
- [x] Экспорт utils
- [x] Экспорт types

### ✅ ФАЗА 7: МИГРАЦИЯ PROJECTSTORE

**7.1 Обновить projectStore**
- [x] УДАЛИТЬ `startTimeTracking()` - переехало в timeTrackingStore
- [x] УДАЛИТЬ `stopTimeTracking()` - переехало в timeTrackingStore
- [x] УДАЛИТЬ `pauseTimeTracking()` - УДАЛЕНО (функция не используется)
- [x] УДАЛИТЬ `resumeTimeTracking()` - УДАЛЕНО (функция не используется)
- [x] УДАЛИТЬ `incrementEntryTime()` - переехало в timeTrackingStore
- [x] УДАЛИТЬ `incrementProjectTime()` - переехало в timeTrackingStore
- [x] УДАЛИТЬ `incrementBothTimes()` - переехало в timeTrackingStore
- [x] УДАЛИТЬ `clearAllTimeData()` - переехало в StatsService
- [x] УДАЛИТЬ `syncGlobalStatistics()` - переехало в StatsService
- [x] ОСТАВИТЬ `timeEntries[]` в Project - это данные проекта
- [x] ОСТАВИТЬ `addManualTimeEntry()` - добавление к проекту
- [x] ОСТАВИТЬ `removeTimeEntry()` - удаление из проекта + вызов StatsService
- [x] ОСТАВИТЬ `getActiveTimeEntry()` - получение активной записи

**7.2 Интеграция между stores**
- [x] projectStore.launchSoftware() вызывает timeTrackingStore.startSession()
- [x] projectStore.removeTimeEntry() вызывает StatsService.syncFromTimeEntries()

### ✅ ФАЗА 8: CLEANUP

**8.1 Удалить старые файлы**
- [x] Удалить `src/utils/globalTimer.ts`
- [x] Удалить `src/utils/timeTracking.ts`
- [x] Удалить старые компоненты (InlineTimer, TimeInfoBar, TimeAnalytics, ManualTimeEntryModal)
- [x] Удалить `src/store/timeStatsStore.ts` (переехал в features)

**8.2 Обновить импорты**
- [x] Обновить `App.tsx` - использует новую инициализацию (StatsService, TimerService, useTimeTrackingStore)
- [x] Обновить `ProjectDetails.tsx` - импорт useTimeStatsStore из features
- [x] Обновить `src/components/time/index.ts` - реэкспорт компонентов из нового модуля
- [x] Удалить импорты `pauseTimeTracking`, `resumeTimeTracking` из App.tsx (функция удалена)

**8.3 Обновить компоненты, использующие тайм-трекинг**
- [x] `ProjectDetails.tsx` - удалены неиспользуемые методы из импортов
- [x] `App.tsx` - обновлен на новую систему инициализации
- [x] Удалена функция `handleTakeBreak` из App.tsx (pause не используется)

### ✅ ФАЗА 9: TESTING & OPTIMIZATION

**9.1 Тестирование**
- [ ] Тест: запуск сессии Photoshop
- [ ] Тест: таймер тикает каждую секунду
- [ ] Тест: минуты инкрементятся через 60 секунд
- [ ] Тест: виджет появляется через 2.3s
- [ ] Тест: пауза/возобновление работает
- [ ] Тест: остановка сессии
- [ ] Тест: ручное добавление времени
- [ ] Тест: статистика обновляется
- [ ] Тест: графики рендерятся корректно

**9.2 Оптимизация**
- [ ] Добавить мемоизацию в хуках (useMemo, useCallback)
- [ ] Оптимизировать селекторы Zustand
- [ ] Проверить количество ререндеров
- [ ] Добавить React.memo где нужно

**9.3 Error Handling**
- [ ] Добавить try-catch во все async функции
- [ ] Логирование ошибок
- [ ] Fallback UI при ошибках

**9.4 TypeScript**
- [ ] Проверить что все типы заданы
- [ ] Убрать `any` типы
- [ ] Добавить strict mode проверки

### 📚 ФАЗА 10: DOCUMENTATION

**10.1 Документация**
- [ ] README.md для модуля time-tracking
- [ ] JSDoc комментарии для всех публичных методов
- [ ] Примеры использования hooks
- [ ] Архитектурная схема

**10.2 Changelog**
- [ ] Создать MIGRATION_GUIDE.md для разработчиков
- [ ] Список breaking changes
- [ ] Примеры миграции старого кода

---

## 🎯 МЕТРИКИ УСПЕХА

### Код
- ✅ Уменьшение строк кода: 2210 → 1800 (-400 строк)
- ✅ Количество файлов: 4 → 25 (модульность)
- ✅ Средний размер файла: 550 строк → 72 строки
- ✅ Максимальный размер файла: < 200 строк

### Качество
- ✅ Покрытие типами TypeScript: 100%
- ✅ Отсутствие `any` типов
- ✅ Все функции < 50 строк
- ✅ Циклическая сложность < 10

### Архитектура
- ✅ Нулевые циклические зависимости
- ✅ Четкое разделение слоев (UI → Hooks → Stores → Services → Backend)
- ✅ Публичный API модуля
- ✅ Переиспользуемость кода

---

## 📋 ТЕКУЩИЙ ПРОГРЕСС

**Всего задач:** ~120
**Выполнено:** 2 (Анализ + План)
**В процессе:** -
**Осталось:** 118

**Текущая фаза:** ФАЗА 0 → ФАЗА 1

---

## 🚀 NEXT STEPS

1. **Создать структуру папок** `src/features/time-tracking/`
2. **Начать ФАЗУ 1:** Создание types и utils
3. **Постепенная миграция без breaking changes**
4. **Тестирование на каждом этапе**

---

## 📝 NOTES

- **Принцип:** Постепенная миграция без остановки разработки
- **Стратегия:** Создать новое параллельно старому, затем мигрировать, затем удалить старое
- **Тестирование:** После каждой фазы тестировать что всё работает
- **Commits:** Делать атомарные коммиты после каждой подзадачи

---

_Последнее обновление: 2025-10-21_
