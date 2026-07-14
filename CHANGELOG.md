# Changelog

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
