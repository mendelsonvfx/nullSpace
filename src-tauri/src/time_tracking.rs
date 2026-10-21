use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use parking_lot::Mutex;
use chrono::{DateTime, Utc};
use lazy_static::lazy_static;
use sysinfo::{System, Pid};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{GetWindowThreadProcessId, EnumWindows, IsWindowVisible};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HWND, BOOL, LPARAM};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSession {
    pub entry_id: String,
    pub project_id: String,
    pub project_path: String,
    pub shot_id: Option<String>,
    pub software: String,
    pub pid: u32,
    pub start_time: DateTime<Utc>,
    pub last_activity_time: DateTime<Utc>,
    pub last_cpu_check: DateTime<Utc>,
    pub software_minutes: u32,               // Minutes counted for SOFTWARE stats (focused only)
    pub is_paused: bool,
    pub paused_at: Option<DateTime<Utc>>,
    pub paused_minutes: u32,
    pub process_alive: bool,
    pub last_cpu_usage: f32,
    pub last_input_time: DateTime<Utc>,    // Last time user interacted with this window
    pub window_disappeared_at: Option<DateTime<Utc>>,  // When window disappeared (for adaptive grace period)
}

/// Single focus check entry
#[derive(Clone, Debug)]
struct FocusCheck {
    timestamp: u64,
    focused: bool,
}

/// Focus history for a session (stores last 60 seconds of checks)
struct FocusHistory {
    checks: VecDeque<FocusCheck>,
    max_history_seconds: u64,
}

impl FocusHistory {
    fn new() -> Self {
        Self {
            checks: VecDeque::with_capacity(60), // 60 seconds × ~1 check/second
            max_history_seconds: 60,
        }
    }

    /// Add a new focus check and clean up old entries
    fn add_check(&mut self, focused: bool) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Remove checks older than 60 seconds
        let cutoff = now.saturating_sub(self.max_history_seconds);
        while let Some(check) = self.checks.front() {
            if check.timestamp < cutoff {
                self.checks.pop_front();
            } else {
                break;
            }
        }

        // Add new check
        self.checks.push_back(FocusCheck { timestamp: now, focused });
    }

    /// Get number of seconds the window was focused in the last 60 seconds
    fn get_focused_seconds(&self) -> u64 {
        // Each check represents ~1 second
        self.checks.iter().filter(|c| c.focused).count() as u64
    }
}

lazy_static! {
    static ref ACTIVE_SESSIONS: Arc<Mutex<HashMap<String, ActiveSession>>> =
        Arc::new(Mutex::new(HashMap::new()));
    static ref SYSTEM: Arc<Mutex<System>> = Arc::new(Mutex::new(System::new_all()));
    static ref BACKGROUND_TASK_RUNNING: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
    static ref FOCUS_HISTORIES: Arc<Mutex<HashMap<String, FocusHistory>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

/// Check if a process is alive
fn is_process_alive(pid: u32) -> bool {
    let mut system = SYSTEM.lock();
    system.refresh_processes();
    system.process(Pid::from_u32(pid)).is_some()
}

/// Get CPU usage for a process (returns percentage 0-100)
fn get_cpu_usage(pid: u32) -> f32 {
    let mut system = SYSTEM.lock();
    system.refresh_processes();

    if let Some(process) = system.process(Pid::from_u32(pid)) {
        process.cpu_usage()
    } else {
        0.0
    }
}

/// Check if a window with given PID is currently focused (Windows only)
#[cfg(target_os = "windows")]
fn is_window_focused(pid: u32) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    unsafe {
        let foreground_window = GetForegroundWindow();
        if foreground_window.0 == 0 {
            return false;
        }

        let mut window_pid: u32 = 0;
        GetWindowThreadProcessId(foreground_window, Some(&mut window_pid));

        window_pid == pid
    }
}

/// Fallback for non-Windows platforms (always return false for now)
#[cfg(not(target_os = "windows"))]
fn is_window_focused(_pid: u32) -> bool {
    false
}

