# 🔧 File Watcher Implementation Plan

**Date**: 2025-10-12
**Status**: PENDING IMPLEMENTATION
**Priority**: HIGH (ФАЗА 1 - Task 2)

---

## 📋 Current Status

**File Watcher**: ❌ DISABLED (due to infinite loop bug)
**Location**: [src-tauri/src/main.rs:1200-1282](src-tauri/src/main.rs#L1200-L1282)

---

## 🚨 Problem Summary

The current file watcher implementation has a **critical infinite loop bug**:

```rust
// ❌ BUG: This loop never exits!
loop {
    std::thread::sleep(Duration::from_secs(1));
}
```

**Issues:**
1. **Memory Leak**: Each project switch creates new thread that never stops
2. **No Cleanup**: No way to stop old watchers
3. **System Freeze**: Accumulating threads exhaust system resources
4. **No Graceful Shutdown**: Can't stop watcher on project close

---

## ✅ Proper Implementation Requirements

### 1. Dependencies to Add

Update `src-tauri/Cargo.toml`:

```toml
[dependencies]
# ... existing dependencies ...
notify-debouncer-mini = "0.4"  # File watching
lazy_static = "1.4"            # Static global state
parking_lot = "0.12"           # Better mutexes
```

### 2. Architecture Design

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React)                                        │
│  - invoke('start_watching_project', { projectPath })    │
│  - invoke('stop_watching_project')                      │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  Rust Backend (Tauri Commands)                          │
│                                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │  Global State (lazy_static)                 │        │
│  │  - WATCHER_HANDLE: Option<WatcherHandle>    │        │
│  │  - SHUTDOWN_SIGNAL: Arc<AtomicBool>         │        │
│  └─────────────────────────────────────────────┘        │
│                                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │  start_watching_project()                   │        │
│  │  1. Stop old watcher (if exists)            │        │
│  │  2. Create new shutdown signal              │        │
│  │  3. Spawn watcher thread                    │        │
│  │  4. Store handle globally                   │        │
│  └─────────────────────────────────────────────┘        │
│                                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │  Watcher Thread                             │        │
│  │  - Setup notify_debouncer                   │        │
│  │  - Loop with shutdown check                 │        │
│  │  - Emit events to frontend                  │        │
│  │  - Clean exit on shutdown signal            │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### 3. Global State Management

```rust
use lazy_static::lazy_static;
use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;

struct WatcherHandle {
    thread: Option<JoinHandle<()>>,
    shutdown: Arc<AtomicBool>,
}

lazy_static! {
    static ref WATCHER_HANDLE: Mutex<Option<WatcherHandle>> = Mutex::new(None);
}
```

**Benefits:**
- **Single Watcher Instance**: Only one watcher at a time
- **Graceful Shutdown**: Can signal thread to stop cleanly
- **Thread Safety**: Mutex protects access to global state
- **Memory Safe**: Old threads properly joined before creating new ones

### 4. Implementation Steps

#### Step 1: Add Dependencies
```toml
notify-debouncer-mini = "0.4"
lazy_static = "1.4"
parking_lot = "0.12"
```

#### Step 2: Add Global State
```rust
use lazy_static::lazy_static;
use parking_lot::Mutex;
use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebounceEventResult};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;
use std::time::Duration;

struct WatcherHandle {
    thread: Option<JoinHandle<()>>,
    shutdown: Arc<AtomicBool>,
}

lazy_static! {
    static ref WATCHER_HANDLE: Mutex<Option<WatcherHandle>> = Mutex::new(None);
}
```

