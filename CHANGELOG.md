# Changelog

## [1.9.45] - 2026-10-21

### Added
- Unreal Engine support: selectable on project creation, in Settings → Software and the first-run wizard
  - Folder `UnrealEngine/` with `Geo/{Export,Import}`, `Tex/{Export,Import}` and per-shot `Render/{Preview,Final,Passes}` (Movie Render Queue target), like other software
  - One UE project per nullSpace project in `UnrealEngine/_Project`, created on first launch from the engine's Blank template (`TP_BlankBP`): template config copied with the project name substituted and a fresh `ProjectID`, template plugins kept; minimal project as fallback when the template is missing
  - Engine version for `EngineAssociation` read from `Engine/Build/Build.version` (source builds left unassociated), install folder name as fallback
  - Existing `.uproject` reused on every launch, including one created manually via the UE Project Browser or kept under an old name after a project rename
  - Clear error when the Epic Games Launcher or `UnrealEditor-Cmd.exe` is selected instead of the editor
  - Time tracking: PID lookup and process detection for `UnrealEditor.exe` / `UE4Editor.exe`; 15-minute startup grace so splash-only shader compilation doesn't end the session
  - Extra warning in the remove-software dialog: removing Unreal Engine deletes the UE project too
  - Unreal Engine logo in launch buttons, Settings, the first-run wizard and Project Details, plus a project tree folder icon
- Cinema 4D support: selectable on project creation, in Settings → Software, the first-run wizard and the Assets Library
  - Folder layout same as Blender (`Geo`, `Tex`, `Cache`, `Render`); C4D finds textures in `tex/` next to the document
  - New versions created via `c4dpy` (Cinema 4D R23+), like Houdini via `hython`: render path set to `Render/Preview/<shot>/$prj` and frame range 1001–1250, like the Blender setup
  - Clear errors when `c4dpy` is missing (Cinema 4D Lite / older versions) or times out waiting for a Maxon license sign-in; no empty `.c4d` left behind
  - Time tracking: PID lookup and process detection for `Cinema 4D.exe`; 2-minute startup grace for the license check on first launch
  - Cinema 4D logo in launch buttons, Settings, the first-run wizard and Project Details, plus a project tree folder icon
  - Version previews: the document preview embedded in `.c4d` files is shown in Versions Overview, shot cards and the shots table, like Blender and Photoshop (files created by `c4dpy` have no preview until saved from Cinema 4D)
- Substance Painter support: selectable on project creation, in Settings → Software, the first-run wizard and the Assets Library
  - Folders `Geo/Import`, `Tex/Export` and `Render/{Preview,Final}`; per-shot render folders like other software
  - New versions: Painter opens without a file and nullSpace shows a hint; after File → New, a nullSpace startup script inside Painter saves the project as `PROJ_…_v001.spp` in the right folder (once per launch, only for new projects, never overwrites). The script lives in Painter's `python/startup` folder and does nothing when Painter isn't launched by nullSpace
  - Texture export path defaults to the version folder's `Tex/Export` (`--export-path`)
  - Time tracking: PID lookup and process detection for `Adobe Substance 3D Painter.exe` / `Substance Painter.exe`; 1-minute startup grace
  - Substance Painter logo in launch buttons, Settings, the first-run wizard and Project Details, plus a project tree folder icon
  - No version previews: `.spp` is an HDF5 container without an extractable project thumbnail (like After Effects and Houdini)