/// Check if a process has any visible windows (Windows only)
#[cfg(target_os = "windows")]
fn has_visible_window(pid: u32) -> bool {
    unsafe {
        let has_window = false;
        let pid_to_find = pid;

        // Callback function for EnumWindows with enhanced visibility checks
        unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
            use windows::Win32::UI::WindowsAndMessaging::{
                GetWindowLongW, GetWindow, GetWindowRect, GWL_STYLE, GWL_EXSTYLE, GW_OWNER,
                WS_VISIBLE, WS_EX_TOOLWINDOW
            };
            use windows::Win32::Foundation::RECT;

            let result = lparam.0 as *mut (bool, u32, u32);
            let (has_window, pid_to_find, window_count) = &mut *result;

            // Check if window belongs to our process
            let mut window_pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut window_pid));
            if window_pid != *pid_to_find {
                return BOOL(1); // Continue - wrong process
            }

            // Basic visibility check
            if !IsWindowVisible(hwnd).as_bool() {
                return BOOL(1); // Continue - not visible
            }

            // ✅ CHECK 1: Window size must be > 10x10 pixels (excludes 0x0 ghost windows)
            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_ok() {
                let width = rect.right - rect.left;
                let height = rect.bottom - rect.top;
                if width <= 10 || height <= 10 {
                    return BOOL(1); // Continue - too small
                }
            }

            // ✅ CHECK 2: Window style checks
            let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;

            // Must have WS_VISIBLE flag
            if (style & WS_VISIBLE.0) == 0 {
                return BOOL(1); // Continue - not actually visible
            }

            // Must NOT be a tool window (excludes helper/service windows)
            if (ex_style & WS_EX_TOOLWINDOW.0) != 0 {
                return BOOL(1); // Continue - tool window
            }

            // ✅ CHECK 3: Window owner check (prefer main windows without owner)
            let owner = GetWindow(hwnd, GW_OWNER);
            if owner.0 != 0 {
                return BOOL(1); // Continue - has owner (likely child/dialog window)
            }

            // Found a valid visible window!
            *window_count += 1;
            *has_window = true;
            return BOOL(0); // Stop enumeration
        }

        let mut callback_data = (has_window, pid_to_find, 0u32);
        let lparam = LPARAM(&mut callback_data as *mut _ as isize);

        let _ = EnumWindows(Some(enum_window_callback), lparam);

        let result = callback_data.0;
        if !result {
            println!("[TimeTracking] PID {} has no visible windows (enhanced checks: size, style, owner)", pid);
        }
        result
    }
}

/// Fallback for non-Windows platforms (always return true for now)
#[cfg(not(target_os = "windows"))]
fn has_visible_window(_pid: u32) -> bool {
    true
}

/// Start time tracking for a session
#[tauri::command]
pub fn start_time_tracking(
    entry_id: String,
    project_id: String,
    project_path: String,
    shot_id: Option<String>,
    software: String,
    pid: u32,
) -> Result<(), String> {
    println!("[TimeTracking] start_time_tracking called:");
    println!("  entry_id: {}", entry_id);
    println!("  software: {}", software);
    println!("  pid: {}", pid);

    let now = Utc::now();

    let session = ActiveSession {
        entry_id: entry_id.clone(),
        project_id,
        project_path,
        shot_id,
        software: software.clone(),
        pid,
        start_time: now,
        last_activity_time: now,
        last_cpu_check: now,
        software_minutes: 0,
        is_paused: false,
        paused_at: None,
        paused_minutes: 0,
        process_alive: true,
        last_cpu_usage: 0.0,
        last_input_time: now,
        window_disappeared_at: None,  // Initialize - window is visible at start
    };

    let mut sessions = ACTIVE_SESSIONS.lock();
    sessions.insert(entry_id.clone(), session);

    println!("[TimeTracking] ✓ Session added to ACTIVE_SESSIONS. Total sessions: {}", sessions.len());
    drop(sessions);

    // Start background task if this is the first session
    start_background_task_if_needed();

    Ok(())
}

/// Stop time tracking for a session
#[tauri::command]
pub fn stop_time_tracking(entry_id: String) -> Result<u32, String> {
    // Clean up focus history
    let mut histories = FOCUS_HISTORIES.lock();
    histories.remove(&entry_id);
    drop(histories);

    let mut sessions = ACTIVE_SESSIONS.lock();

    match sessions.remove(&entry_id) {
        Some(session) => {
            println!("[TimeTracking] Stopped session {} and cleaned up focus history", entry_id);
            // Return SOFTWARE stats minutes (for personal statistics)
            Ok(session.software_minutes)
        }
        None => Err(format!("Session {} not found", entry_id))
    }
}

