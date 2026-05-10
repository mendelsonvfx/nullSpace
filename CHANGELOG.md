# Changelog

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
