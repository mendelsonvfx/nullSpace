# ⚠️ Known Issues & Limitations - nullSpace v0.9.6-beta

This document lists current known issues, limitations, and workarounds for the nullSpace project manager.

**Last Updated:** 2025-10-12
**Version:** 0.9.6-beta

---

## 🚨 CRITICAL - Currently Disabled Features

### 1. Automatic File Watcher (DISABLED)

**Status:** ❌ Temporarily disabled due to infinite loop bug

**Issue:**
The automatic file watching feature that refreshes project versions when blend files change has been disabled to prevent system freezes.

**Root Cause:**
```rust
// src-tauri/src/main.rs:1265
loop {
    std::thread::sleep(Duration::from_secs(1)); // ❌ Never exits!
}
```
- Creates infinite loop in background thread
- No shutdown mechanism (missing `Arc<AtomicBool>`)
- Threads accumulate on each project switch
- Eventually causes memory leak → system freeze

**Impact:**
- ⚠️ Version list does NOT auto-refresh when files change
- ⚠️ User must manually close and reopen project to see new versions

**Workaround:**
1. Make changes to your Blender/Houdini files
2. Close project details panel
3. Reopen project details panel
4. Version list will now show updated files

**Fix ETA:** v0.9.7 (requires proper thread lifecycle implementation)

---

## 🔴 HIGH PRIORITY ISSUES

### 2. Race Condition in Project Updates

**Status:** 🟡 Partially fixed, needs completion

**Issue:**
When making rapid changes to a project (e.g., quickly editing multiple fields), some updates may be lost or overwritten.

**Technical Details:**
```typescript
// Synchronous Zustand update followed by async Tauri call
set({ projects: [...] }); // Immediate
invoke('update_project', { project }); // Delayed
```

**When It Happens:**
- Editing project name, then immediately changing status
- Rapidly clicking favorite/pin buttons
- Quick successive changes to deadlines

**Impact:**
- Some edits may not persist to disk
- Last edit might overwrite previous edits

**Workaround:**
- Wait 1-2 seconds between edits
- Verify changes saved by closing and reopening project

**Fix Status:** Update queue implementation started but incomplete

---

### 3. localStorage Overflow Risk (Mitigated)

**Status:** ✅ Mostly fixed, but needs LRU eviction

**Issue:**
Although migrated to IndexedDB, some legacy code still uses localStorage for thumbnails.

**Risk:**
- localStorage has 5-10MB limit
- Can crash if exceeded with many high-res thumbnails

**Current Mitigation:**
- IndexedDB now used for new thumbnails (unlimited storage)
- Automatic migration from localStorage on first run

**Remaining Work:**
- Implement LRU (Least Recently Used) cache eviction
- Add max cache size limit (e.g., 1000 thumbnails)
- Clean up old localStorage entries

**Workaround:**
If you encounter thumbnail loading issues:
1. Open browser DevTools (F12)
2. Application tab → Local Storage → Clear
3. Refresh application

---

## 🟠 MEDIUM PRIORITY ISSUES

### 4. Performance Degradation with Many Projects

**Status:** 🟡 Known limitation

**Issue:**
With 100+ projects, scrolling becomes laggy due to all ProjectCard components rendering at once.

**Impact:**
- Noticeable lag when scrolling through project list
- Increased memory usage
- Slower initial load

**Workaround:**
- Use search/filter to reduce visible projects
- Archive completed projects
- Use favorites to access frequently used projects

**Planned Fix:** Virtual scrolling with `react-window` (v0.9.7)

---

### 5. Software Auto-Detection Not Implemented

**Status:** ❌ Feature incomplete

**Issue:**
The "Auto-detect installed software" feature doesn't work. All software paths must be manually configured.

**Technical Reason:**
```typescript
// src/utils/tauri.ts:88-90
export async function detectInstalledSoftware(): Promise<Record<string, string>> {
  return {}; // ❌ Returns empty object
}
```