- DaVinci Resolve support (Windows); path in Settings → Software and the first-run wizard
  - **Shot-based projects — Compose only:** chosen in the Compose software window, not added to the project's software list, launch button only in Global Compose. Choosing it creates a `DaVinci/` media folder (`Footage`, `Assets`, `Cache`, no per-scene split; restored on launch if missing); versions `_GlobalCompose/PROJ_COMP_vNNN.drp`, renders `_GlobalCompose/Output/Preview`. On project creation the DaVinci Resolve card is locked (and unchecked) while "Shot-based" is on; in Project Settings its card is locked and follows the Compose choice (its project path stays editable)
  - **Projects without shots — regular software:** selectable on creation and in Project Settings; folder `DaVinci/{Footage,Assets,Output,Cache}`, versions `DaVinci/PROJ_vNNN.drp`, renders `DaVinci/Output/Preview` (shown in Versions Overview and Output Overview)
  - One Resolve project per nullSpace project, kept in a `nullSpace` folder of the Resolve Project Manager under the plain project name (`<project> (<category>)` when two nullSpace projects share a name). Timelines are left to the user
  - Renaming the nullSpace project keeps the work: earlier names are remembered in `.davinci-resolve.json` in the project folder, and Open Project renames the Resolve project found under an old name
  - The launch button starts Resolve (or brings the running one to the front) and installs two menu scripts under Workspace → Scripts, with the launch context baked in: **nullSpace - Open Project** opens or creates the project and points Deliver at `_GlobalCompose/Output/Preview` with the file name `PROJ_COMP`; **nullSpace - Save Version** exports the project as the next `_GlobalCompose/PROJ_COMP_vNNN.drp` (never overwrites, refuses other projects and imported snapshots). Both show a confirmation window
  - Versions: `.drp` snapshots in Versions Overview (Compose); double-click (also in the file tree) imports the snapshot as a separate project `<project> vNNN` via nullSpace - Open Project, leaving the working project untouched; Project Manager returns to the folder the user was in (any depth)
  - Time tracking: PID of the already running `Resolve.exe` is reused (Resolve is single-instance); 90-second startup grace
  - DaVinci Resolve logo in the Compose launch button, the Compose software window, Settings, the first-run wizard and the Tool Launcher; cyan `#13D4F2` from the logo as its color
  - Limitations: the project is looked up in the `nullSpace` folder of the current Resolve database (moving it out, renaming the folder or switching databases creates a new empty one; `.drp` versions are the restore points); if a nullSpace project is renamed and another one takes the old name before Open Project runs, the second can pick up the first one's Resolve project; Save Version can't tell a same-named project from another Project Manager folder; a scene named "Output" shares its `_GlobalCompose` folder with the compose render folder; turning a snapshot back into the working project is done manually in Project Manager; removing DaVinci from Compose or deleting the project leaves the Resolve project in Resolve's database
- Compose: "Change Compose Software…" in the right-click menu of the Compose button — reopens the Compose software window with the current choice checked (the window used to appear only on the first visit)
- Output Overview (Compose) also shows whole-project compose renders from `_GlobalCompose/Output/{Preview,Final}`
- Versions Overview hidden for projects whose software has no file versioning (e.g. Unreal Engine only); still shown in Asset/Compose contexts, and rendered outputs keep updating live

### Changed
- Launch hints: `launch_software` returns a `hint` text instead of the Substance Painter-specific `awaiting_new_project` flag; the notification title names the software
- Software folder icons in the project tree redrawn in one style (folder with the software logo); new icons for Houdini, Unreal Engine, Cinema 4D, Substance Painter and DaVinci Resolve
- Settings: "Blender File Previews" renamed to "Project File Previews" — the toggle covers Blender, Photoshop and Cinema 4D previews
- Substance Painter and Cinema 4D colors (launch buttons, stats, badges) match their logos: lime `#99E83F` and indigo `#5C6BE0` instead of orange and light blue
- Software icons without a logo show their abbreviation on the brand gradient from `SOFTWARE_META` instead of a generic first letter
- Time tracking: process name patterns unified in one helper (Houdini Apprentice now also matched in global process search)

