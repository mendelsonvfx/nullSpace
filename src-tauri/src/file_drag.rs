//! Dragging a file (or an image-sequence folder) out of nullSpace into other apps — Explorer, Discord,
//! messengers, DCCs — through the system drag-and-drop, so it lands there as a regular file.
//!
//! Windows only. Release builds abort on panic, so nothing here may unwrap: every failure is an `Err`
//! the frontend shows or ignores.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// Longest path the shell parses without the `\\?\` prefix (MAX_PATH minus the terminator)
const MAX_DRAG_PATH: usize = 259;

/// One drag at a time: a second request while one runs is refused
static DRAG_ACTIVE: AtomicBool = AtomicBool::new(false);

struct ActiveGuard;

impl ActiveGuard {
    fn acquire() -> Option<Self> {
        DRAG_ACTIVE
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| ActiveGuard)
    }
}

impl Drop for ActiveGuard {
    fn drop(&mut self) {
        DRAG_ACTIVE.store(false, Ordering::Release);
    }
}

/// Shape a path the way the shell parses it: backslashes, no trailing separator (a drive root keeps its
/// own), absolute, short enough. No `canonicalize`: it adds `\\?\`, which shell parsing rejects.
pub fn normalize_drag_path(path: &str) -> Result<PathBuf, String> {
    let mut p = path.trim().replace('/', "\\");
    if p.starts_with(r"\\?\") {
        return Err("This path can't be dragged".to_string());
    }
    let is_drive_root = |s: &str| s.len() == 3 && s.as_bytes()[1] == b':';
    while p.len() > 1 && p.ends_with('\\') && !is_drive_root(&p) {
        p.pop();
    }
    if p.is_empty() || !Path::new(&p).is_absolute() {
        return Err("This path can't be dragged".to_string());
    }
    if p.encode_utf16().count() > MAX_DRAG_PATH {
        return Err("The path is too long to drag (over 259 characters)".to_string());
    }
    Ok(PathBuf::from(p))
}

/// `normalize_drag_path` plus an existence check. Blocking (a slow network drive can take seconds),
/// so it runs off the async runtime.
pub fn prepare_drag_path(path: &str) -> Result<PathBuf, String> {
    let path = normalize_drag_path(path)?;
    std::fs::metadata(&path).map_err(|_| "File not found: it may have been moved or deleted".to_string())?;
    Ok(path)
}

/// Start dragging `path` out of the window. Resolves once the user drops or cancels:
/// `true` if a target accepted the file.
#[tauri::command]
pub async fn start_file_drag(app: tauri::AppHandle, window: tauri::Window, path: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let _active = ActiveGuard::acquire().ok_or("busy")?;
        let path = tauri::async_runtime::spawn_blocking(move || prepare_drag_path(&path))
            .await
            .map_err(|e| format!("Drag preparation failed: {}", e))??;
        let hwnd = window.hwnd().map_err(|e| format!("Window handle unavailable: {}", e))?.0 as isize;

        // DoDragDrop runs a modal loop and must run on the window's thread
        let (tx, mut rx) = tauri::async_runtime::channel(1);
        app.run_on_main_thread(move || {
            let _ = tx.try_send(win::drag_on_main(hwnd, &path));
        })
        .map_err(|e| format!("Couldn't start dragging: {}", e))?;
        rx.recv().await.unwrap_or_else(|| Err("Dragging was interrupted".to_string()))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, window, path);
        Err("Dragging files out isn't supported on this system".to_string())
    }
}

