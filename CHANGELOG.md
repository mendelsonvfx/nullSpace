# Changelog

## [1.9.21] - 2026-08-07

### Changed
- Project: software tools path editor redesigned — animated expand panel per tool, pencil/done buttons with crossfade, save flash and "Reset to default" per tool
- Project: project-local executable paths now take priority over global paths when launching software
- Versions: executable path resolution checks project-local paths first, then global settings

### Fixed
- UI: custom scrollbar track repositioned to sit inside its container

## [1.9.20] - 2026-07-28

### Fixed
- Window: state not saved when window is minimized — prevents corrupt position/size from persisting on next launch
- Window: corrupted saved state (off-screen coordinates or invalid dimensions) now resets to centered 1920×900 instead of opening off-screen

## [1.9.19] - 2026-07-27

### Added
- Tool Launcher: enable/disable toggle in Settings → Launcher — disabled by default; shows the standard empty state when off
- Tool Launcher: warning dialog when enabling while Time Tracking is active — notes that launcher launches do not start the time tracker

### Fixed
- Welcome Setup: dispatches `softwarePaths:updated` event on complete so software buttons update without a restart

## [1.9.18] - 2026-07-23

### Changed
- Welcome Setup: full redesign — segmented stepper (Projects → Currency → Software → Ready), smooth slide animations, software rows styled as SettingsPanel cards with brand icons and clear-path button
- Welcome Setup: currency selection step added before software setup

## [1.9.17] - 2026-07-23

### Changed
- Activation: screen header redesigned to match main app — app icon, centered title, Tabler icon window controls with maximize button, red close hover; exit animation fixed

### Removed
- Tool Launcher: removed "Add Software" button from empty state — only "Open Settings" button remains

## [1.9.16] - 2026-07-22

### Fixed
- Tasks: double-click on a task row with attachments toggles the attachment panel instead of toggling completion twice

## [1.9.15] - 2026-07-22

### Added
- Tool Launcher: right-click context menu on tiles — "Reveal in Explorer" and "Copy Path"

## [1.9.14] - 2026-07-21

### Changed
- About: Project Page link now active — opens mendelsonvfx.com/#nullspace
- About: link buttons use Tauri shell open instead of anchor tags

## [1.9.13] - 2026-07-19

### Fixed
- Updater: brief pause after download completes — progress bar animates to 100% before the app exits to install

## [1.9.12] - 2026-07-19

### Changed
- Updater: default update check frequency changed to "on launch" instead of every 24 hours

### Fixed
- Updater: last-check timestamp written before the network call — prevents repeated checks when the server is unreachable
- Time Entry modal: removed fixed minimum height — modal size now adapts to content
- Finance: payment modal removed fixed minimum height — modal size now adapts to content

## [1.9.11] - 2026-07-17

### Added
- Updater: real-time download progress bar with MB count and percentage — replaces spinner during update install

### Changed
- Project: "View all tasks" toggle redesigned — fixed-width pill button with separate count badge; no layout shift on expand/collapse
- Tree: `_attachments` folder hidden by default alongside `backup`
- Versions: software filter tabs use fixed height for consistent alignment
- Output: software filter tabs use fixed height for consistent alignment

### Fixed
- Tasks: right-click on attachment button no longer triggers the system context menu

## [1.9.10] - 2026-07-17

### Changed
- Shots: scene card empty state — dot-grid background with large initial letter and uppercase "NO PREVIEW" label
- Shots: shot card "No preview" label restyled to match — small uppercase tracking-wide text
- Tasks: attachment button wrapped in fixed-width slot — no layout shift between empty and filled state; row padding increased

### Fixed
- UI: deadline field placeholders changed from Russian (ДД/ММ/ГГ) to English (DD/MM/YY) in project creation and project details
- UI: deadline notification messages translated to English
- UI: remaining Russian-language strings replaced with English across Finance and shot numbering