/// Pause time tracking for a session
#[tauri::command]
pub fn pause_time_tracking(entry_id: String) -> Result<(), String> {
    let mut sessions = ACTIVE_SESSIONS.lock();

    match sessions.get_mut(&entry_id) {
        Some(session) => {
            if !session.is_paused {
                session.is_paused = true;
                session.paused_at = Some(Utc::now());
            }
            Ok(())
        }
        None => Err(format!("Session {} not found", entry_id))
    }
}

/// Resume time tracking for a session
#[tauri::command]
pub fn resume_time_tracking(entry_id: String) -> Result<(), String> {
    let mut sessions = ACTIVE_SESSIONS.lock();

    match sessions.get_mut(&entry_id) {
        Some(session) => {
            if session.is_paused {
                if let Some(paused_at) = session.paused_at {
                    let paused_duration = Utc::now().signed_duration_since(paused_at);
                    session.paused_minutes += paused_duration.num_minutes() as u32;
                }
                session.is_paused = false;
                session.paused_at = None;
            }
            Ok(())
        }
        None => Err(format!("Session {} not found", entry_id))
    }
}

/// Get current active sessions
#[tauri::command]
pub fn get_active_sessions() -> Vec<ActiveSession> {
    let sessions = ACTIVE_SESSIONS.lock();
    let result: Vec<ActiveSession> = sessions.values()
        .filter(|s| s.process_alive)
        .cloned().collect();
    // Only log when there are active sessions
    if !result.is_empty() {
        println!("[TimeTracking] get_active_sessions returning {} sessions:", result.len());
        for session in &result {
            println!("  - entry_id: {}, software: {}, pid: {}", session.entry_id, session.software, session.pid);
        }
    }
    result
}

/// Check if window for given entry is focused (for SOFTWARE stats)
#[tauri::command]
pub fn is_session_focused(entry_id: String) -> Result<bool, String> {
    let sessions = ACTIVE_SESSIONS.lock();

    match sessions.get(&entry_id) {
        Some(session) => {
            if !session.process_alive {
                return Ok(false);
            }
            let is_focused = is_window_focused(session.pid);
            Ok(is_focused)
        }
        None => Err(format!("Session {} not found", entry_id))
    }
}

/// Increment SOFTWARE stats for a session (called from frontend when focused)
#[tauri::command]
pub fn increment_software_stats(entry_id: String) -> Result<(), String> {
    let mut sessions = ACTIVE_SESSIONS.lock();

    match sessions.get_mut(&entry_id) {
        Some(session) => {
            session.software_minutes += 1;
            println!("[TimeTracking] Incremented SOFTWARE stats for {}: {}m", entry_id, session.software_minutes);
            Ok(())
        }
        None => Err(format!("Session {} not found", entry_id))
    }
}