**Workaround:**
1. Go to Settings (⚙️ icon)
2. Software Configuration section
3. Manually click "Browse" for each software
4. Navigate to executable (e.g., `blender.exe`, `houdinifx.exe`)

**Planned Fix:** Windows Registry scan + common path checking (v1.0.0)

---

### 6. Missing Error Notifications

**Status:** 🟡 Partially implemented

**Issue:**
When errors occur (failed to load thumbnail, project creation failed, etc.), users don't receive clear feedback.

**Impact:**
- Silent failures confuse users
- Hard to diagnose issues

**Current Behavior:**
- Errors logged to console only (not visible to users)
- No toast notifications or error dialogs

**Workaround:**
- Check browser console (F12) for error messages
- Check file system permissions if operations fail

**Planned Fix:** Toast notification system with error details (v0.9.7)

---

### 7. Blender Setup Delay on First Launch

**Status:** ⚠️ Known limitation

**Issue:**
First launch of a Blender project takes 10-15 seconds due to background setup process.

**What Happens:**
1. Blender launches in background mode
2. Python script configures relative paths
3. File is saved
4. Background process is killed
5. Blender opens file in UI mode

**Impact:**
- Long wait on first launch (looks like app is frozen)
- No progress indicator

**Subsequent Launches:**
- Instant (file already exists)

**Workaround:**
- Be patient on first launch (wait 10-15s)
- Check task manager - Blender process should appear

---

## 🟡 LOW PRIORITY ISSUES

### 8. MDXEditor Performance in Large Notes

**Status:** ✅ Partially optimized

**Issue:**
Editing very large notes (>5000 words) with many formatting elements can become slow.

**Cause:**
- MDXEditor plugins recreated on every render (now fixed with useMemo)
- Large documents require more processing

**Mitigation Applied:**
```typescript
const plugins = useMemo(() => [/* ... */], []); // Now memoized
```

**Remaining Impact:**
- Still slower than plain textarea for huge documents

**Workaround:**
- Keep notes reasonably sized
- Split large documentation into multiple notes

---

### 9. No Undo for Project Deletion

**Status:** ⚠️ By design (dangerous)

**Issue:**
Deleting a project permanently removes the entire folder from disk with no undo.

**Warning Shown:**
```
Delete project "[name]"?
This will permanently delete the entire project folder and all its contents.
This action cannot be undone.
```

**Workaround:**
- ALWAYS back up important projects before deletion
- Consider archiving instead of deleting
- Keep project files in version control (Git)

**Future Enhancement:** Move to Recycle Bin instead of permanent deletion

---

### 10. Shot Feature Incomplete

**Status:** 🟡 Beta feature

**Issue:**
The "Shots" feature for managing multiple shots per project is functional but has limitations:

**Limitations:**
- Can't reorder shots
- Can't rename shots after creation
- Shot numbers must be sequential
- No shot thumbnails

**Workaround:**
- Name shots carefully before creation
- Delete and recreate if naming is wrong

---

### 11. Russian Text Hardcoded in UI

**Status:** ⚠️ No i18n support yet

**Issue:**
Some UI text is hardcoded in Russian:
- "Все" (All)
- "Избр." (Favorites)
- "Архив" (Archive)

**Impact:**
- English-speaking users may be confused
- Can't switch languages

**Workaround:**
None currently. UI is partially Russian.

**Planned Fix:** Full i18n with English/Russian/other languages (v1.0.0)

---

## 🐛 Minor Bugs

### 12. Thumbnail Cache Sometimes Shows Stale Images

**Frequency:** Rare
**Impact:** Low

**Issue:**
Occasionally, old thumbnail may display even after setting a new one.

**Cause:**
- Timestamp cache invalidation not always working
- Browser cache interference

**Workaround:**
```typescript
// Thumbnails now include timestamp to force refresh
.thumbnail_1697123456789.png
```
If issue persists:
1. Close and reopen project
2. Clear browser cache

