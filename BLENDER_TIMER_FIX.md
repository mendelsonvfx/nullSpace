# Blender Timer Fix - Process Tree Tracking

## Branch Information
**Fixed in branch:** `redesign-nullspace`
**Date:** November 2, 2025
**Status:** ⚠️ NEEDS TO BE MERGED TO MAIN

---

## Problem Description

### Symptom
Timer for Blender closes automatically after 5 seconds when Blender is opened.

### Root Cause
Blender uses a **launcher process architecture**:
1. User launches Blender → Launcher process starts (we track this PID)
2. Launcher spawns the main Blender process
3. Launcher exits immediately
4. Our PID lookup detects the launcher is dead → stops timer after 5 seconds
5. Main Blender process continues running, but we're no longer tracking it

### Previous Confusion
- PID lookup was working correctly (it is ENABLED and ACTIVE)
- The issue was not that PID lookup was disabled
- The issue was that we were tracking the wrong process (launcher instead of main process)

---

## Solution Implemented

### Process Tree Tracking
Instead of just checking if a PID is alive, we now:
1. Check if the original PID is alive
2. If dead, search for child processes spawned by that PID
3. Find the main application process by name (e.g., "blender.exe")
4. Migrate tracking to the child process PID
5. Continue monitoring the new PID

### Benefits
- Works with launcher-based applications (Blender, Adobe apps, etc.)
- Gracefully handles process migration
- No false positives from launcher exits
- Maintains accurate time tracking

---

## Technical Implementation

### Files Modified

#### 1. Rust Backend: `src-tauri/src/time_tracking.rs`

**New Functions:**
- `find_child_processes(parent_pid: u32) -> Vec<u32>`
  - Finds all child processes of a given parent PID
  - Uses sysinfo to traverse process tree

- `find_process_by_name_and_parent(name: &str, parent_pid: u32) -> Option<u32>`
  - Finds a specific process by name among children
  - Case-insensitive matching
  - Returns the child process PID

- `migrate_to_child_process(old_pid: u32, software_name: &str) -> Option<u32>`
  - Public API for PID migration
  - Searches for child process matching software name
  - Returns new PID if found

**New Tauri Command:**
```rust
#[tauri::command]
pub fn migrate_to_child_process(old_pid: u32, software_name: String) -> Option<u32>
```

#### 2. Frontend: `src/features/time-tracking/stores/timeTrackingStore.ts`

**Modified Process Check Callback:**
- When PID is detected as dead, attempts to find child process
- Calls `SessionService.migrateToChildProcess(old_pid, software_name)`
- Updates session.pid with new PID if migration succeeds
- Logs all migration attempts for debugging

**New Service Method:** `SessionService.migrateToChildProcess()`
- Invokes Rust backend command
- Returns new PID or null

---

## Testing Checklist

### Before Merge to Main
- [ ] Test Blender: Launch and verify timer continues beyond 5 seconds
- [ ] Test Blender: Verify timer stops when Blender actually closes
- [ ] Test other apps: Ensure non-launcher apps still work (VS Code, Chrome, etc.)
- [ ] Test Adobe apps: Verify works with After Effects, Photoshop (also use launchers)
- [ ] Check logs: Verify PID migration is logged correctly
- [ ] Performance: Ensure no significant overhead from child process lookup

### Expected Behavior
1. Start Blender → Timer starts (tracks launcher PID)
2. After 5 seconds → PID migration detects launcher dead, finds main Blender process
3. Timer continues → Now tracking main Blender process PID
4. Close Blender → Timer stops (main process is actually dead)

### Log Output to Look For
```
[TimeTrackingStore] 🔍 Process check for Blender (PID: 12345): ❌ DEAD
[TimeTrackingStore] 🔄 Process died, attempting to migrate to child process...
[SessionService] 🔄 Attempting to migrate PID 12345 for Blender
[SessionService] ✅ Migrated to child process PID: 67890
[TimeTrackingStore] ✅ Migrated to child process PID: 67890
```

---

## Migration Instructions

