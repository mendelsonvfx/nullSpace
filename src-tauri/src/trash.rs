//! Deleting user files by moving them to the Windows Recycle Bin, so a wrong click or a bug can be undone.
//!
//! One shell operation per user action: all paths go into a single `SHFileOperationW` call, so a drive
//! without a Recycle Bin (network share, NAS, some USB drives) asks once instead of once per file.
//! `FOF_WANTNUKEWARNING` makes Windows ask before anything is destroyed for good — without it
//! `FOF_ALLOWUNDO` silently deletes permanently where there is no Recycle Bin.

use std::path::{Component, Path, PathBuf};

/// Error text sent to the frontend when the user declines the shell's prompt; matched there.
pub const CANCELLED: &str = "cancelled";

#[derive(Debug, PartialEq)]
pub enum TrashError {
    /// The user said "No" to a Windows prompt (for example "delete permanently?" on a network drive)
    Cancelled,
    Failed(String),
}

impl From<TrashError> for String {
    fn from(e: TrashError) -> String {
        match e {
            TrashError::Cancelled => CANCELLED.to_string(),
            TrashError::Failed(m) => m,
        }
    }
}

/// Absolute path with `\` separators and no trailing separator. Refuses relative paths, `..`,
/// `\\?\` paths (not supported by the shell) and roots (a drive or a network share itself).
pub fn normalize(path: &Path) -> Result<PathBuf, String> {
    let raw = path.to_string_lossy().replace('/', "\\");
    if raw.starts_with(r"\\?\") {
        return Err(format!("Unsupported path: {}", raw));
    }
    let trimmed = raw.trim_end_matches('\\');
    let p = PathBuf::from(trimmed);
    if trimmed.is_empty() || !p.is_absolute() {
        return Err(format!("Refusing to delete a relative path or a drive root: {}", raw));
    }
    let mut named = 0;
    for c in p.components() {
        match c {
            Component::Normal(_) => named += 1,
            Component::ParentDir | Component::CurDir => {
                return Err(format!("Refusing to delete a path with \"..\": {}", raw));
            }
            _ => {}
        }
    }
    if named == 0 {
        return Err(format!("Refusing to delete a drive root: {}", raw));
    }
    Ok(p)
}

fn lower_components(p: &Path) -> Vec<String> {
    p.components().map(|c| c.as_os_str().to_string_lossy().to_lowercase()).collect()
}

/// `path` lies strictly inside `root` (Windows paths compare case-insensitively).
pub fn is_inside(root: &Path, path: &Path) -> bool {
    let r = lower_components(root);
    let p = lower_components(path);
    p.len() > r.len() && p[..r.len()] == r[..]
}

/// Normalizes every path and refuses the call if any of them is not strictly inside `root`.
pub fn paths_inside(root: &Path, paths: &[PathBuf]) -> Result<Vec<PathBuf>, String> {
    let root = normalize(root)?;
    paths
        .iter()
        .map(|p| {
            let n = normalize(p)?;
            if is_inside(&root, &n) {
                Ok(n)
            } else {
                Err(format!("Refusing to delete outside the project: {}", n.display()))
            }
        })
        .collect()
}

/// Drops duplicates and paths inside another listed path (the folder takes its contents with it).
fn without_nested(mut paths: Vec<PathBuf>) -> Vec<PathBuf> {
    paths.sort_by_key(|p| p.components().count());
    let mut kept: Vec<PathBuf> = Vec::new();
    for p in paths {
        let covered = kept.iter().any(|k| {
            let k = lower_components(k);
            let q = lower_components(&p);
            q.len() >= k.len() && q[..k.len()] == k[..]
        });
        if !covered {
            kept.push(p);
        }
    }
    kept
}

/// The `pFrom` list of SHFileOperationW: each path NUL-terminated, the list ends with one more NUL.
#[cfg(windows)]
fn double_null_list(paths: &[PathBuf]) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    let mut list = Vec::new();
    for p in paths {
        list.extend(p.as_os_str().encode_wide());
        list.push(0);
    }
    list.push(0);
    list
}

/// Moves the existing ones of `paths` to the Recycle Bin in one shell operation.
/// `owner` is the window the shell's prompts belong to. Returns how many top-level items were moved.
/// Blocks until the user answers any prompt: call it from an async command, never on the main thread.
pub fn move_to_trash(paths: Vec<PathBuf>, owner: isize) -> Result<usize, TrashError> {
    let mut list = Vec::new();
    for p in paths {
        let n = normalize(&p).map_err(TrashError::Failed)?;
        if std::fs::symlink_metadata(&n).is_ok() {
            list.push(n);
        }
    }
    let list = without_nested(list);
    if list.is_empty() {
        return Ok(0);
    }
    let count = list.len();

    // A thread of its own: the shell needs an STA, and the shared pools already run COM/OLE code
    std::thread::spawn(move || shell_delete(&list, owner))
        .join()
        .map_err(|_| TrashError::Failed("Moving to the Recycle Bin crashed".to_string()))??;
    Ok(count)
}