---

### 13. Empty "Links" Section Still Shows Input

**Frequency:** Always
**Impact:** Cosmetic

**Issue:**
Even when no links exist, the "Add link" input is always visible.

**Expected Behavior:**
Could show empty state first, then input appears on click.

**Current Behavior:**
Input always visible.

**Impact:** Minor UI clutter, not a blocker.

---

## 📋 Limitations by Design

### Windows-Only Features

Some features are Windows-specific due to Tauri backend:
- ✅ Full featured on Windows 10/11
- ⚠️ macOS support partial (not tested)
- ⚠️ Linux support partial (not tested)

### File System Requirements

- ⚠️ Projects must be on local drive (network drives untested)
- ⚠️ Path must not contain special characters: `<>:"|?*`
- ⚠️ Requires write permissions to project directory

### Software Requirements

- ✅ Blender: Full support
- ✅ Houdini: Full support
- ✅ After Effects: Full support (template included)
- ⚠️ Maya, Cinema 4D, ZBrush: Basic support (folder structure only)
- ❌ Other software: Not supported yet

---

## 🔧 Troubleshooting

### Application Won't Start

**Symptoms:**
- Black screen
- Immediate crash
- Error dialog

**Possible Causes:**
1. Corrupted config file
2. Missing dependencies
3. File watcher crashed (should be fixed in v0.9.6)

**Solution:**
1. Delete config: `%APPDATA%/nullSpace/`
2. Restart application
3. Reconfigure software paths

---

### Project Won't Open

**Symptoms:**
- Click project, nothing happens
- Error in console

**Possible Causes:**
1. Missing `.project-metadata.json`
2. Corrupted JSON
3. Project folder moved/deleted

**Solution:**
1. Check if project folder exists
2. Verify `.project-metadata.json` is valid JSON
3. If corrupted, remove project from list and recreate

---

### Thumbnail Won't Load

**Symptoms:**
- Gray placeholder instead of image
- "Failed to load" error in console

**Possible Causes:**
1. Image file moved/deleted
2. Cache corruption
3. File format not supported

**Solution:**
1. Re-set thumbnail from project details
2. Clear cache (DevTools → Application → IndexedDB)
3. Use supported formats: JPG, PNG, WebP

---

## 📊 Known Technical Debt

See [CODE_AUDIT_REPORT.md](CODE_AUDIT_REPORT.md) for comprehensive list of 24 identified issues.

**High-Priority Items:**
1. File watcher rewrite (critical)
2. Race condition fix (high)
3. Virtual scrolling (high)
4. Input validation (high)
5. Error notification system (medium)

---

## 🔮 Planned Fixes by Version

### v0.9.7 (Next Release)
- ✅ File watcher properly implemented
- ✅ Virtual scrolling for project list
- ✅ Toast notification system
- ✅ Better error handling

### v1.0.0 (Stable Release)
- ✅ All critical issues resolved
- ✅ Full test coverage
- ✅ Software auto-detection
- ✅ i18n support (English/Russian)
- ✅ Comprehensive documentation

### v1.1.0 (Feature Release)
- ✅ Shot management improvements
- ✅ Plugin system
- ✅ Cloud sync option
- ✅ Team collaboration

---

## 📝 Reporting New Issues

Found a bug not listed here?

1. Check if issue is already documented
2. Try the workarounds listed above
3. Check browser console for error messages
4. Report issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Console logs

---

## ℹ️ Additional Resources

- [README.md](README.md) - Project overview and setup
- [CODE_AUDIT_REPORT.md](CODE_AUDIT_REPORT.md) - Detailed technical audit
- [DEVELOPMENT_HISTORY.md](DEVELOPMENT_HISTORY.md) - Development timeline and changes

---

**Document Version:** 1.0
**Last Updated:** 2025-10-12
**Next Review:** After v0.9.7 release
