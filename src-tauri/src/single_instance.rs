//! One nullSpace at a time: a second launch brings the running window to the front and exits.
//! Every copy works with the same projects, so two of them would overwrite each other's data.
//!
//! The running copy holds a named mutex for its whole life (Windows releases it on any exit, crashes
//! included) and marks its main window with a property. A second copy finds the window by that
//! property, not by title: an Explorer window of a folder named "nullSpace" has the same title.

/// Mutex and window property names. Dev builds get their own, so `tauri dev` runs next to the app
fn names(identifier: &str) -> (String, String) {
    let id = if cfg!(debug_assertions) { format!("{}.dev", identifier) } else { identifier.to_string() };
    (format!("Local\\{}.single-instance", id), format!("{}.main-window", id))
}

#[cfg(target_os = "windows")]
mod imp {
    use std::time::{Duration, Instant};
    use windows::core::{HRESULT, HSTRING};
    use windows::Win32::Foundation::{CloseHandle, GetLastError, BOOL, ERROR_ACCESS_DENIED, ERROR_ALREADY_EXISTS, HANDLE, HWND, LPARAM};
    use windows::Win32::System::Threading::CreateMutexW;
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FlashWindowEx, GetPropW, IsIconic, IsWindow, IsWindowVisible, SetForegroundWindow, SetPropW,
        ShowWindowAsync, FLASHWINFO, FLASHWINFO_FLAGS, FLASHW_TIMERNOFG, FLASHW_TRAY, SW_RESTORE, SW_SHOW,
    };

    /// How long a second copy waits for a running copy that is closing (no window, mutex still held)
    const CLOSING_WAIT: Duration = Duration::from_secs(5);
    /// How long it waits for a running copy that is still starting (window not shown yet)
    const STARTING_WAIT: Duration = Duration::from_secs(10);
    const POLL: Duration = Duration::from_millis(150);

    enum Mutex {
        Created,
        /// Held by a running copy. Our handle (if any) is closed: holding it would keep the mutex alive
        Taken,
        Failed,
    }

    fn create_mutex(name: &HSTRING) -> Mutex {
        unsafe {
            match CreateMutexW(None, false, name) {
                Ok(handle) => {
                    if matches!(GetLastError(), Err(e) if e.code() == HRESULT::from_win32(ERROR_ALREADY_EXISTS.0)) {
                        let _ = CloseHandle(handle);
                        Mutex::Taken
                    } else {
                        // Kept open on purpose until the process exits
                        Mutex::Created
                    }
                }
                // Created by a copy running with other rights (as administrator)
                Err(e) if e.code() == HRESULT::from_win32(ERROR_ACCESS_DENIED.0) => Mutex::Taken,
                Err(_) => Mutex::Failed,
            }
        }
    }

    struct Search<'a> {
        property: &'a HSTRING,
        found: HWND,
    }

    unsafe extern "system" fn find_marked(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = &mut *(lparam.0 as *mut Search);
        if !GetPropW(hwnd, search.property).is_invalid() {
            search.found = hwnd;
            return BOOL(0);
        }
        BOOL(1)
    }

    fn find_window(property: &HSTRING) -> Option<HWND> {
        let mut search = Search { property, found: HWND(0) };
        unsafe {
            // Returns an error when the callback stops the enumeration, that's the found case
            let _ = EnumWindows(Some(find_marked), LPARAM(&mut search as *mut Search as isize));
        }
        (search.found.0 != 0).then_some(search.found)
    }

    /// Restores and focuses the running window. Async calls: a hung window must not hang this copy
    fn activate(hwnd: HWND) {
        unsafe {
            // Still starting: the frontend shows the window when it's ready
            let started = Instant::now();
            while !IsWindowVisible(hwnd).as_bool() && IsWindow(hwnd).as_bool() && started.elapsed() < STARTING_WAIT {
                std::thread::sleep(POLL);
            }
            if !IsWindow(hwnd).as_bool() {
                return;
            }
            // Never shown (the frontend failed to start): show it rather than leave an invisible copy
            if !IsWindowVisible(hwnd).as_bool() {
                ShowWindowAsync(hwnd, SW_SHOW);
            }
            if IsIconic(hwnd).as_bool() {
                ShowWindowAsync(hwnd, SW_RESTORE);
            }
            // Windows may refuse when the launch didn't come from the user: flash the taskbar button instead
            if !SetForegroundWindow(hwnd).as_bool() {
                let info = FLASHWINFO {
                    cbSize: std::mem::size_of::<FLASHWINFO>() as u32,
                    hwnd,
                    dwFlags: FLASHWINFO_FLAGS(FLASHW_TRAY.0 | FLASHW_TIMERNOFG.0),
                    uCount: 0,
                    dwTimeout: 0,
                };
                FlashWindowEx(&info);
            }
        }
    }

    pub fn acquire(mutex_name: &str, property: &str) -> bool {
        let mutex_name = HSTRING::from(mutex_name);
        let property = HSTRING::from(property);
        let started = Instant::now();
        loop {
            match create_mutex(&mutex_name) {
                Mutex::Created => return true,
                // Never stop the app from opening because of this check
                Mutex::Failed => return true,
                Mutex::Taken => {
                    if let Some(hwnd) = find_window(&property) {
                        activate(hwnd);
                        return false;
                    }
                    // No window: the running copy is closing (then the mutex frees up and the next try
                    // gets it), or a process without a window is left (crash report, hang on exit).
                    // Open anyway after the wait, so a stuck process never locks the app
                    if started.elapsed() >= CLOSING_WAIT {
                        return true;
                    }
                    std::thread::sleep(POLL);
                }
            }
        }
    }

    pub fn mark(hwnd: isize, property: &str) {
        unsafe {
            let _ = SetPropW(HWND(hwnd), &HSTRING::from(property), HANDLE(1));
        }
    }
}

/// Call first thing in `main`. `false`: another copy is running and was brought to the front, exit
pub fn acquire(identifier: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        let (mutex_name, property) = names(identifier);
        imp::acquire(&mutex_name, &property)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = identifier;
        true
    }
}

/// Marks the main window so a second launch can find it. Call as early as possible in `setup`
pub fn mark_main_window(window: &tauri::Window, identifier: &str) {
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            imp::mark(hwnd.0 as isize, &names(identifier).1);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, identifier);
    }
}
