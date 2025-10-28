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

        // Callback function for EnumWindows
        unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let result = lparam.0 as *mut (bool, u32, u32);
            let (has_window, pid_to_find, window_count) = &mut *result;

            // Check if window is visible
            if IsWindowVisible(hwnd).as_bool() {
                let mut window_pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut window_pid));

                if window_pid == *pid_to_find {
                    *window_count += 1;
                    *has_window = true;
                    return BOOL(0); // Stop enumeration
                }
            }

            BOOL(1) // Continue enumeration
        }

        let mut callback_data = (has_window, pid_to_find, 0u32);
        let lparam = LPARAM(&mut callback_data as *mut _ as isize);

        let _ = EnumWindows(Some(enum_window_callback), lparam);

        let result = callback_data.0;
        if !result {
            println!("[TimeTracking] PID {} has no visible windows", pid);
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
    let result: Vec<ActiveSession> = sessions.values().cloned().collect();
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
                // Reset last_cpu_check to prevent counting extra time on next minute mark
                session.last_cpu_check = now;
            }
            continue;
        }

        // Check if process has any visible windows (not in background)
        // Give new processes 30 seconds to open a window (grace period for slow-starting apps like After Effects)
        let session_age = now.signed_duration_since(session.start_time);
        let in_grace_period = session_age.num_seconds() < 30;

        let has_window = has_visible_window(session.pid);
        println!("[TimeTracking] PID {} has_visible_window: {}, in_grace_period: {}", session.pid, has_window, in_grace_period);

        if !has_window {
            if session.process_alive && !in_grace_period {
                println!("[TimeTracking] Process {} has no visible windows (background) after grace period, marking session {} as dead", session.pid, entry_id);
                session.process_alive = false;
                // Reset last_cpu_check to prevent counting extra time on next minute mark
                session.last_cpu_check = now;
            } else {
                println!("[TimeTracking] PID {} has no window but in grace period, skipping", session.pid);
            }
            continue;
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
                // Reset last_cpu_check to prevent counting extra time on next minute mark
                session.last_cpu_check = now;
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