/// Background task to check active windows and CPU usage
pub fn check_active_windows() {
    let now = Utc::now();
    let mut sessions = ACTIVE_SESSIONS.lock();

    if !sessions.is_empty() {
        println!("[TimeTracking] Checking {} active sessions", sessions.len());
    }

    // First pass: update activity status for all sessions
    for (entry_id, session) in sessions.iter_mut() {
        println!("[TimeTracking] Checking session {} (PID: {}, software: {})", entry_id, session.pid, session.software);

        // Check if process is alive
        if !is_process_alive(session.pid) {
            if session.process_alive {
                println!("[TimeTracking] Process {} died, marking session {} as dead", session.pid, entry_id);
                session.process_alive = false;
                session.last_cpu_check = now;  // Prevent counting extra time on next minute mark
                session.window_disappeared_at = None;  // Clean up stale state
            }
            continue;
        }

        // Check if process has any visible windows (not in background)
        // Adaptive grace period:
        // - Young sessions: startup grace (30 sec for slow apps like After Effects, longer for UE's splash-only shader compile)
        // - Mature sessions: 5 sec grace period (quick detection after window closes)
        let session_age = now.signed_duration_since(session.start_time);
        let startup_grace = startup_grace_seconds(&session.software);
        let is_young_session = session_age.num_seconds() < startup_grace + 30;
        let grace_period_seconds = if is_young_session { startup_grace } else { 5 };

        let has_window = has_visible_window(session.pid);

        if !has_window {
            // Window disappeared - track when it disappeared
            if session.window_disappeared_at.is_none() {
                session.window_disappeared_at = Some(now);
                println!("[TimeTracking] PID {} window disappeared, starting {} sec grace period (session age: {} sec)",
                    session.pid, grace_period_seconds, session_age.num_seconds());
            }

            // Check if grace period expired
            if let Some(disappeared_at) = session.window_disappeared_at {
                let disappeared_duration = now.signed_duration_since(disappeared_at);

                if disappeared_duration.num_seconds() >= grace_period_seconds {
                    if session.process_alive {
                        println!("[TimeTracking] Grace period expired for PID {} ({}s), marking session {} as dead",
                            session.pid, grace_period_seconds, entry_id);
                        session.process_alive = false;
                        session.last_cpu_check = now;
                    }
                } else if session.process_alive {
                    println!("[TimeTracking] PID {} no window, in grace period ({}/{}s)",
                        session.pid, disappeared_duration.num_seconds(), grace_period_seconds);
                }
            }
            continue;
        }

        // Window is visible - reset disappearance tracking
        if session.window_disappeared_at.is_some() {
            println!("[TimeTracking] PID {} window reappeared, resetting grace period", session.pid);
            session.window_disappeared_at = None;

            // Restore process_alive ONLY if process is verified alive in system
            // This prevents resurrecting zombie sessions with orphaned window handles
            if !session.process_alive && is_process_alive(session.pid) {
                println!("[TimeTracking] PID {} process_alive restored to true (verified)", session.pid);
                session.process_alive = true;
            }
        }

        // Skip paused sessions for time counting
        if session.is_paused {
            continue;
        }

        // Get current CPU usage
        let cpu_usage = get_cpu_usage(session.pid);
        session.last_cpu_usage = cpu_usage;

        // Check if window is focused
        let is_focused = is_window_focused(session.pid);
        if is_focused {
            session.last_input_time = now;
        }

        // Record focus check in history
        let mut histories = FOCUS_HISTORIES.lock();
        histories
            .entry(entry_id.clone())
            .or_insert_with(FocusHistory::new)
            .add_check(is_focused);
        drop(histories);

        // Consider process active if:
        // 1. Window is focused (user is interacting) OR
        // 2. CPU usage > 0.5% (process is doing work in background)
        let is_active = is_focused || cpu_usage > 0.5;

        println!("[TimeTracking] PID {} - focused: {}, CPU: {:.1}%, is_active: {}", session.pid, is_focused, cpu_usage, is_active);

        if is_active {
            session.last_activity_time = now;
        }

        // Check if process hasn't been active for 30 minutes - mark as inactive
        let inactive_duration = now.signed_duration_since(session.last_activity_time);
        if inactive_duration.num_minutes() >= 30 {
            if session.process_alive {
                println!("[TimeTracking] Session {} inactive for 30 minutes (CPU: {:.1}%), marking as dead", entry_id, cpu_usage);
                session.process_alive = false;
                session.last_cpu_check = now;  // Prevent counting extra time on next minute mark
                session.window_disappeared_at = None;  // Clean up stale state
            }
        }
    }

    // SOFTWARE stats are now counted by frontend (InlineTimer)
    // Backend only tracks process status (alive/dead, paused/active)

    // Clean up dead sessions after 5 minutes to avoid memory leak
    let sessions_to_remove: Vec<String> = sessions
        .iter()
        .filter(|(_, session)| {
            !session.process_alive &&
            now.signed_duration_since(session.start_time).num_minutes() > 5
        })
        .map(|(entry_id, _)| entry_id.clone())
        .collect();

    for entry_id in sessions_to_remove {
        println!("[TimeTracking] Removing dead session: {}", entry_id);
        sessions.remove(&entry_id);

        // Clean up focus history for removed session
        let mut histories = FOCUS_HISTORIES.lock();
        histories.remove(&entry_id);
        drop(histories);
    }
}

/// Start background task (only if not already running)
fn start_background_task_if_needed() {
    use std::thread;
    use std::time::Duration;

    let mut is_running = BACKGROUND_TASK_RUNNING.lock();

    if *is_running {
        return; // Already running
    }

    thread::spawn(|| {
        loop {
            thread::sleep(Duration::from_secs(1));

            // Check if there are any active sessions
            let sessions = ACTIVE_SESSIONS.lock();
            let has_sessions = !sessions.is_empty();
            drop(sessions);

            if !has_sessions {
                // No more sessions, stop the background task
                let mut is_running = BACKGROUND_TASK_RUNNING.lock();
                *is_running = false;
                println!("[TimeTracking] Background task stopped (no active sessions)");
                break;
            }

            check_active_windows();
        }
    });

    *is_running = true;
    println!("[TimeTracking] Background task started");
}

