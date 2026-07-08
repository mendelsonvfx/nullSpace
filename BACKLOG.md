# RayHub — Бэклог

## Контекст

Проект RayHub (nullSpace) — десктопное приложение на Tauri + React/TypeScript + Rust для VFX-художников.

---

## ГРУППА 1 — Баги и фиксы

| # | Задача | Файл(ы) |
|---|--------|---------|
| 1 | ПКМ-меню 3-го уровня уходит за границы экрана | `src/components/ui/ContextMenu/` |
| 2 | Скачки CPU — расследование | `src-tauri/src/` |

---

## ГРУППА 2 — Средние фичи (0.5 — 2 дня)

| # | Задача | Файл(ы) |
|---|--------|---------|
| 3 | Output Overview под контекст Compose: добавить выбор сцены и шота | `src/components/project/OutputOverview.tsx` |
| 4 | Reorder блоков в Project Details | `src/components/project/ProjectDetails.tsx` |

---

## ГРУППА 3 — Крупные фичи (2+ дня)

| # | Задача | Файл(ы) |
|---|--------|---------|
| 5 | Умная система кеша превью на диске | `src-tauri/src/` + `src/components/` |
| 6 | Рендер бленд проекта по ПКМ по версии в Version Overview — продумать UX/UI, обязательно дать возможность отрендерить один кадр | `src/components/project/VersionsOverview.tsx` + `src-tauri/src/` |
| 7 | Прикреплять картинки к таскам как вложение — при наведении показывается что вложено, назначать на таск дату и приоритет; модульная архитектура как база под будущий «таск трекер» | `src/components/project/` |
| 8 | Закрытая бета: лицензирование через git — Ed25519 + GitHub Contents API, одноразовые ключи, ratchet-защита от отката часов → план `effervescent-enchanting-aurora.md` | `src-tauri/src/beta/` + `src/beta/` |