## [1.9.8] - 2026-07-16

### Added
- Shots: PSD/PSB thumbnail support — Photoshop files show embedded preview in shot cards and version list
- Backend: `extract_psd_thumbnail` and `get_file_mtime` commands; `psd_thumbnail` module

### Fixed
- Thumbnails: blend thumbnail cache busted automatically when file is modified on disk (mtime-based invalidation)
- Thumbnails: PSD and blend thumbnails refresh on window focus if the file has changed

## [1.9.7] - 2026-07-14

### Added
- Finance: configurable "Hours per Work Day" setting in Settings → Finance — used to calculate Revenue per Day rate

### Fixed
- Titlebar: double-click to maximize/restore window (toggles fullscreen if already fullscreen)
- Time Analytics: average hours per day uses local date grouping instead of UTC — fixes off-by-one on timezone boundaries
- Time Analytics: most productive day averages by distinct calendar days, not by entry count
- Tasks: priority bar and badge dim when task is completed

## [1.9.6] - 2026-07-08

### Added
- Tasks: file attachments — attach images, video, documents or paste from clipboard directly into a task
- Tasks: priority field (`high` / `med` / `low`) and deadline date per task
- Tasks: attachment preview toggle in Settings → Appearance
- Backend: `copy_attachment`, `save_attachment_bytes`, `paste_clipboard_image`, `get_clipboard_file_path`, `copy_file_to_clipboard` commands for attachment handling
- Backend: `rename_attachment_folder` — attachment paths rewritten automatically when a scene or shot is renamed

### Fixed
- Explorer: `reveal_in_explorer` now selects the file correctly (was opening default folder)
- Explorer: `open_file` uses `cmd /c start` instead of `explorer.exe` for proper file-type association

## [1.9.5] - 2026-07-04

### Added
- Output: NullConverter items in right-click menu for files and sequences
- Updater: release notes strip auto-generated "Full Changelog" link before display

### Changed
- Updater: releases now published to dedicated `nullSpace-releases` repo for auto-update checks
- Update Notification: "View Full Changelog" always shown, links to portfolio website

### Fixed
- Build: `UPDATE_TOKEN` env var tracked so stale token is never baked into a cached build

## [1.9.4] - 2026-07-02

### Added
- Tool Launcher: entrance animation on first mount — tiles slide in with staggered delay

## [1.9.3] - 2026-07-01

### Changed
- Settings: sidebar active tab now shows accent border + subtle tint instead of plain bg highlight
- Settings → Clients: redesigned as accordion cards with avatar initials and contact subtitle
- Settings → Launcher: item name is now editable inline
- Settings → Software: clear-path button fades in on row hover only; uses X icon

### Fixed
- Settings: Toggle animation uses left-based transform for smooth slide

## [1.9.2] - 2026-07-01

### Added
- Tool Launcher: new Settings tab to configure custom launcher items with icons and brand colors
- Tool Launcher: replaces the empty state panel when no project is selected
- Settings: `initialTab` prop — external buttons can open settings to a specific tab directly

### Removed
- Welcome Setup: removed Auto-Detect software button and backend `detect_software_paths` command

## [1.9.1] - 2026-04-28

### Fixed
- Tree: `_GlobalAssets` and `_GlobalCompose` folders highlighted when Asset/Compose context is active
- Tree: auto-scroll triggers on special context change as well as scene change
- Monitors: sorted primary-first then left-to-right for stable index across sessions

## [1.9.0] - 2026-04-28

### Added
- Settings: toggle to auto-delete `.blend1` backup files when a new version is saved
- Tree: hide/show version groups via eye button on hover; hidden groups dim and respect the global hidden toggle

### Fixed
- Finance: orphaned projects excluded from pending revenue and daily rate calculations
- Finance: daily rate now based on tracked hours (12 h = 1 working day) instead of calendar days; shows `—` when no data
- Finance: manual transaction folder path locked at modal open time to prevent stale state
- Shots: context menu accessible from shot name text area
- Project: Quick Actions always visible regardless of scene/shot selection state
- Blender backups: `start_watching_project` respects the auto-delete setting; `WalkDir` scan replaces recursive helper