#### Step 3: Implement start_watching_project
```rust
#[tauri::command]
async fn start_watching_project(
    app_handle: tauri::AppHandle,
    project_path: String,
) -> Result<(), String> {
    println!("Starting file watcher for: {}", project_path);

    // Stop old watcher if exists
    stop_watching_project().await?;

    let project_dir = PathBuf::from(&project_path);
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Cinema4D",
        "Substance", "Unreal", "Unity", "ZBrush", "Marmoset"
    ];

    // Create shutdown signal
    let shutdown = Arc::new(AtomicBool::new(false));
    let shutdown_clone = shutdown.clone();

    // Spawn watcher thread
    let app = app_handle.clone();
    let project_path_clone = project_path.clone();

    let thread = std::thread::spawn(move || {
        println!("📁 File watcher thread started");

        // Create debouncer
        let mut debouncer = match new_debouncer(
            Duration::from_millis(500),
            move |res: DebounceEventResult| {
                match res {
                    Ok(events) => {
                        for event in events {
                            if let Some(path) = event.path.to_str() {
                                // Check if it's a version file (not .blend1)
                                if path.contains("_v") && !path.ends_with(".blend1") {
                                    println!("Version file changed: {}", path);

                                    // Clean up backup files
                                    let _ = std::process::Command::new("cmd")
                                        .args(&["/C", &format!("del /S /Q \"{}\\*.blend1\"", project_path_clone)])
                                        .output();

                                    // Emit event to frontend
                                    let _ = app.emit_all("version-changed", ());
                                }
                            }
                        }
                    }
                    Err(e) => println!("Watch error: {:?}", e),
                }
            },
        ) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("Failed to create debouncer: {}", e);
                return;
            }
        };

        // Watch each software folder
        for software_folder in software_folders {
            let software_dir = project_dir.join(software_folder);
            if software_dir.exists() {
                if let Err(e) = debouncer.watcher().watch(&software_dir, RecursiveMode::Recursive) {
                    eprintln!("Failed to watch {}: {}", software_folder, e);
                } else {
                    println!("Watching: {:?}", software_dir);
                }
            }
        }

        // ✅ FIXED: Loop with shutdown check
        while !shutdown_clone.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(100));
        }

        println!("📁 File watcher thread stopped gracefully");
    });

    // Store handle globally
    let mut handle = WATCHER_HANDLE.lock();
    *handle = Some(WatcherHandle {
        thread: Some(thread),
        shutdown,
    });

    println!("✅ File watcher started successfully");
    Ok(())
}
```

#### Step 4: Implement stop_watching_project
```rust
#[tauri::command]
async fn stop_watching_project() -> Result<(), String> {
    println!("Stopping file watcher...");

    let mut handle_guard = WATCHER_HANDLE.lock();

    if let Some(mut handle) = handle_guard.take() {
        // Signal shutdown
        handle.shutdown.store(true, Ordering::Relaxed);

        // Wait for thread to finish (with timeout)
        if let Some(thread) = handle.thread.take() {
            // Give thread 2 seconds to finish
            let timeout = Duration::from_secs(2);
            let start = std::time::Instant::now();

            loop {
                if thread.is_finished() {
                    let _ = thread.join();
                    println!("✅ File watcher stopped successfully");
                    break;
                }

                if start.elapsed() > timeout {
                    println!("⚠️  File watcher thread timeout (force dropping)");
                    break;
                }

                std::thread::sleep(Duration::from_millis(100));
            }
        }
    } else {
        println!("ℹ️  No file watcher running");
    }

    Ok(())
}
```

#### Step 5: Re-enable in App.tsx