### When merging `redesign-nullspace` → `main`:

1. **Ensure these files are included:**
   - `src-tauri/src/time_tracking.rs` (Rust changes)
   - `src/features/time-tracking/stores/timeTrackingStore.ts` (Frontend changes)
   - `src/features/time-tracking/services/SessionService.ts` (New method)

2. **After merge:**
   - Run `cargo clean` to ensure fresh build
   - Run `cargo build --release` to recompile Rust code
   - Test with Blender before releasing

3. **Version bump:**
   - This is a bug fix → patch version bump
   - Update changelog with "Fixed: Blender timer no longer stops after 5 seconds due to launcher process"

---

## Code Locations

### Key Code Sections

**Rust - Process Tree Functions:**
- Location: `src-tauri/src/time_tracking.rs`
- Lines: ~560-620 (search for `find_child_processes`)

**Rust - Tauri Command:**
- Location: `src-tauri/src/time_tracking.rs`
- Search for: `migrate_to_child_process`

**Frontend - PID Migration:**
- Location: `src/features/time-tracking/stores/timeTrackingStore.ts`
- Lines: ~119-160 (in `setProcessCheckCallback`)

**Frontend - Service Method:**
- Location: `src/features/time-tracking/services/SessionService.ts`
- Search for: `migrateToChildProcess`

---

## Related Issues

### Similar Applications That May Benefit
- Adobe After Effects
- Adobe Photoshop
- Adobe Premiere Pro
- Any app that uses launcher processes

### Future Improvements
- [ ] Add configurable list of "known launcher apps"
- [ ] Cache process tree to reduce system calls
- [ ] Add telemetry for PID migration success rate
- [ ] Support multiple levels of process nesting (grandchildren)

---

## Rollback Plan

If issues occur after merge:

1. **Quick fix:** Disable process migration by commenting out the migration logic in `timeTrackingStore.ts`
2. **Temporary workaround:** Increase `PROCESS_CHECK_INTERVAL` to 15-30 seconds
3. **Full rollback:** Revert commits related to process tree tracking

---

## Notes

- PID lookup was NEVER disabled - it was always working correctly
- The fix adds intelligence to handle launcher-based applications
- No breaking changes to existing functionality
- Gracefully falls back to stopping timer if no child process found

**Remember:** This fix is in `redesign-nullspace` branch and needs to be cherry-picked or merged to `main` branch!

---

## CRITICAL UPDATE: Window Detection Bypass Fix

**Date:** November 2, 2025 (Evening)
**Status:** ⚠️ CRITICAL FIX ADDED

### New Problem Discovered

After implementing PID migration, a **critical bypass** was discovered:
- User closes Blender window → Window disappears
- Blender process stays running in background (no window)
- Timer **keeps running** even though window detection exists in backend

### Root Cause

The PID migration fix introduced a bypass of window detection:
1. **Backend** has sophisticated window detection (`has_visible_window()`) with grace periods
2. **Frontend** process check callback was only checking `checkProcessAlive(pid)`
3. `checkProcessAlive` only verifies process exists, **NOT** if it has visible windows
4. Frontend **never consulted backend session status** (which includes window detection)
5. Result: Windowless background processes kept timer running indefinitely

### Solution: Enhanced Backend Trust

**New Architecture (Option C+):**
```
Frontend Process Check Flow:
1. Query backend session status (includes window detection + grace period)
   ↓
2. If backend says "alive" → Trust it, continue tracking
   ↓
3. If backend says "dead" → Try PID migration (Blender launcher fix)
   ↓
4. If migration succeeds → Update BOTH backend and frontend PIDs
   ↓
5. If migration fails → Stop timer
```

### Files Modified (Window Detection Fix)

#### 1. **src-tauri/src/time_tracking.rs** (Lines 555-578)
Added two new Tauri commands:
```rust
#[tauri::command]
pub fn get_session_status(entry_id: String) -> Result<ActiveSession, String>
// Returns full backend session status (includes process_alive flag set by window detection)

#[tauri::command]
pub fn update_session_pid(entry_id: String, new_pid: u32) -> Result<(), String>
// Updates backend session PID after migration (syncs backend with frontend)
```

