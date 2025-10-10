#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;
use chrono::Utc;
use uuid::Uuid;
use scraper::{Html, Selector};
use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebounceEventResult};
use tauri::Manager;
use sysinfo::System;

// Embedded After Effects template
const TEMPLATE_AEP: &[u8] = include_bytes!("../templates/empty.aep");

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Project {
    id: String,
    name: String,
    description: String,
    path: String,
    #[serde(rename = "createdAt", alias = "created_at")]
    created_at: String,
    #[serde(rename = "updatedAt", alias = "updated_at")]
    updated_at: String,
    status: String,
    tags: Vec<String>,
    software: Vec<Software>,
    notes: Vec<Note>,
    #[serde(rename = "browserTabs", alias = "browser_tabs")]
    browser_tabs: Vec<BrowserTab>,
    links: Option<Vec<Link>>,
    thumbnail: Option<String>,
    #[serde(rename = "folderStructure", alias = "folder_structure")]
    folder_structure: Vec<FolderTemplate>,
    deadline: Option<String>,
    #[serde(rename = "clientId", alias = "client_id")]
    client_id: Option<String>,
    #[serde(rename = "isFavorite", alias = "is_favorite")]
    is_favorite: Option<bool>,
    #[serde(rename = "isPinned", alias = "is_pinned")]
    is_pinned: Option<bool>,
    cost: Option<f64>,
    currency: Option<String>,
    #[serde(rename = "paymentStatus", alias = "payment_status")]
    payment_status: Option<String>,
    #[serde(rename = "prepaymentAmount", alias = "prepayment_amount")]
    prepayment_amount: Option<f64>,
    todos: Option<Vec<TodoItem>>,
    #[serde(rename = "hasShots", alias = "has_shots")]
    has_shots: Option<bool>,
    shots: Option<Vec<Shot>>,
    #[serde(rename = "currentShotId", alias = "current_shot_id")]
    current_shot_id: Option<String>,
    category: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
enum FolderItem {
    Simple(String),
    Nested {
        name: String,
        subfolders: Vec<FolderItem>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FolderTemplate {
    name: String,
    subfolders: Option<Vec<FolderItem>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Software {
    name: String,
    executable_path: String,
    version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Note {
    id: String,
    content: String,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BrowserTab {
    id: String,
    url: String,
    title: String,
    is_pinned: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Link {
    id: String,
    url: String,
    title: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TodoItem {
    id: String,
    text: String,
    completed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Shot {
    id: String,
    number: u32,
    name: String,
    todos: Vec<TodoItem>,
    notes: Vec<Note>,
    #[serde(rename = "browserTabs")]
    browser_tabs: Vec<BrowserTab>,
    links: Vec<Link>,
}

#[derive(Debug, Deserialize)]
struct CreateProjectInput {
    name: String,
    description: String,
    path: String,
    software: Vec<String>,
    tags: Vec<String>,
    deadline: Option<String>,
    #[serde(rename = "clientId")]
    client_id: Option<String>,
    cost: Option<f64>,
    currency: Option<String>,
    #[serde(rename = "paymentStatus")]
    payment_status: Option<String>,
    #[serde(rename = "prepaymentAmount")]
    prepayment_amount: Option<f64>,
    #[serde(rename = "hasShots")]
    has_shots: Option<bool>,
    category: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LaunchSoftwareInput {
    #[serde(rename = "projectPath")]
    project_path: String,
    #[serde(rename = "executablePath")]
    executable_path: String,
    software: String,
    #[serde(rename = "projectName")]
    project_name: String,
    #[serde(rename = "shotNumber")]
    shot_number: Option<u32>,
}

fn get_software_folder_name(software: &str) -> &str {
    match software.to_lowercase().as_str() {
        "blender" => "Blender",
        "houdini" => "Houdini",
        "maya" => "Maya",
        "after-effects" | "after effects" => "AfterEffects",
        "cinema4d" | "cinema 4d" => "Cinema4D",
        "substance" | "substance painter" => "Substance",
        "unreal" | "unreal engine" => "Unreal",
        "unity" => "Unity",
        "zbrush" => "ZBrush",
        "marmoset" | "marmoset toolbag" => "Marmoset",
        _ => software,
    }
}

fn get_folder_template(software: &str) -> Vec<FolderItem> {
    match software.to_lowercase().as_str() {
        "blender" => vec![
            FolderItem::Nested {
                name: "Geo".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Exported".to_string()),
                    FolderItem::Simple("Imported".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Tex".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Exported".to_string()),
                    FolderItem::Simple("Imported".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Cache".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Temp".to_string()),
                    FolderItem::Simple("Sim".to_string()),
                    FolderItem::Simple("Bake".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Render".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Preview".to_string()),
                    FolderItem::Simple("Final".to_string()),
                    FolderItem::Simple("Passes".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Assets".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Shaders".to_string()),
                    FolderItem::Simple("Materials".to_string()),
                    FolderItem::Simple("Models".to_string()),
                    FolderItem::Simple("HDRI".to_string()),
                    FolderItem::Simple("Presets".to_string()),
                ],
            },
            FolderItem::Simple("Notes".to_string()),
        ],
        "houdini" => vec![
            FolderItem::Nested {
                name: "Geo".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Exported".to_string()),
                    FolderItem::Simple("Imported".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Tex".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Exported".to_string()),
                    FolderItem::Simple("Imported".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Cache".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Temp".to_string()),
                    FolderItem::Simple("Sim".to_string()),
                    FolderItem::Simple("Render".to_string()),
                    FolderItem::Simple("Alembic".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Render".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Preview".to_string()),
                    FolderItem::Simple("Final".to_string()),
                    FolderItem::Simple("Passes".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Assets".to_string(),
                subfolders: vec![
                    FolderItem::Simple("HDAs".to_string()),
                    FolderItem::Simple("Presets".to_string()),
                ],
            },
            FolderItem::Simple("Notes".to_string()),
        ],
        "after-effects" | "after effects" => vec![
            FolderItem::Nested {
                name: "Footage".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Renders".to_string()),
                    FolderItem::Simple("Plates".to_string()),
                    FolderItem::Simple("Stock".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Assets".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Logos".to_string()),
                    FolderItem::Simple("Graphics".to_string()),
                    FolderItem::Simple("Audio".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Output".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Preview".to_string()),
                    FolderItem::Simple("Final".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Cache".to_string(),
                subfolders: vec![
                    FolderItem::Simple("AE_Cache".to_string()),
                    FolderItem::Simple("Temp".to_string()),
                ],
            },
        ],
        "maya" => vec![
            FolderItem::Simple("scenes".to_string()),
            FolderItem::Simple("images".to_string()),
            FolderItem::Simple("cache".to_string()),
            FolderItem::Simple("sourceimages".to_string()),
        ],
        _ => vec![
            FolderItem::Simple("Assets".to_string()),
            FolderItem::Simple("Output".to_string()),
        ],
    }
}

fn create_folder_item(base_path: &PathBuf, item: &FolderItem) -> Result<(), String> {
    match item {
        FolderItem::Simple(name) => {
            let folder_path = base_path.join(name);
            fs::create_dir_all(&folder_path)
                .map_err(|e| format!("Failed to create folder {}: {}", name, e))?;
        }
        FolderItem::Nested { name, subfolders } => {
            let folder_path = base_path.join(name);
            fs::create_dir_all(&folder_path)
                .map_err(|e| format!("Failed to create folder {}: {}", name, e))?;

            for subfolder in subfolders {
                create_folder_item(&folder_path, subfolder)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn create_project(input: CreateProjectInput) -> Result<Project, String> {
    let project_path = PathBuf::from(&input.path);
    fs::create_dir_all(&project_path)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    for software in &input.software {
        let software_folders = get_folder_template(software);
        let folder_name = get_software_folder_name(software);
        let software_path = project_path.join(folder_name);

        for folder_item in software_folders {
            create_folder_item(&software_path, &folder_item)?;
        }
    }

    let common_folders = vec!["_GlobalReferences"];
    for folder in common_folders {
        fs::create_dir_all(project_path.join(folder))
            .map_err(|e| format!("Failed to create common folder {}: {}", folder, e))?;
    }

    let now = Utc::now().to_rfc3339();

    // Convert software names to Software objects
    let software_list: Vec<Software> = input.software.iter().map(|name| {
        Software {
            name: name.clone(),
            executable_path: String::new(), // Empty path, will be configured later
            version: None,
        }
    }).collect();

    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: input.name,
        description: input.description,
        path: input.path.clone(),
        created_at: now.clone(),
        updated_at: now,
        status: "active".to_string(),
        tags: input.tags,
        software: software_list,
        notes: vec![],
        browser_tabs: vec![],
        links: Some(vec![]),
        thumbnail: None,
        folder_structure: vec![],
        deadline: input.deadline,
        client_id: input.client_id,
        is_favorite: Some(false),
        is_pinned: Some(false),
        cost: input.cost,
        currency: input.currency,
        payment_status: input.payment_status,
        prepayment_amount: input.prepayment_amount,
        todos: Some(vec![]),
        has_shots: input.has_shots,
        shots: Some(vec![]),
        current_shot_id: None,
        category: input.category,
    };

    let metadata_path = project_path.join(".project-metadata.json");
    let json = serde_json::to_string_pretty(&project)
        .map_err(|e| format!("Failed to serialize project: {}", e))?;
    fs::write(metadata_path, json)
        .map_err(|e| format!("Failed to write metadata: {}", e))?;

    Ok(project)
}

#[tauri::command]
async fn load_projects(projects_dir: String) -> Result<Vec<Project>, String> {
    let base_path = PathBuf::from(&projects_dir);
    
    if !base_path.exists() {
        fs::create_dir_all(&base_path)
            .map_err(|e| format!("Failed to create projects directory: {}", e))?;
        return Ok(vec![]);
    }

    let mut projects = Vec::new();
    let entries = fs::read_dir(&base_path)
        .map_err(|e| format!("Failed to read projects directory: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let metadata_path = entry.path().join(".project-metadata.json");
            if metadata_path.exists() {
                if let Ok(content) = fs::read_to_string(&metadata_path) {
                    if let Ok(project) = serde_json::from_str::<Project>(&content) {
                        projects.push(project);
                    }
                }
            }
        }
    }

    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(projects)
}

#[tauri::command]
async fn update_project(project: Project) -> Result<(), String> {
    let project_path = PathBuf::from(&project.path);
    let metadata_path = project_path.join(".project-metadata.json");

    let mut updated_project = project.clone();
    updated_project.updated_at = Utc::now().to_rfc3339();

    let json = serde_json::to_string_pretty(&updated_project)
        .map_err(|e| format!("Failed to serialize project: {}", e))?;
    
    fs::write(metadata_path, json)
        .map_err(|e| format!("Failed to write metadata: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn delete_project(project_path: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    fs::remove_dir_all(&path)
        .map_err(|e| format!("Failed to delete project: {}", e))?;
    Ok(())
}

// Helper function to find hython.exe from houdinifx.exe path
fn find_hython_path(houdinifx_path: &str) -> Result<PathBuf, String> {
    let path = std::path::Path::new(houdinifx_path);
    let parent = path.parent()
        .ok_or("Failed to get parent directory of Houdini executable")?;

    let hython = parent.join("hython.exe");

    if hython.exists() {
        Ok(hython)
    } else {
        Err(format!("hython.exe not found in: {}", parent.display()))
    }
}

#[tauri::command]
async fn launch_software(input: LaunchSoftwareInput) -> Result<String, String> {
    let project_path = PathBuf::from(&input.project_path);

    // Determine file extension and software folder based on software
    let (file_extension, software_folder) = match input.software.to_lowercase().as_str() {
        "blender" => (".blend", "Blender"),
        "houdini" => (".hip", "Houdini"),
        "maya" => (".ma", "Maya"),
        "after effects" | "after-effects" => (".aep", "AfterEffects"),
        "cinema 4d" | "cinema4d" => (".c4d", "Cinema4D"),
        "substance" | "substance painter" => (".spp", "Substance"),
        "unreal" | "unreal engine" => (".uproject", "Unreal"),
        "unity" => (".unity", "Unity"),
        "zbrush" => (".zpr", "ZBrush"),
        "marmoset" | "marmoset toolbag" => (".tbscene", "Marmoset"),
        _ => (".txt", "Unknown"), // fallback
    };

    // Software folder path
    let software_path = project_path.join(software_folder);

    // Ensure software directory exists
    if !software_path.exists() {
        fs::create_dir_all(&software_path)
            .map_err(|e| format!("Failed to create software directory: {}", e))?;
    }

    // Build base name with optional shot number
    let base_name = input.project_name.replace(" ", "");
    let base_name_with_shot = if let Some(shot_num) = input.shot_number {
        format!("{}_Shot{:03}", base_name, shot_num)
    } else {
        base_name.clone()
    };

    let mut highest_version = 0;
    let mut latest_file: Option<PathBuf> = None;

    // Scan software directory for existing version files
    if let Ok(entries) = fs::read_dir(&software_path) {
        for entry in entries.flatten() {
            if let Ok(file_name) = entry.file_name().into_string() {
                // Check if file matches pattern: BaseName[_Shot###]_v###.ext
                if file_name.starts_with(&base_name_with_shot) && file_name.contains("_v") {
                    // Extract version number
                    if let Some(version_str) = file_name.strip_prefix(&format!("{}_v", base_name_with_shot)) {
                        if let Some(version_num_str) = version_str.get(0..3) {
                            if let Ok(version_num) = version_num_str.parse::<u32>() {
                                if version_num > highest_version {
                                    highest_version = version_num;
                                    latest_file = Some(entry.path());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // If file exists, open it. Otherwise create new v001
    let (file_path, file_name) = if let Some(existing_file) = latest_file {
        let file_name = existing_file.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        (existing_file, file_name)
    } else {
        // Create new file with v001
        let file_name = format!("{}_v001{}", base_name_with_shot, file_extension);
        let file_path = software_path.join(&file_name);
        (file_path, file_name)
    };

    // Launch software
    #[cfg(target_os = "windows")]
    {
        let software_lower = input.software.to_lowercase();

        // For After Effects, create project from template if it doesn't exist
        if (software_lower == "after effects" || software_lower == "after-effects") && !file_path.exists() {
            fs::write(&file_path, TEMPLATE_AEP)
                .map_err(|e| format!("Failed to create After Effects project from template: {}", e))?;
        }

        // For Blender, create project with path configuration if it doesn't exist
        if software_lower == "blender" && !file_path.exists() {
            println!("Creating new Blender file with path config: {:?}", file_path);

            // Try multiple locations for the script
            let script_path = {
                let exe_dir = std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                    .unwrap_or_else(|| PathBuf::from("."));

                let candidates = vec![
                    exe_dir.join("templates").join("blender_setup.py"),  // Portable: next to exe
                    exe_dir.join("..").join("templates").join("blender_setup.py"),  // Some installers
                    PathBuf::from("src-tauri/templates/blender_setup.py"),  // Dev mode
                ];

                // Find first existing path
                candidates.into_iter().find(|p| p.exists())
            };

            if let Some(script_path) = script_path {
                // Spawn Blender process
                let child = Command::new(&input.executable_path)
                    .arg("--background")
                    .arg("--python")
                    .arg(&script_path)
                    .arg("--")
                    .arg(file_path.to_str().unwrap())
                    .arg(&project_path)
                    .spawn()
                    .map_err(|e| format!("Failed to run Blender setup: {}", e))?;

                let child_id = child.id();
                println!("Blender setup process started (PID: {})", child_id);

                // Wait for file to be created (max 10 seconds)
                let timeout = Duration::from_secs(10);
                let start = std::time::Instant::now();

                loop {
                    if file_path.exists() {
                        println!("✓ Blender file created successfully");
                        break;
                    }

                    if start.elapsed() > timeout {
                        println!("⚠ Timeout waiting for file creation");
                        break;
                    }

                    std::thread::sleep(Duration::from_millis(500));
                }

                // Force kill the background process using taskkill
                println!("Killing Blender background process {}", child_id);
                let kill_result = Command::new("taskkill")
                    .args(&["/F", "/PID", &child_id.to_string()])
                    .output();

                match kill_result {
                    Ok(output) => {
                        if output.status.success() {
                            println!("✓ Background process killed successfully");
                        } else {
                            println!("⚠ Failed to kill process: {:?}", String::from_utf8_lossy(&output.stderr));
                        }
                    }
                    Err(e) => {
                        println!("⚠ Error killing process: {}", e);
                    }
                }

                // Give it a moment to actually die
                std::thread::sleep(Duration::from_millis(500));
            } else {
                println!("Warning: Blender setup script not found");
            }
        }

        // Log before launching
        println!("About to launch {} with file: {:?}", software_lower, file_path);
        println!("File exists before launch: {}", file_path.exists());

        // For Houdini, create project using hython if it doesn't exist
        if software_lower == "houdini" && !file_path.exists() {
            let hython_path = find_hython_path(&input.executable_path)?;

            // Create Python script to save empty hip file
            let file_path_str = file_path.to_str()
                .ok_or("Invalid file path encoding")?
                .replace("\\", "\\\\"); // Escape backslashes for Python

            let python_script = format!("import hou; hou.hipFile.save(r'{}')", file_path_str);

            // Execute hython to create the file
            let output = Command::new(&hython_path)
                .arg("-c")
                .arg(&python_script)
                .output()
                .map_err(|e| format!("Failed to execute hython: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("hython failed to create project: {}", stderr));
            }
        }

        // For Houdini on Windows, open the file through Windows Explorer
        // This mimics double-clicking the file in Explorer and preserves all environment variables
        if software_lower == "houdini" {
            Command::new("explorer")
                .arg(file_path.to_str().unwrap())
                .spawn()
                .map_err(|e| format!("Failed to open Houdini file: {}", e))?;
        } else {
            // For all other software (including Blender), launch normally
            Command::new(&input.executable_path)
                .arg(&file_path)
                .spawn()
                .map_err(|e| format!("Failed to launch software: {}", e))?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-a")
            .arg(&input.executable_path)
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to launch software: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new(&input.executable_path)
            .arg(&file_path)
            .current_dir(&project_path)
            .spawn()
            .map_err(|e| format!("Failed to launch software: {}", e))?;
    }

    Ok(file_name)
}

#[tauri::command]
async fn open_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open finder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn open_file(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Use cmd /c start to open file with default application
        Command::new("cmd")
            .args(&["/c", "start", "", &file_path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
}

#[tauri::command]
fn get_folder_structure(path: String) -> Result<Vec<FileNode>, String> {
    read_dir_recursive(&path, 2) // Limit depth to 2 levels
}

fn read_dir_recursive(path: &str, max_depth: usize) -> Result<Vec<FileNode>, String> {
    if max_depth == 0 {
        return Ok(vec![]);
    }

    let path_obj = std::path::Path::new(path);
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

    // Sort: directories first, then files
    nodes.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(nodes)
}

#[tauri::command]
async fn set_project_thumbnail(project_path: String, image_path: String) -> Result<String, String> {
    let project_dir = PathBuf::from(&project_path);
    let source_path = PathBuf::from(&image_path);

    if !source_path.exists() {
        return Err("Source image does not exist".to_string());
    }

    // Delete old thumbnails (with any extension and timestamp)
    if let Ok(entries) = fs::read_dir(&project_dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();
            if name_str.starts_with(".thumbnail") {
                let _ = fs::remove_file(entry.path()); // Ignore errors
            }
        }
    }

    // Get file extension
    let extension = source_path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");

    // Add timestamp to force cache refresh
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let thumbnail_name = format!(".thumbnail_{}.{}", timestamp, extension);
    let dest_path = project_dir.join(&thumbnail_name);

    // Copy the file
    fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("Failed to copy thumbnail: {}", e))?;

    Ok(thumbnail_name)
}

#[derive(Debug, Serialize)]
struct ProjectVersion {
    name: String,
    path: String,
    software: Vec<String>,
    created_at: u64, // Unix timestamp in seconds
}

#[tauri::command]
async fn get_project_versions(project_path: String) -> Result<Vec<ProjectVersion>, String> {
    let project_dir = PathBuf::from(&project_path);

    // Get project name from metadata
    let metadata_path = project_dir.join(".project-metadata.json");
    let project_name = if let Ok(content) = fs::read_to_string(&metadata_path) {
        if let Ok(project) = serde_json::from_str::<Project>(&content) {
            project.name
        } else {
            return Err("Failed to parse project metadata".to_string());
        }
    } else {
        return Err("Project metadata not found".to_string());
    };

    let base_name = project_name.replace(" ", "");
    let mut versions = Vec::new();

    // List of software folders to search
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Cinema4D",
        "Substance", "Unreal", "Unity", "ZBrush", "Marmoset"
    ];

    // Search in each software folder
    for software_folder in software_folders {
        let software_dir = project_dir.join(software_folder);
        if !software_dir.exists() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(&software_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        let file_name = entry.file_name();
                        let file_name_str = file_name.to_string_lossy();

                        // Check if file matches pattern: BaseName_v###.ext
                        if file_name_str.starts_with(&base_name) && file_name_str.contains("_v") {
                            let file_path = entry.path();

                            // Determine software by extension
                            let extension = file_path.extension()
                                .and_then(|e| e.to_str())
                                .unwrap_or("");

                            // Skip .blend1 backup files
                            if extension == "blend1" {
                                continue;
                            }

                            let software_name = match extension {
                                "blend" => "Blender",
                                "hip" => "Houdini",
                                "ma" | "mb" => "Maya",
                                "aep" => "After Effects",
                                "c4d" => "Cinema 4D",
                                "spp" => "Substance",
                                "uproject" => "Unreal",
                                "unity" => "Unity",
                                "zpr" => "ZBrush",
                                "tbscene" => "Marmoset",
                                _ => "Unknown",
                            };

                            // Get file creation time
                            let created_at = if let Ok(metadata) = entry.metadata() {
                                if let Ok(created) = metadata.created() {
                                    created.duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_secs()
                                } else {
                                    0
                                }
                            } else {
                                0
                            };

                            versions.push(ProjectVersion {
                                name: file_name_str.to_string(),
                                path: file_path.to_string_lossy().to_string(),
                                software: vec![software_name.to_string()],
                                created_at,
                            });
                        }
                    }
                }
            }
        }
    }

    // Sort versions by name
    versions.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(versions)
}

#[tauri::command]
async fn cleanup_backup_files(project_path: String) -> Result<u32, String> {
    let project_dir = PathBuf::from(&project_path);
    let mut deleted_count = 0u32;

    // List of software folders to search
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Cinema4D",
        "Substance", "Unreal", "Unity", "ZBrush", "Marmoset"
    ];

    // Search in each software folder
    for software_folder in software_folders {
        let software_dir = project_dir.join(software_folder);
        if !software_dir.exists() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(&software_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        let file_path = entry.path();
                        let extension = file_path.extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("");

                        // Delete .blend1 backup files
                        if extension == "blend1" {
                            if fs::remove_file(&file_path).is_ok() {
                                deleted_count += 1;
                                println!("Deleted backup file: {:?}", file_path);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(deleted_count)
}

#[tauri::command]
async fn get_directory_size(path: String) -> Result<u64, String> {
    fn calculate_size(dir: &PathBuf) -> Result<u64, std::io::Error> {
        let mut total_size = 0u64;

        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();

                if path.is_dir() {
                    total_size += calculate_size(&path)?;
                } else {
                    total_size += entry.metadata()?.len();
                }
            }
        }

        Ok(total_size)
    }

    let dir_path = PathBuf::from(&path);
    calculate_size(&dir_path)
        .map_err(|e| format!("Failed to calculate directory size: {}", e))
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(&["/c", "start", &url])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn open_links_in_browser(links: Vec<Link>) -> Result<(), String> {
    if links.is_empty() {
        // If no links provided, open default browser with empty page
        #[cfg(target_os = "windows")]
        {
            Command::new("cmd")
                .args(&["/c", "start", "http://"])
                .spawn()
                .map_err(|e| format!("Failed to open browser: {}", e))?;
        }

        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .arg("-a")
                .arg("Safari")
                .spawn()
                .map_err(|e| format!("Failed to open browser: {}", e))?;
        }

        #[cfg(target_os = "linux")]
        {
            Command::new("xdg-open")
                .arg("about:blank")
                .spawn()
                .map_err(|e| format!("Failed to open browser: {}", e))?;
        }
    } else {
        // Open each link in a new tab
        for link in links {
            #[cfg(target_os = "windows")]
            {
                Command::new("cmd")
                    .args(&["/c", "start", &link.url])
                    .spawn()
                    .map_err(|e| format!("Failed to open URL {}: {}", link.url, e))?;
            }

            #[cfg(target_os = "macos")]
            {
                Command::new("open")
                    .arg(&link.url)
                    .spawn()
                    .map_err(|e| format!("Failed to open URL {}: {}", link.url, e))?;
            }

            #[cfg(target_os = "linux")]
            {
                Command::new("xdg-open")
                    .arg(&link.url)
                    .spawn()
                    .map_err(|e| format!("Failed to open URL {}: {}", link.url, e))?;
            }

            // Small delay to avoid overwhelming the system
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    Ok(())
}

#[tauri::command]
async fn fetch_page_title(url: String) -> Result<String, String> {
    println!("Fetching title for URL: {}", url);

    // Validate URL format
    if !url.starts_with("http://") && !url.starts_with("https://") {
        println!("Invalid URL format");
        return Err("URL must start with http:// or https://".to_string());
    }

    // Try to fetch page and extract title with timeout (async)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    match client.get(&url).send().await {
        Ok(response) => {
            println!("Got response with status: {}", response.status());

            if !response.status().is_success() {
                println!("Response not successful, falling back to domain");
                return extract_domain_name(&url);
            }

            match response.text().await {
                Ok(html_content) => {
                    println!("Got HTML content, length: {}", html_content.len());
                    let document = Html::parse_document(&html_content);

                    // Try to find <title> tag
                    if let Ok(title_selector) = Selector::parse("title") {
                        if let Some(title_element) = document.select(&title_selector).next() {
                            let title = title_element.text().collect::<String>().trim().to_string();
                            println!("Found title: {}", title);
                            if !title.is_empty() {
                                return Ok(title);
                            }
                        } else {
                            println!("No title element found");
                        }
                    } else {
                        println!("Failed to parse title selector");
                    }

                    // Fallback to domain name if no title found
                    println!("Falling back to domain name");
                    extract_domain_name(&url)
                }
                Err(e) => {
                    println!("Failed to get response text: {}", e);
                    extract_domain_name(&url)
                }
            }
        }
        Err(e) => {
            println!("Failed to fetch URL: {}", e);
            extract_domain_name(&url)
        }
    }
}

fn extract_domain_name(url: &str) -> Result<String, String> {
    // Parse URL and extract domain
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(domain) = parsed.host_str() {
            return Ok(domain.to_string());
        }
    }

    // Last fallback - return the URL itself
    Ok(url.to_string())
}

#[tauri::command]
async fn start_watching_project(app_handle: tauri::AppHandle, project_path: String) -> Result<(), String> {
    let project_dir = PathBuf::from(&project_path);

    // List of software folders to watch
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Cinema4D",
        "Substance", "Unreal", "Unity", "ZBrush", "Marmoset"
    ];

    // Clone app_handle for the closure
    let app = app_handle.clone();
    let project_path_clone = project_path.clone();

    // Spawn a new thread for the watcher
    std::thread::spawn(move || {
        // Create debouncer with 500ms delay
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

        // Keep the watcher alive
        loop {
            std::thread::sleep(Duration::from_secs(1));
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_watching_project() -> Result<(), String> {
    // Watcher will be stopped when thread is dropped
    Ok(())
}

#[tauri::command]
fn save_feedback(feedback: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    // Get app data directory
    let app_dir = tauri::api::path::app_data_dir(&tauri::Config::default())
        .ok_or_else(|| "Failed to get app data directory".to_string())?;

    // Create directory if it doesn't exist
    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app directory: {}", e))?;

    let feedback_path = app_dir.join("feedback.txt");

    // Get app version from package info
    let version = app_handle.package_info().version.to_string();
    let app_name = app_handle.package_info().name.clone();

    // Collect system information
    let mut sys = System::new_all();
    sys.refresh_all();

    let os_version = System::long_os_version().unwrap_or_else(|| "Unknown".to_string());
    let kernel_version = System::kernel_version().unwrap_or_else(|| "Unknown".to_string());
    let hostname = System::host_name().unwrap_or_else(|| "Unknown".to_string());
    let total_memory = sys.total_memory() / 1024 / 1024; // Convert to MB
    let used_memory = sys.used_memory() / 1024 / 1024;
    let cpu_count = sys.cpus().len();
    let cpu_brand = sys.cpus().first().map(|cpu| cpu.brand()).unwrap_or("Unknown");

    // Read existing feedback
    let existing = fs::read_to_string(&feedback_path).unwrap_or_default();

    // Append new feedback with timestamp and system info
    let timestamp = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let metadata = format!(
        "Timestamp: {}\n\
        App Name: {}\n\
        App Version: {}\n\
        OS: {}\n\
        Kernel: {}\n\
        Hostname: {}\n\
        CPU: {} ({} cores)\n\
        Memory: {} MB / {} MB\n",
        timestamp,
        app_name,
        version,
        os_version,
        kernel_version,
        hostname,
        cpu_brand,
        cpu_count,
        used_memory,
        total_memory
    );

    let new_entry = format!(
        "\n================================================================================\n\
        USER FEEDBACK:\n{}\n\n\
        SYSTEM METADATA:\n{}\
        ================================================================================\n",
        feedback,
        metadata
    );
    let updated = existing + &new_entry;

    // Write back to file
    fs::write(&feedback_path, updated)
        .map_err(|e| format!("Failed to write feedback: {}", e))?;

    Ok(())
}

#[tauri::command]
fn read_feedback() -> Result<String, String> {
    // Get app data directory
    let app_dir = tauri::api::path::app_data_dir(&tauri::Config::default())
        .ok_or_else(|| "Failed to get app data directory".to_string())?;

    let feedback_path = app_dir.join("feedback.txt");

    // Read feedback file
    let content = fs::read_to_string(&feedback_path)
        .unwrap_or_default();

    // Extract only user feedback text (everything between "USER FEEDBACK:" and "SYSTEM METADATA:")
    let mut user_feedbacks = Vec::new();
    for section in content.split("================================================================================") {
        if section.contains("USER FEEDBACK:") {
            if let Some(user_part) = section.split("USER FEEDBACK:").nth(1) {
                if let Some(feedback_text) = user_part.split("SYSTEM METADATA:").next() {
                    user_feedbacks.push(feedback_text.trim());
                }
            }
        }
    }

    Ok(user_feedbacks.join("\n\n---\n\n"))
}

#[tauri::command]
fn read_feedback_full() -> Result<String, String> {
    // Get app data directory
    let app_dir = tauri::api::path::app_data_dir(&tauri::Config::default())
        .ok_or_else(|| "Failed to get app data directory".to_string())?;

    let feedback_path = app_dir.join("feedback.txt");

    // Read full feedback file with all metadata
    fs::read_to_string(&feedback_path)
        .or_else(|_| Ok::<String, String>(String::new()))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            create_project,
            load_projects,
            update_project,
            delete_project,
            launch_software,
            open_in_explorer,
            open_file,
            get_folder_structure,
            set_project_thumbnail,
            get_project_versions,
            cleanup_backup_files,
            get_directory_size,
            open_url,
            open_links_in_browser,
            fetch_page_title,
            start_watching_project,
            stop_watching_project,
            save_feedback,
            read_feedback,
            read_feedback_full,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}