/// Tauri command to check if a process is alive
#[tauri::command]
pub fn check_process_alive(pid: u32) -> bool {
    is_process_alive(pid)
}

/// Process name fragments for software whose executables don't match its key
fn software_process_patterns(software: &str) -> Vec<&'static str> {
    match software.to_lowercase().as_str() {
        "houdini" => vec!["houdin", "hindie", "happrentice"],  // houdinifx.exe, houdini.exe, hindie.steam.exe, happrentice.exe
        "unreal" | "unreal engine" => vec!["unrealeditor", "ue4editor"],  // UnrealEditor.exe (UE5), UE4Editor.exe
        "cinema4d" | "cinema 4d" => vec!["cinema 4d"],  // "Cinema 4D.exe" — the key has no space, the process name does
        // "Adobe Substance 3D Painter.exe" / older "Substance Painter.exe"
        "substance" | "substance painter" => vec!["substance 3d painter", "substance painter"],
        "davinci" | "davinci resolve" => vec!["resolve.exe"],  // Resolve.exe; ".exe" keeps other "resolve" processes out
        _ => vec![],
    }
}

/// How long a fresh session may have no main window (splash-only startup).
/// UE shows only a splash screen while compiling shaders on first open, which can take many minutes.
fn startup_grace_seconds(software: &str) -> i64 {
    match software.to_lowercase().as_str() {
        "unreal" | "unreal engine" => 900,
        // First launch waits for the Maxon license before showing a window
        "cinema4d" | "cinema 4d" => 120,
        // Splash-only loading takes 20-40 s
        "substance" | "substance painter" => 60,
        // Splash while the project database and plugins load
        "davinci" | "davinci resolve" => 90,
        _ => 30,
    }
}

/// Tauri command to check if a process is alive AND belongs to the expected software.
/// Prevents false positives from PID reuse after system restart.
#[tauri::command]
pub fn check_process_alive_for_software(pid: u32, software: String) -> bool {
    if software.is_empty() {
        return is_process_alive(pid);
    }
    let mut system = SYSTEM.lock();
    system.refresh_processes();
    if let Some(process) = system.process(Pid::from_u32(pid)) {
        let process_name = process.name().to_lowercase();
        let software_lower = software.to_lowercase();
        let base_name = software_lower.trim_end_matches(".exe");
        software_process_patterns(base_name).iter().any(|p| process_name.contains(p))
            || process_name == base_name
            || process_name == format!("{}.exe", base_name)
            || process_name.contains(base_name)
    } else {
        false
    }
}

/// Tauri command to get full session status from backend (includes window detection)
#[tauri::command]
pub fn get_session_status(entry_id: String) -> Result<ActiveSession, String> {
    let sessions = ACTIVE_SESSIONS.lock();
    sessions.get(&entry_id)
        .cloned()
        .ok_or_else(|| format!("Session {} not found", entry_id))
}

/// Tauri command to update session PID after migration
#[tauri::command]
pub fn update_session_pid(entry_id: String, new_pid: u32) -> Result<(), String> {
    let mut sessions = ACTIVE_SESSIONS.lock();
    match sessions.get_mut(&entry_id) {
        Some(session) => {
            println!("[TimeTracking] 🔄 Migrating session {} PID: {} -> {}", entry_id, session.pid, new_pid);
            session.pid = new_pid;
            session.process_alive = true;
            session.window_disappeared_at = None;  // Reset grace period
            Ok(())
        }
        None => Err(format!("Session {} not found", entry_id))
    }
}

/// Find all child processes of a given parent PID
fn find_child_processes(parent_pid: u32) -> Vec<u32> {
    let mut system = SYSTEM.lock();
    system.refresh_processes();

    let mut children = Vec::new();
    let parent_pid_sys = Pid::from_u32(parent_pid);

    for (pid, process) in system.processes() {
        if let Some(process_parent) = process.parent() {
            if process_parent == parent_pid_sys {
                children.push(pid.as_u32());
            }
        }
    }

    println!("[TimeTracking] Found {} child processes for PID {}", children.len(), parent_pid);
    children
}