## [1.8.9] - 2026-04-28

### Added
- Tree: colored extension icons for images, video, archives, scripts, PDF and text files
- Shots: F2 shortcut to rename the currently selected shot or scene

### Fixed
- Output: group expand state now scoped per tab (`preview` / `final`) — no cross-tab collapse conflicts
- Output: grouping always uses top-level folder; state restore waits for outputs to load
- Assets: "Create New Asset" button shows spinner and disables while software is launching
- Export: logo loaded as base64 DataURL to avoid CORS errors in Tauri webview
- Store: stale `currentShotId` on load auto-corrected to first available shot

## [1.8.8] - 2026-04-28

### Added
- Time Tracking: `check_process_alive_for_software` command validates PID belongs to expected software, preventing false positives from PID reuse after system restart

### Fixed
- Time Tracking: process alive check on session restore and periodic poll now uses software-aware validation
- Time Tracking: `get_active_sessions` filters out dead sessions before returning
- UI: duplicate border removed from RightSidebar

## [1.8.7] - 2026-04-28

### Added
- Links: favicons fetched via DuckDuckGo CDN with direct `favicon.ico` fallback; session-level cache avoids re-fetching on remount
- Settings: configurable button hide delay for Add Shot / Add Scene buttons

### Fixed
- Thumbnails: temp preview files written to `AppData/preview/` subfolder instead of AppData root
- Thumbnails: temp files deleted after processing (scene and shot previews)
- Blend thumbnails: support for Blender 5.x new file format (17-byte header, 32-byte block headers)

## [1.8.5] - 2026-04-28

### Fixed
- Time Tracking: `durationMinutes` preserved from projectStore during sync — prevents stale timeTrackingStore value from overwriting accumulated time
- Time Tracking: active session time uses projectStore entries instead of stale session data
- Versions: shot submenu scroll hidden to avoid scrollbar flicker

## [1.8.4] - 2026-04-28

### Fixed
- Software Tools: project settings modal z-index raised to render above other panels
- Software Tools: folder icon tinted by path state; local-path dot badge shown only in edit mode
- Software Tools: remove confirmation dialog border styled red for clarity

## [1.8.3] - 2026-04-28

### Added
- Software Tools: star badge on tool button when a project-local executable path is saved

### Fixed
- Finance: manual transaction list and project selector now include non-archived projects (not only active)
- Software Tools: executable path re-read from localStorage at click time to avoid stale closure
- Software Tools: compose software filter matches by key slug or display name
- Time Tracking: total minutes recalculated incrementally on add/remove instead of re-summing all entries

## [1.8.2] - 2026-04-27

### Added
- Shots: `ComposeSoftware` modal — select compose software on first Compose context activation
- Shots: GlobalCompose folders auto-created/deleted when adding or removing scenes and shots
- Shots: shot rename propagates to `_GlobalCompose` folder structure on disk

### Fixed
- Store: legacy `composeSoftware` string value normalized to array on load

## [1.8.1] - 2026-04-26

### Added
- Output: support for mid-name frame sequences (e.g. `[OctaneExport]1091_Beauty.exr`)
- Output: `_GlobalCompose` scene folder scanning in compose context
- Projects: rename project folder command (renames folder on disk when project name changes)

### Fixed
- Output: frame sequence grouping now correctly separates sequences with different suffixes

## [1.8.0] - 2026-04-03

### Fixed
- Finance: project sorting by date now uses the latest transaction date instead of only the project completion date
- Finance: chart data calculation correctly handles projects with multiple transactions
- Time Tracking: fixed live timer minutes calculation in analytics view
- UI: replaced emoji icon with a proper Download icon in the update notification banner