#[cfg(target_os = "windows")]
mod win {
    use std::cell::Cell;
    use std::ffi::c_void;
    use std::path::Path;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    use windows::core::{ComInterface, HSTRING};
    use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, POINT, SIZE, WPARAM};
    use windows::Win32::Graphics::Gdi::{DeleteObject, GetObjectW, BITMAP, HBITMAP};
    use windows::Win32::Storage::FileSystem::GetDriveTypeW;
    use windows::Win32::System::Com::{CoCreateInstance, IBindCtx, IDataObject, CLSCTX_INPROC_SERVER};
    use windows::Win32::System::Ole::{IDropSource, OleInitialize, DROPEFFECT_COPY, DROPEFFECT_NONE};
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE, VK_LBUTTON, VK_RBUTTON};
    use windows::Win32::UI::Shell::{
        BHID_DataObject, IDragSourceHelper, IShellItem, IShellItemImageFactory, SHCreateItemFromParsingName,
        SHDoDragDrop, CLSID_DragDropHelper, SHDRAGIMAGE, SIIGBF_ICONONLY, SIIGBF_INCACHEONLY, SIIGBF_THUMBNAILONLY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetGUIThreadInfo, GetSystemMetrics, PostMessageW, GUITHREADINFO, SM_SWAPBUTTON, WM_KEYDOWN, WM_KEYUP,
    };

    /// GetDriveTypeW result for a network drive (from WindowsProgramming, not worth a feature)
    const DRIVE_REMOTE: u32 = 4;
    /// Drag image side at 100% scale: a real thumbnail (image, render) reads better a bit larger
    /// than a file type icon
    const THUMBNAIL_SIDE: u32 = 64;
    const ICON_SIDE: u32 = 48;
    /// A stuck drag (button up, OLE still holding the mouse) is cancelled after this long
    const STUCK_AFTER: Duration = Duration::from_secs(3);

    thread_local! {
        /// OLE is initialized once on the main thread and never torn down: a drop target such as
        /// Explorer may still talk to our data object after the drag returns
        static OLE_READY: Cell<bool> = Cell::new(false);
    }

    fn ensure_ole() -> Result<(), String> {
        if OLE_READY.with(|ready| ready.get()) {
            return Ok(());
        }
        unsafe { OleInitialize(None) }.map_err(|e| format!("Couldn't start dragging (OLE: {})", e.message()))?;
        OLE_READY.with(|ready| ready.set(true));
        Ok(())
    }

    /// Primary mouse button is held. GetAsyncKeyState reads physical buttons, so swapped buttons
    /// (left-handed mouse) mean the right one.
    fn primary_button_down() -> bool {
        let vk = if unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0 { VK_RBUTTON } else { VK_LBUTTON };
        (unsafe { GetAsyncKeyState(vk.0 as i32) } as u16 & 0x8000) != 0
    }

    fn is_network_path(path: &Path) -> bool {
        let s = path.to_string_lossy();
        if s.starts_with(r"\\") {
            return true;
        }
        match s.get(..3) {
            Some(root) => (unsafe { GetDriveTypeW(&HSTRING::from(root)) }) == DRIVE_REMOTE,
            None => false,
        }
    }

    /// Explorer's own picture of the item: its cached thumbnail (64 px), else the file type icon (48 px).
    /// Nothing is decoded on the main thread: the thumbnail comes only from Explorer's cache, and on a
    /// network share (where even an icon lookup can stall the window) the icon too. None: no picture.
    fn drag_bitmap(item: &IShellItem, path: &Path, hwnd: HWND) -> Option<HBITMAP> {
        let factory: IShellItemImageFactory = item.cast().ok()?;
        let dpi = match unsafe { GetDpiForWindow(hwnd) } {
            0 => 96,
            dpi => dpi,
        };
        let size = |side: u32| {
            let side = (side * dpi / 96) as i32;
            SIZE { cx: side, cy: side }
        };
        if let Ok(bitmap) = unsafe { factory.GetImage(size(THUMBNAIL_SIDE), SIIGBF_THUMBNAILONLY | SIIGBF_INCACHEONLY) } {
            return Some(bitmap);
        }
        let icon_flags = if is_network_path(path) { SIIGBF_ICONONLY | SIIGBF_INCACHEONLY } else { SIIGBF_ICONONLY };
        unsafe { factory.GetImage(size(ICON_SIDE), icon_flags) }.ok()
    }

    /// Put the picture into the data object. On success the drag helper owns the bitmap;
    /// otherwise it's freed here and the drag goes without a picture.
    fn attach_drag_image(data: &IDataObject, bitmap: HBITMAP) {
        let mut info = BITMAP::default();
        let read = unsafe {
            GetObjectW(bitmap, std::mem::size_of::<BITMAP>() as i32, Some(&mut info as *mut BITMAP as *mut c_void))
        };
        let attached = read != 0 && info.bmWidth > 0 && info.bmHeight != 0 && {
            let (width, height) = (info.bmWidth, info.bmHeight.abs());
            let image = SHDRAGIMAGE {
                sizeDragImage: SIZE { cx: width, cy: height },
                ptOffset: POINT { x: width / 2, y: height / 2 },
                hbmpDragImage: bitmap,
                crColorKey: COLORREF(0xFFFF_FFFF), // CLR_NONE: no colour is transparent
            };
            unsafe { CoCreateInstance::<_, IDragSourceHelper>(&CLSID_DragDropHelper, None, CLSCTX_INPROC_SERVER) }
                .and_then(|helper| unsafe { helper.InitializeFromBitmap(&image, data) })
                .is_ok()
        };
        if !attached {
            unsafe {
                let _ = DeleteObject(bitmap);
            }
        }
    }

    /// The window OLE's drag loop captures the mouse with, if it's the current capture holder of `thread_id`
    fn ole_drag_window(thread_id: u32) -> Option<HWND> {
        let mut info = GUITHREADINFO { cbSize: std::mem::size_of::<GUITHREADINFO>() as u32, ..Default::default() };
        unsafe { GetGUIThreadInfo(thread_id, &mut info) }.ok()?;
        let capture = info.hwndCapture;
        if capture.0 == 0 {
            return None;
        }
        let mut class = [0u16; 64];
        let len = unsafe { GetClassNameW(capture, &mut class) };
        (len > 0 && String::from_utf16_lossy(&class[..len as usize]) == "CLIPBRDWNDCLASS").then_some(capture)
    }

    /// Ends the watchdog when dropped, whichever way drag_on_main returns
    struct WatchdogStop(Arc<AtomicBool>);

    impl Drop for WatchdogStop {
        fn drop(&mut self) {
            self.0.store(true, Ordering::Release);
        }
    }

    /// DoDragDrop can occasionally keep running after the button is released (seen in other apps:
    /// the whole window then stops responding). If the button has been up for STUCK_AFTER while OLE
    /// still holds the mouse, press Escape for it — that cancels the drag.
    fn start_watchdog(main_thread: u32) -> WatchdogStop {
        let done = Arc::new(AtomicBool::new(false));
        let stop = done.clone();
        let spawned = std::thread::Builder::new().name("drag-watchdog".into()).spawn(move || {
            let mut released_at: Option<Instant> = None;
            loop {
                std::thread::sleep(Duration::from_millis(250));
                if done.load(Ordering::Acquire) {
                    break;
                }
                if primary_button_down() {
                    released_at = None;
                    continue;
                }
                if released_at.get_or_insert_with(Instant::now).elapsed() < STUCK_AFTER {
                    continue;
                }
                if let Some(window) = ole_drag_window(main_thread) {
                    println!("[FileDrag] Drag stuck after the button was released: cancelling");
                    let escape = WPARAM(VK_ESCAPE.0 as usize);
                    unsafe {
                        let _ = PostMessageW(window, WM_KEYDOWN, escape, LPARAM(1));
                        let _ = PostMessageW(window, WM_KEYUP, escape, LPARAM(0xC000_0001u32 as isize));
                    }
                }
                released_at = None; // still stuck: try again after another STUCK_AFTER
            }
        });
        if let Err(e) = spawned {
            println!("[FileDrag] Watchdog not started: {}", e);
        }
        WatchdogStop(stop)
    }

    /// Runs on the main thread. Blocks in the system drag loop until the drop or cancel.
    pub fn drag_on_main(hwnd: isize, path: &Path) -> Result<bool, String> {
        // The button may already be up after the IPC round trip; OLE would then drop at once under the cursor
        if !primary_button_down() {
            return Ok(false);
        }
        ensure_ole()?;
        let hwnd = HWND(hwnd);

        let item: IShellItem = unsafe { SHCreateItemFromParsingName(&HSTRING::from(path), None::<&IBindCtx>) }
            .map_err(|e| format!("Couldn't drag this file: {}", e.message()))?;
        // The shell's own data object: CF_HDROP for Chromium/Electron (Discord), plus what Explorer expects
        let data: IDataObject = unsafe { item.BindToHandler(None::<&IBindCtx>, &BHID_DataObject) }
            .map_err(|e| format!("Couldn't drag this file: {}", e.message()))?;
        if let Some(bitmap) = drag_bitmap(&item, path, hwnd) {
            attach_drag_image(&data, bitmap);
        }

        let _watchdog = start_watchdog(unsafe { GetCurrentThreadId() });
        // Copy only: the original never moves, even onto the same drive or into the Recycle Bin
        let effect = unsafe { SHDoDragDrop(hwnd, &data, None::<&IDropSource>, DROPEFFECT_COPY) }
            .map_err(|e| format!("Dragging failed: {}", e.message()))?;
        Ok(effect != DROPEFFECT_NONE)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_slashes_and_trailing_separators() {
        assert_eq!(normalize_drag_path("E:/Projects/Shot/Render").unwrap(), PathBuf::from(r"E:\Projects\Shot\Render"));
        assert_eq!(normalize_drag_path(r"E:\Projects\Shot\Render\").unwrap(), PathBuf::from(r"E:\Projects\Shot\Render"));
        assert_eq!(normalize_drag_path("E:/Projects//").unwrap(), PathBuf::from(r"E:\Projects"));
        assert_eq!(normalize_drag_path(r"\\server\share\file.png").unwrap(), PathBuf::from(r"\\server\share\file.png"));
    }

    #[test]
    fn keeps_drive_root() {
        assert_eq!(normalize_drag_path("E:/").unwrap(), PathBuf::from(r"E:\"));
        assert_eq!(normalize_drag_path(r"E:\").unwrap(), PathBuf::from(r"E:\"));
    }

    #[test]
    fn rejects_relative_empty_and_verbatim() {
        assert!(normalize_drag_path("Render/file.png").is_err());
        assert!(normalize_drag_path(r"\Render\file.png").is_err());
        assert!(normalize_drag_path("").is_err());
        assert!(normalize_drag_path("   ").is_err());
        assert!(normalize_drag_path(r"\\?\E:\file.png").is_err());
    }

    #[test]
    fn rejects_paths_over_max_path() {
        let ok = format!(r"E:\{}", "a".repeat(MAX_DRAG_PATH - 3));
        assert_eq!(ok.encode_utf16().count(), MAX_DRAG_PATH);
        assert!(normalize_drag_path(&ok).is_ok());
        let long = format!(r"E:\{}", "a".repeat(MAX_DRAG_PATH - 2));
        assert!(normalize_drag_path(&long).is_err());
    }

    #[test]
    fn checks_existence() {
        let dir = std::env::temp_dir().join(format!("nullspace_drag_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("frame_0001.png");
        std::fs::write(&file, b"x").unwrap();

        assert_eq!(prepare_drag_path(&file.to_string_lossy()).unwrap(), file);
        let dir_slashes = format!("{}/", dir.to_string_lossy().replace('\\', "/"));
        assert_eq!(prepare_drag_path(&dir_slashes).unwrap(), dir);
        assert!(prepare_drag_path(&dir.join("missing.png").to_string_lossy()).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn one_drag_at_a_time() {
        let first = ActiveGuard::acquire();
        assert!(first.is_some());
        assert!(ActiveGuard::acquire().is_none());
        drop(first);
        assert!(ActiveGuard::acquire().is_some());
    }
}
