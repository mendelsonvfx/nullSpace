use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_folder_structure(path: String) -> Result<Vec<FileNode>, String> {
    read_dir_recursive(&path, 2) // Limit depth to 2 levels
}

fn read_dir_recursive(path: &str, max_depth: usize) -> Result<Vec<FileNode>, String> {
    if max_depth == 0 {
        return Ok(vec![]);
    }

    let path_obj = Path::new(path);
    if !path_obj.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let entries = fs::read_dir(path_obj)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut nodes = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = path.is_dir();

        let children = if is_dir {
            Some(read_dir_recursive(&path.to_string_lossy(), max_depth - 1).unwrap_or_default())
        } else {
            None
        };

        nodes.push(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            children,
        });
    }

    // Sort: items without underscore first, then items with underscore
    // Within each group: directories first, then files (alphabetically)
    nodes.sort_by(|a, b| {
        let a_starts_underscore = a.name.starts_with('_');
        let b_starts_underscore = b.name.starts_with('_');

        match (a_starts_underscore, b_starts_underscore) {
            (false, true) => std::cmp::Ordering::Less,  // a without _ comes before b with _
            (true, false) => std::cmp::Ordering::Greater, // a with _ comes after b without _
            _ => {
                // Both have same underscore status, sort by dir/file, then alphabetically
                match (a.is_dir, b.is_dir) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                }
            }
        }
    });

    Ok(nodes)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, get_folder_structure])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