#[cfg(windows)]
fn shell_delete(paths: &[PathBuf], owner: isize) -> Result<(), TrashError> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
    use windows::Win32::UI::Shell::{
        SHFileOperationW, SHFILEOPSTRUCTW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_SILENT, FOF_WANTNUKEWARNING, FO_DELETE,
    };

    let from = double_null_list(paths);
    let com = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };

    let mut op = SHFILEOPSTRUCTW {
        hwnd: HWND(owner),
        wFunc: FO_DELETE,
        pFrom: windows::core::PCWSTR(from.as_ptr()),
        // No FOF_NOERRORUI: "file in use" and similar errors show the shell's Retry / Skip dialog
        fFlags: (FOF_ALLOWUNDO.0 | FOF_NOCONFIRMATION.0 | FOF_WANTNUKEWARNING.0 | FOF_SILENT.0) as u16,
        ..Default::default()
    };
    let code = unsafe { SHFileOperationW(&mut op) };

    if com.is_ok() {
        unsafe { CoUninitialize() };
    }

    if op.fAnyOperationsAborted.as_bool() {
        return Err(TrashError::Cancelled);
    }
    if code != 0 {
        return Err(TrashError::Failed(format!(
            "Couldn't move to the Recycle Bin (shell error 0x{:X}). Nothing else was deleted.",
            code
        )));
    }
    Ok(())
}

#[cfg(not(windows))]
fn shell_delete(paths: &[PathBuf], _owner: isize) -> Result<(), TrashError> {
    for p in paths {
        let r = if p.is_dir() { std::fs::remove_dir_all(p) } else { std::fs::remove_file(p) };
        r.map_err(|e| TrashError::Failed(format!("Failed to delete {}: {}", p.display(), e)))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_fixes_separators_and_trailing_slash() {
        assert_eq!(normalize(Path::new("E:/Work/Proj/")).unwrap(), PathBuf::from(r"E:\Work\Proj"));
        assert_eq!(normalize(Path::new(r"\\nas\share\Proj")).unwrap(), PathBuf::from(r"\\nas\share\Proj"));
    }

    #[test]
    fn normalize_refuses_roots_relative_and_parent() {
        for bad in ["", "C:", r"C:\", "C:/", r"\\nas\share", r"\\nas\share\", "Proj", r"E:\Work\..\Other", r"\\?\E:\Work\Proj"] {
            assert!(normalize(Path::new(bad)).is_err(), "{:?} must be refused", bad);
        }
    }

    #[test]
    fn inside_is_strict_and_case_insensitive() {
        let root = PathBuf::from(r"E:\Work\Proj");
        assert!(is_inside(&root, Path::new(r"e:\work\proj\Blender\001")));
        assert!(!is_inside(&root, Path::new(r"E:\Work\Proj")));
        assert!(!is_inside(&root, Path::new(r"E:\Work\Project2\x")));
        assert!(!is_inside(&root, Path::new(r"E:\Work")));
    }

    #[test]
    fn paths_inside_refuses_anything_outside() {
        let root = Path::new("E:/Work/Proj");
        assert!(paths_inside(root, &[PathBuf::from("E:/Work/Proj/_attachments/a.png")]).is_ok());
        assert!(paths_inside(root, &[PathBuf::from("E:/Work/Proj")]).is_err());
        assert!(paths_inside(root, &[PathBuf::from("E:/Work/Proj/../Other")]).is_err());
        assert!(paths_inside(root, &[PathBuf::from("D:/Elsewhere/file.txt")]).is_err());
    }

    #[test]
    fn nested_paths_and_duplicates_are_dropped() {
        let kept = without_nested(vec![
            PathBuf::from(r"E:\P\Blender\SC\Render\Preview\001\f_0001.png"),
            PathBuf::from(r"E:\P\Blender\SC"),
            PathBuf::from(r"e:\p\blender\sc"),
            PathBuf::from(r"E:\P\Houdini\SC"),
            PathBuf::from(r"E:\P\Blender\SCENE2"),
        ]);
        assert_eq!(
            kept,
            vec![PathBuf::from(r"E:\P\Blender\SC"), PathBuf::from(r"E:\P\Houdini\SC"), PathBuf::from(r"E:\P\Blender\SCENE2")]
        );
    }

    #[cfg(windows)]
    #[test]
    fn list_is_double_null_terminated() {
        let list = double_null_list(&[PathBuf::from(r"C:\a"), PathBuf::from(r"C:\bc")]);
        let expected: Vec<u16> = "C:\\a\0C:\\bc\0\0".encode_utf16().collect();
        assert_eq!(list, expected);
    }

    #[test]
    fn missing_paths_are_a_no_op() {
        let missing = std::env::temp_dir().join(format!("nullspace_trash_missing_{}", uuid::Uuid::new_v4().simple()));
        assert_eq!(move_to_trash(vec![missing], 0), Ok(0));
    }
}