Update [src/App.tsx:126-140](src/App.tsx#L126-L140):

```typescript
// Load all versions and start watcher when project changes
useEffect(() => {
  loadVersions();

  // ✅ RE-ENABLED: File watcher now has proper shutdown mechanism
  invoke('start_watching_project', {
    projectPath: project.path
  }).catch((err) => {
    console.error('Failed to start watching project:', err);
  });

  // Cleanup watcher on unmount
  return () => {
    invoke('stop_watching_project').catch((err) => {
      console.error('Failed to stop watching project:', err);
    });
  };
}, [project.path]);
```

---

## 🧪 Testing Plan

### Unit Tests (Future)
- [ ] Test shutdown signal properly stops thread
- [ ] Test multiple start/stop cycles
- [ ] Test concurrent start calls
- [ ] Test memory leak (thread count)

### Manual Testing
1. **Basic Functionality**
   - [ ] Start app, open project
   - [ ] Create new blend file
   - [ ] Verify version-changed event fires
   - [ ] Backup files (.blend1) cleaned up

2. **Project Switching**
   - [ ] Open Project A
   - [ ] Switch to Project B
   - [ ] Verify only 1 watcher thread exists
   - [ ] Verify old watcher stopped

3. **Rapid Switching**
   - [ ] Rapidly switch between 5 projects
   - [ ] Check task manager for thread count
   - [ ] Verify no memory leak

4. **Graceful Shutdown**
   - [ ] Open project
   - [ ] Close project details
   - [ ] Verify watcher stops
   - [ ] No zombie threads

---

## 📊 Expected Impact

### Before Fix:
```
Project switches: 10
Active threads:   10+ (zombie threads)
Memory usage:     ⬆️ Continuously increasing
System stability: ❌ Freeze after ~15 switches
```

### After Fix:
```
Project switches: 100
Active threads:   1 (always one watcher)
Memory usage:     ✅ Stable
System stability: ✅ No freezes
```

---

## ⚠️ Potential Issues & Mitigations

### Issue 1: Thread not stopping in time
**Mitigation**: Add timeout to stop_watching_project (2 seconds max)

### Issue 2: Events missed during shutdown
**Mitigation**: Acceptable - user switching projects anyway

### Issue 3: Multiple rapid start/stop calls
**Mitigation**: Mutex prevents concurrent access

### Issue 4: Thread panic
**Mitigation**: Catch panics in thread, log error, clean up

---

## 🚀 Implementation Timeline

1. **Add dependencies** (5 min)
   - Update Cargo.toml
   - Run `cargo build` to fetch deps

2. **Implement global state** (10 min)
   - Add lazy_static setup
   - Define WatcherHandle struct

3. **Implement start_watching_project** (20 min)
   - Port old logic
   - Add shutdown check loop
   - Store handle globally

4. **Implement stop_watching_project** (15 min)
   - Signal shutdown
   - Join thread with timeout

5. **Update App.tsx** (5 min)
   - Re-enable file watcher

6. **Testing** (30 min)
   - Basic functionality
   - Project switching
   - Memory leak check

**Total Estimated Time**: ~1.5 hours

---

## 📝 Alternative Approaches (Considered)

### Option 1: Event-Driven with tokio
```rust
tokio::select! {
    event = watcher_rx.recv() => handle_event(event),
    _ = shutdown_rx.recv() => break,
}
```
**Pros**: More idiomatic async Rust
**Cons**: Requires refactoring to tokio runtime

### Option 2: Channel-Based Communication
```rust
let (tx, rx) = channel();
tx.send(WatcherCommand::Stop);
```
**Pros**: Cleaner separation of concerns
**Cons**: More complex, overhead of channels

### Option 3: Single Global Watcher for All Projects
```rust
// Watch all software folders globally
// Filter events by project path
```
**Pros**: Only one thread ever
**Cons**: Complex filtering logic, harder to maintain

**Decision**: Use **Arc<AtomicBool>** (simplest, most direct)

---

## 🔗 Related Files

- [src-tauri/src/main.rs](src-tauri/src/main.rs) - File watcher implementation
- [src/App.tsx](src/App.tsx) - Frontend integration
- [CRITICAL_FREEZE_FIX_REPORT.md](CRITICAL_FREEZE_FIX_REPORT.md) - Original bug report
- [ZUSTAND_RACE_CONDITION_FIX.md](ZUSTAND_RACE_CONDITION_FIX.md) - Related fix

---

**Status**: Ready for implementation
**Next Action**: Add dependencies to Cargo.toml and begin implementation