### Fixed
- Compose context lists compose software whose key doesn't match its display name (e.g. "DaVinci Resolve" → `davinci`)
- Outputs: software chips show display names ("After Effects", "Unreal Engine") instead of folder names ("AfterEffects")
- File watcher ignores Unreal Engine cache writes inside `UnrealEngine/_Project` — no spurious version/output reloads while UE is open
- Time tracking: manual time entries store the canonical software key (e.g. `unreal`, `after-effects`) instead of the lowercased display name — no duplicate rows in Software Breakdown, and deleting a manual entry now subtracts its time from the right software
- Time tracking: global software statistics normalize software names on add/remove/read, so any caller passing a display name lands in the right bucket
- Time tracking: manual entry history colors entries by software even when they were saved under a display name
- Launch: the latest version is picked only among the software's own file types — an FBX/ABC export or a `.blend1` backup saved under the document's name no longer gets opened instead of the scene, and an asset's launch no longer opens another software's file with the same name
- Shots table: previews for shots whose latest version is a Photoshop or Cinema 4D file (the latest file of any software was sent to the Blender extractor and failed); Photoshop previews added to the table
- Versions: double-clicking a `.spp` version starts time tracking (versions reported "Substance" while the project software is "Substance Painter")
- Tree: `.sbs` (Substance Designer) files open with the default application instead of launching Substance Painter
- Versions / Assets: opening a version uses the canonical software key, so the executable path is found for software whose display name differs from its key (e.g. "Cinema 4D")
- Unreal Engine accent color changed from near-black to light neutral — visible in Software Breakdown, Settings and launch button/tile highlights on the dark UI

## [1.9.35] - 2026-10-20

### Added
- Project: project name validated on create and rename — only Latin letters, digits, spaces and hyphens; invalid chars blocked on input with red border and collapsible inline hint
- Compose: selecting compose software in the activation modal now automatically enables it in the project (creates software folders, adds it to the tool list)

### Changed
- Compose: `_GlobalCompose` folder and scene subfolders created only when Compose is first enabled, not on every new project or scene
- Compose: `_GlobalCompose` outputs labeled with the actual compose software name instead of hardcoded "AfterEffects"
- Finance: pending revenue breakdown sorted by amount descending
- Finance: "Total Projects" count includes archived projects

### Fixed
- Project: removing software that was also the compose software now clears it from `composeSoftware` too
- Project: rename and software removal use latest project state after async update — prevents stale data overwriting concurrent changes
- Project: deleting a project removes its archive backup — prevents orphaned entries reappearing in Finance after reload
- Store: switching project categories clears stale archived backups before the next load
- Output: compose outputs reload when compose software changes
- Compose: Confirm button disabled while applying — prevents double submission
- Compose: file watcher restarted and tree refreshed after enabling Compose — new folders appear without switching projects

## [1.9.32] - 2026-08-17

### Changed
- Shots: overview table header border removed, row spacing tightened

### Fixed
- Assets: software launch now checks project-local executable path before global settings (was skipping it)
- Tree: software launch now checks project-local executable path before global settings (was skipping it)
- Shots: "No preview" placeholder no longer renders over a loaded thumbnail in the overview table

## [1.9.30] - 2026-08-10

### Changed
- Performance: `get_project_versions`, `extract_blend_thumbnail`, `extract_psd_thumbnail`, `update_project` and file I/O commands moved to `spawn_blocking` — no longer block the async Tauri runtime
- Performance: versions cache adds in-flight deduplication — parallel requests for the same project share one IPC call instead of firing duplicates
- Performance: tree structure and directory size cached per-project (5-min TTL, max 10 entries) — instant restore on project switch
- Performance: thumbnail hooks skip `get_file_mtime` IPC on normal mount/remount when memory cache is warm; only check on window focus
- Performance: file watcher start debounced 150 ms — rapid project switching skips unnecessary watcher startups
- Performance: `ProjectDetails` uses `useShallow` for project selector to avoid re-renders from unchanged references
- Performance: `projectsRef` ref pattern eliminates stale-closure re-subscriptions in break reminder and global paste handler

### Fixed
- Versions: stale load responses discarded via request-ID tracking in VersionsOverview and ShotsBrowser
- Events: Tauri `unlisten` callbacks guarded with abort flags to prevent calls after component unmount

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