/// Find a process by name among children of a parent PID
fn find_process_by_name_and_parent(name: &str, parent_pid: u32) -> Option<u32> {
    let children = find_child_processes(parent_pid);
    let mut system = SYSTEM.lock();
    system.refresh_processes();

    let name_lower = name.to_lowercase();

    // Software with multiple executables; empty vec means use default name matching
    let patterns = software_process_patterns(&name_lower);

    for child_pid in children {
        if let Some(process) = system.process(Pid::from_u32(child_pid)) {
            let process_name = process.name().to_lowercase();

            // If we have specific patterns, check them first
            if !patterns.is_empty() {
                if patterns.iter().any(|p| process_name.contains(p)) {
                    println!("[TimeTracking] Found child process '{}' with PID {} (matched pattern)", process.name(), child_pid);
                    return Some(child_pid);
                }
            }

            // Default matching: exact name, name.exe, or contains
            if process_name == name_lower ||
               process_name == format!("{}.exe", name_lower) ||
               process_name.contains(&name_lower) {
                println!("[TimeTracking] Found child process '{}' with PID {}", process.name(), child_pid);
                return Some(child_pid);
            }
        }
    }

    None
}

/// Attempt to migrate to a child process when the parent process dies
/// This handles launcher-based applications like Blender, Adobe apps, etc.
fn migrate_to_child_process_internal(old_pid: u32, software_name: &str) -> Option<u32> {
    println!("[TimeTracking] Attempting to migrate PID {} for '{}'", old_pid, software_name);

    // Extract the base name (remove .exe if present)
    let base_name = software_name
        .to_lowercase()
        .trim_end_matches(".exe")
        .to_string();

    // Try to find a child process matching the software name
    if let Some(child_pid) = find_process_by_name_and_parent(&base_name, old_pid) {
        println!("[TimeTracking] ✅ Successfully migrated to child PID {}", child_pid);
        return Some(child_pid);
    }

    // FALLBACK: For Steam launchers, the real process may not be a direct child
    // Try to find ANY recently started process matching the software patterns
    println!("[TimeTracking] No child found, trying global process search...");
    if let Some(pid) = find_recent_process_by_name(&base_name) {
        println!("[TimeTracking] ✅ Found process via global search: PID {}", pid);
        return Some(pid);
    }

    println!("[TimeTracking] ❌ No process found for migration");
    None
}

/// Find a recently started process by name (global search, not just children)
/// Used as fallback for Steam launchers where the app isn't a direct child
fn find_recent_process_by_name(software_name: &str) -> Option<u32> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let mut system = SYSTEM.lock();
    system.refresh_processes();

    let name_lower = software_name.to_lowercase();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

    let patterns = software_process_patterns(&name_lower);

    let mut candidates: Vec<(u32, u64)> = Vec::new();

    for (pid, process) in system.processes() {
        let proc_name = process.name().to_lowercase();
        let start_time = process.start_time();

        // Check if started recently (within last 30 seconds)
        let is_recent = if let Some(age) = now.checked_sub(start_time) {
            age < 30
        } else {
            start_time.saturating_sub(now) < 5  // Clock skew tolerance
        };

        if !is_recent {
            continue;
        }

        // Check patterns first (for software with multiple executables like Houdini)
        if !patterns.is_empty() && patterns.iter().any(|p| proc_name.contains(p)) {
            println!("[TimeTracking] Global search found: {} (PID: {}, pattern match)", process.name(), pid.as_u32());
            candidates.push((pid.as_u32(), start_time));
            continue;
        }

        // Default name matching
        if proc_name.contains(&name_lower) {
            println!("[TimeTracking] Global search found: {} (PID: {}, name match)", process.name(), pid.as_u32());
            candidates.push((pid.as_u32(), start_time));
        }
    }

    // Return the newest matching process
    candidates.iter()
        .max_by_key(|(_, st)| st)
        .map(|(pid, _)| *pid)
}

/// Tauri command to migrate to a child process
#[tauri::command]
pub fn migrate_to_child_process(old_pid: u32, software_name: String) -> Option<u32> {
    migrate_to_child_process_internal(old_pid, &software_name)
}

/// Get focus summary for a session (how many seconds focused in last 60 seconds)
#[derive(Serialize)]
pub struct FocusSummary {
    pub focused_seconds: u64,
    pub total_checks: usize,
}

#[tauri::command]
pub fn get_focus_summary(entry_id: String) -> Result<FocusSummary, String> {
    let histories = FOCUS_HISTORIES.lock();

    match histories.get(&entry_id) {
        Some(history) => {
            Ok(FocusSummary {
                focused_seconds: history.get_focused_seconds(),
                total_checks: history.checks.len(),
            })
        }
        None => {
            // No history yet (session just started)
            Ok(FocusSummary {
                focused_seconds: 0,
                total_checks: 0,
            })
        }
    }
}