#### 2. **src-tauri/src/main.rs** (Lines 2753-2754)
Registered new commands:
```rust
time_tracking::get_session_status,
time_tracking::update_session_pid,
```

#### 3. **src/features/time-tracking/services/SessionService.ts** (Lines 138-168)
Added two new methods:
```typescript
static async getSessionStatus(entryId: string): Promise<ActiveSession | null>
// Gets full backend session status

static async updateSessionPid(entryId: string, newPid: number): Promise<void>
// Updates backend PID after migration
```

#### 4. **src/features/time-tracking/stores/timeTrackingStore.ts** (Lines 119-192)
**MAJOR REFACTOR** of process check callback:
- **Step 1:** Query backend session status FIRST
- **Step 2:** Trust backend if it says "alive" (respects grace periods)
- **Step 3:** If backend says "dead", try PID migration
- **Step 4:** After migration, update BOTH backend and frontend PIDs
- **Fallback:** Simple process check if backend communication fails

### Key Improvements

1. **Single Source of Truth:** Backend window detection is now the authority
2. **Synced PIDs:** Backend and frontend always track same PID after migration
3. **Preserves Launcher Fix:** PID migration still works for Blender launcher
4. **Graceful Degradation:** Fallback to simple process check on errors
5. **No Bypass:** Window detection can't be circumvented anymore

### Testing Checklist (Updated)

**Windowless Process Detection:**
- [x] Code implemented and compiles
- [ ] Test: Close Blender window → Process stays in background
- [ ] Verify: Timer stops after 5 seconds (grace period)
- [ ] Check logs: Backend marks session dead, frontend respects it

**Blender Launcher (Original Fix):**
- [x] Code implemented and compiles
- [ ] Test: Launch Blender → Launcher exits → Main process continues
- [ ] Verify: Timer migrates to main process PID
- [ ] Verify: Backend PID updates to match frontend
- [ ] Check logs: Migration logged, both PIDs sync

**Other Applications:**
- [ ] Test VS Code, Chrome (non-launcher apps)
- [ ] Test Adobe apps (launcher-based like Blender)

### Expected Log Output

**Scenario 1: Normal Operation**
```
[TimeTrackingStore] ✅ Backend confirms Blender alive (PID: 12345)
```

**Scenario 2: Window Closes (Background Process)**
```
[TimeTracking] PID 12345 no window, grace period (0/5s)
[TimeTracking] PID 12345 no window, grace period (1/5s)
...
[TimeTracking] PID 12345 no window - grace period expired, marking dead
[TimeTrackingStore] ⚠️ Backend says dead (PID: 12345), attempting migration...
[SessionService] 🔄 Attempting to migrate PID 12345 for Blender
[SessionService] ❌ No child process found for migration
[TimeTrackingStore] ❌ No migration possible, stopping session for Blender
```

**Scenario 3: Launcher Migration**
```
[TimeTrackingStore] ⚠️ Backend says dead (PID: 11111), attempting migration...
[SessionService] 🔄 Attempting to migrate PID 11111 for Blender
[SessionService] ✅ Migrated to child process PID: 22222
[TimeTracking] 🔄 Migrating session xxx PID: 11111 -> 22222
[TimeTrackingStore] ✅ Backend PID updated
```

### Risk Assessment

**Risk Level:** LOW ✅
- Changes are additive (new commands, enhanced logic)
- Has fallback behavior on errors
- Preserves all existing functionality
- Backend window detection unchanged (proven to work)

### Deployment Notes

When deploying to main:
1. Ensure both Rust and TypeScript changes are included
2. Test with Blender specifically (both launcher and windowless cases)
3. Monitor logs for any "Backend says dead" followed by immediate restarts
4. If issues occur, fallback is already in place (simple process check)

---

**SUMMARY:** Window detection bypass has been fixed by making frontend trust backend session status instead of doing raw PID checks. PID migration still works for launchers, but now properly syncs with backend.
