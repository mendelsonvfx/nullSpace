# RayHub — Приоритизация задач

## Контекст

Проект RayHub (nullSpace) — десктопное приложение на Tauri + React/TypeScript + Rust для VFX-художников.

---

## ГРУППА 1 — Быстрые правки (30 мин — 2 ч каждая)

| # | Задача | Файл(ы) |
|---|--------|---------|
| ~~1~~ | ~~Переименовать «Weekly Timeline (Last 12 Months)» → «Weekly Timeline»~~ ✅ | `src/components/finance/` TimeAnalytics.tsx |
| ~~5~~ | ~~Добавить спиннер/индикатор загрузки при создании ассета~~ ✅ | `src/components/project/AssetsLibrary.tsx` |
| ~~6~~ | ~~Добавить F2 для переименования шотов, сцен, проектов~~ ✅ | `src/App.tsx` + `ShotsBrowser.tsx` + обработчики keyboard events |
| ~~7~~ | ~~Добавить иконки в Project Structure для .bat, .py, .jsx, .exe~~ ✅ | `src/components/project/TreeView.tsx` |

---

## ГРУППА 2 — Баги и фиксы (2 — 6 ч каждая)

| # | Задача | Файл(ы) |
|---|--------|---------|
| ~~9~~ | ~~Фильтр сбрасывается при перезаходе в проект — сохранять per-project~~ ✅ | `src/utils/outputsCache.ts` + `OutputOverview.tsx` |
| ~~10~~ | ~~Папка в Output Overview: если в UI визуально создалась папка — в неё должны переноситься **все** файлы, что реально лежат в этой папке, а не только часть.~~ ✅ | `src/components/project/OutputOverview.tsx` |
| ~~11~~ | ~~Preview/Final в Output Overview — одноимённые папки раскрываются одновременно~~ ✅ | `src/components/project/OutputOverview.tsx` — разделить expand-стейт по категориям |
| ~~12+13~~ | ~~**Version Overview / File Overview показывают лишнее**~~ ✅ | `src/store/projectStore.ts` + `VersionsOverview.tsx` + `TreeView.tsx`/`OutputOverview.tsx` |
| ~~14~~ | ~~Два одинаковых Full HD монитора: при смене цели с Monitor 2 на 3 выбирается один и тот же.~~ ✅ Баг кода не подтверждён (Windows API даёт уникальные device names). Добавлена сортировка primary-first + по x/y для стабильного порядка между сессиями. | `src-tauri/src/main.rs` `get_monitors_internal()` |
| ~~15~~ | ~~В проекте GDN не удаляются .blend1 файлы и не сработало перенумерование шота~~ ✅ | `src-tauri/src/main.rs` — WalkDir max_depth(2) + Settings toggle |
| ~~16~~ | ~~Когда добавляешь деньги через Add — они засчитываются во все категории включая Personal. Должно засчитываться в ту категорию, из которой была нажата кнопка добавления.~~ ✅ | `src/components/finance/` ManualTransactionModal.tsx + financeService.ts |
| ~~17~~ | ~~Если папка проекта пропадает — убирать оставшуюся сумму из Pending~~ ✅ | `src/utils/financeService.ts` — проверка существования папки при расчёте Pending |
| ~~18~~ | ~~На проектах без папки нельзя зайти в фин-стату — вернуть доступ~~ ✅ | `src/components/finance/` — убрать guard на существование папки |
| ~~19~~ | ~~PDF из статистики не выводится, выдаёт ошибку~~ ✅ | `src/components/finance/` ExportModal.tsx или PDF-логика |
| ~~20~~ | ~~Проверить расчёт Revenue Per Day. День должен рассчитываться как количество рабочих часов, делённое на 24.~~ ✅ | `src/utils/financeService.ts` `calculateStatistics()` |
| ~~21~~ | ~~Перенести ПКМ-зону перенумерования шота в более удобное место.~~ ✅ | `src/components/project/ShotsBrowser.tsx` — контекстное меню шота |

---

## ГРУППА 3 — Средние фичи (0.5 — 2 дня каждая)

| # | Задача | Файл(ы) |
|---|--------|---------|
| ~~22~~ | ~~Скопировать Quick Actions на страницу сцены~~ ✅ | `src/components/project/ProjectDetails.tsx` — убрать условие скрытия |
| ~~23~~ | ~~Хайдить группу объектов в Project Structure~~ ✅ | `src/components/project/TreeView.tsx` — eye button на version stack + hiddenPaths |
| ~~24~~ | ~~При выборе контекста Assets/Compose подсвечивать папки Global Assets / Global Compose в Project Structure~~ ✅ | `src/components/project/TreeView.tsx` — аналог подсветки сцены |

---

## Рекомендуемый порядок выполнения

```
Спринт 1 (быстрые победы):   Группа 1 целиком (#1, 4–7)
Спринт 2 (критичные баги):   #9, 10, 11, 12+13, 16, 19 — самые заметные
Спринт 3 (остальные баги):   #14, 15, 17, 18, 20, 21
Спринт 4 (средние фичи):     #22, 23, 24
```

---

## Верификация (общая)

- Каждый фикс проверяется в `npm run tauri dev` на реальных проектах
- Баги финансов (#16–20) — проверять на тестовом проекте с разными статусами оплаты
- Monitor bug (#14) — воспроизводить только при наличии двух одинаковых мониторов

---

---

## ОТЛОЖЕНО — сделать позже

| # | Задача |
|---|--------|
| 2 | Добавить кнопку Cancel во всех модалах |
| 3 | Уменьшить размер текста внутри кнопок в модалах |
| 4 | Убрать надпись «No Preview» в Shots Overview, если превью уже загружена из Blender (альфа-канал) | `src/components/project/ShotsBrowser.tsx` |
| 8 | ПКМ-меню 3-го уровня уходит за границы экрана |
| 25 | Взять оформление пунктов меню из nullRef |
| 26 | Output Overview под контекст Compose: добавить выбор сцены и шота |
| 27 | Добавить пункты конвертации файлов через nullConvert в ПКМ аутпутов |
| 28 | Заменить дефолтный экран «добавить проект» на Software Launcher |
| 29 | **Умная система кеша превью на диске** |
| 30 | **Кнопка генерации рендер-скрипта и запуска рендера вне Blender** |
| 31 | **Reorder блоков в Project Details** |
| 32 | **Task Tracker с датами, временем и приоритетом** |
| 33 | **Система активации по ключу с привязкой к устройству** |
| 34 | **Скачки CPU — расследование** |
| 35 | **Прикреплять картинки к таскам** |
