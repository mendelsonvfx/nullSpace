# RayHub — Бэклог

## Контекст

Проект RayHub (nullSpace) — десктопное приложение на Tauri + React/TypeScript + Rust для VFX-художников.

---

## ГРУППА 3 — Крупные фичи (2+ дня)

| # | Задача | Файл(ы) |
|---|--------|---------|
| 6 | Закрытая бета: лицензирование через git — Ed25519 + GitHub Contents API, одноразовые ключи, ratchet-защита от отката часов → план `effervescent-enchanting-aurora.md` | `src-tauri/src/beta/` + `src/beta/` |

---

## ОТЛОЖКА

| # | Задача | Файл(ы) |
|---|--------|---------|
| — | ПКМ-меню 3-го уровня уходит за границы экрана | `src/components/ui/ContextMenu/` |
| — | Скачки CPU — расследование | `src-tauri/src/` |
| — | Output Overview под контекст Compose: добавить выбор сцены и шота | `src/components/project/OutputOverview.tsx` |
| — | Reorder блоков в Project Details | `src/components/project/ProjectDetails.tsx` |
| — | Умная система кеша превью на диске | `src-tauri/src/` + `src/components/` |
| — | Рендер бленд проекта по ПКМ по версии в Version Overview — продумать UX/UI, обязательно дать возможность отрендерить один кадр | `src/components/project/VersionsOverview.tsx` + `src-tauri/src/` |
