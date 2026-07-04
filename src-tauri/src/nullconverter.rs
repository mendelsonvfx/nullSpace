// nullconverter.rs — detect and launch nullConverter via Windows Registry

#[derive(serde::Serialize, Clone)]
pub struct NullConverterItem {
    pub mode: String,
    pub label: String,
}

#[derive(serde::Serialize)]
pub struct NullConverterInfo {
    pub exe: String,
    pub folder_items: Vec<NullConverterItem>,
    pub file_items: Vec<NullConverterItem>,
}

fn extract_exe_from_cmd(cmd: &str) -> Option<String> {
    // Command format: `"C:\path with spaces\app.exe" --mode seq_mp4hd --input "%1"`
    let inner = cmd.strip_prefix('"')?;
    Some(inner.split('"').next()?.to_string())
}

fn parse_mode_from_cmd(cmd: &str) -> Option<String> {
    let parts: Vec<&str> = cmd.split_whitespace().collect();
    let idx = parts.iter().position(|&p| p == "--mode")?;
    parts.get(idx + 1).map(|s| s.to_string())
}

fn strip_prefix(label: &str) -> String {
    // "nullConvert ▸ MP4 (original size)" → "MP4 (original size)"
    // splitn(2) prevents ▸ inside custom preset names from corrupting the result
    label
        .splitn(2, '\u{25B8}')
        .nth(1)
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| label.to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn detect_null_converter() -> Option<NullConverterInfo> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // Resolve exe: try folder keys first, then file keys.
    // Handles the edge case where only file_items are configured (no folder_items).
    let exe = (1..=3)
        .find_map(|i| {
            let cmd: String = hkcu
                .open_subkey(&format!(
                    r"Software\Classes\Directory\shell\NullConvert_f{}\command",
                    i
                ))
                .ok()?
                .get_value("")
                .ok()?;
            extract_exe_from_cmd(&cmd)
        })
        .or_else(|| {
            (1..=3).find_map(|i| {
                let cmd: String = hkcu
                    .open_subkey(&format!(
                        r"Software\Classes\SystemFileAssociations\.mp4\shell\NullConvert_v{}\command",
                        i
                    ))
                    .ok()?
                    .get_value("")
                    .ok()?;
                extract_exe_from_cmd(&cmd)
            })
        })?;

    if !std::path::Path::new(&exe).is_file() {
        return None;
    }

    let folder_items: Vec<NullConverterItem> = (1..=3)
        .filter_map(|i| {
            let key = hkcu
                .open_subkey(&format!(
                    r"Software\Classes\Directory\shell\NullConvert_f{}",
                    i
                ))
                .ok()?;
            let label: String = key.get_value("").ok()?;
            let cmd: String = key.open_subkey("command").ok()?.get_value("").ok()?;
            Some(NullConverterItem {
                mode: parse_mode_from_cmd(&cmd)?,
                label: strip_prefix(&label),
            })
        })
        .collect();

    let file_items: Vec<NullConverterItem> = (1..=3)
        .filter_map(|i| {
            let key = hkcu
                .open_subkey(&format!(
                    r"Software\Classes\SystemFileAssociations\.mp4\shell\NullConvert_v{}",
                    i
                ))
                .ok()?;
            let label: String = key.get_value("").ok()?;
            let cmd: String = key.open_subkey("command").ok()?.get_value("").ok()?;
            Some(NullConverterItem {
                mode: parse_mode_from_cmd(&cmd)?,
                label: strip_prefix(&label),
            })
        })
        .collect();

    if folder_items.is_empty() && file_items.is_empty() {
        return None;
    }

    Some(NullConverterInfo {
        exe,
        folder_items,
        file_items,
    })
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn detect_null_converter() -> Option<NullConverterInfo> {
    None
}

// Not async — spawn() is non-blocking; no await needed
#[tauri::command]
pub fn launch_null_converter(exe: String, mode: String, input: String) -> Result<(), String> {
    std::process::Command::new(&exe)
        .args(["--mode", &mode, "--input", &input])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
