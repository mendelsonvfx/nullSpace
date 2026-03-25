use std::collections::HashMap;
use std::process::Command;
use std::time::Duration;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
pub struct UpdatePlatformInfo {
    pub url: String,
    // signature field ignored by serde (no deny_unknown_fields)
}

#[derive(Deserialize, Serialize)]
pub struct UpdateManifest {
    pub version: String,
    pub platforms: HashMap<String, UpdatePlatformInfo>,
    pub notes: Option<String>,        // rendered in modal — may be empty
    pub release_url: Option<String>,  // link to GitHub release page
    pub pub_date: Option<String>,     // ISO 8601 UTC — displayed as "Mar 25, 2026"
}

#[derive(Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub download_url: String,
    pub notes: Option<String>,
    pub release_url: Option<String>,
    pub pub_date: Option<String>,
}

#[tauri::command]
pub async fn check_for_update(app_handle: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let current = app_handle.package_info().version.to_string();

    // 10-second timeout matches existing reqwest usage pattern in the codebase
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("nullSpace-updater/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let manifest: UpdateManifest = client
        .get("https://github.com/mendelsonvfx/nullSpace/releases/latest/download/latest.json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()        // returns Err on 4xx/5xx — prevents parsing error page as JSON
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if is_newer_version(&manifest.version, &current) {
        let info = manifest
            .platforms
            .get("windows-x86_64")
            .ok_or_else(|| "No Windows update available".to_string())?;
        Ok(Some(UpdateInfo {
            version: manifest.version.clone(),
            download_url: info.url.clone(),
            notes: manifest.notes.clone(),
            release_url: manifest.release_url.clone(),
            pub_date: manifest.pub_date.clone(),
        }))
    } else {
        Ok(None)
    }
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> [u64; 3] {
        let parts: Vec<&str> = v.trim_start_matches('v').split('.').collect();
        [
            parts.get(0).and_then(|s| s.parse().ok()).unwrap_or(0),
            parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
            parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),
        ]
    };
    parse(latest) > parse(current)
}

#[tauri::command]
pub async fn install_portable_update(download_url: String) -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let temp_dir = std::env::temp_dir();
    let new_exe = temp_dir.join("nullspace_new.exe");

    // Download new exe — 5-minute timeout for large file download
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;
    let bytes = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    std::fs::write(&new_exe, &bytes).map_err(|e| e.to_string())?;

    let current_pid = std::process::id();
    // Escape single quotes in paths for PowerShell single-quoted strings
    let new_exe_str = new_exe.to_string_lossy().replace('\'', "''");
    let cur_exe_str = current_exe.to_string_lossy().replace('\'', "''");

    // PowerShell script:
    // - Start-Sleep 1s upfront ensures app window is gone before copy begins
    // - Wait-Process uses event-based handle waiting (not PID polling) — immune to PID reuse
    // - -ErrorAction SilentlyContinue handles the case the process already exited
    // - Start-Sleep 2s after wait: Windows Defender real-time scan holds exe lock
    //   for up to 1-2s post-exit; 500ms was insufficient, 2s is reliable
    // - try/catch with -ErrorAction Stop: if Copy-Item fails, Start-Process is NOT run
    //   (avoids launching a partially-written/corrupted exe if the copy failed mid-write)
    // - In Rust format!, {{ and }} produce literal { and } in the output string
    let ps_command = format!(
        "Start-Sleep -Seconds 1; \
         Wait-Process -Id {pid} -ErrorAction SilentlyContinue; \
         Start-Sleep -Seconds 2; \
         try {{ Copy-Item -Path '{new}' -Destination '{cur}' -Force -ErrorAction Stop; \
         Start-Process '{cur}' }} catch {{}}",
        pid = current_pid,
        new = new_exe_str,
        cur = cur_exe_str,
    );

    // CommandExt is a local use to enable .creation_flags() on Windows
    // CREATE_NO_WINDOW (0x08000000) prevents a console window from flashing on screen
    use std::os::windows::process::CommandExt;

    Command::new("powershell")
        .args(["-WindowStyle", "Hidden", "-Command", &ps_command])
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| e.to_string())?;

    // std::process::exit has return type `!` (diverging) — no Ok(()) needed
    std::process::exit(0);
}
