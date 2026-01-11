#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod time_tracking;
mod file_naming;
mod blend_thumbnail;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use chrono::Utc;
use uuid::Uuid;
use scraper::{Html, Selector};
use sysinfo::System;
use lazy_static::lazy_static;
use parking_lot::Mutex;
use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebounceEventResult};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;
use tauri::Manager;
use regex;
use walkdir::WalkDir;

// Global state for file watcher
struct WatcherHandle {
    thread: Option<JoinHandle<()>>,
    shutdown: Arc<AtomicBool>,
}

lazy_static! {
    static ref WATCHER_HANDLE: Mutex<Option<WatcherHandle>> = Mutex::new(None);
}

// Embedded After Effects template
const TEMPLATE_AEP: &[u8] = include_bytes!("../templates/empty.aep");
// Embedded Blender setup script
const BLENDER_SETUP_PY: &str = include_str!("../templates/blender_setup.py");

// Window startup configuration for instant maximize on preferred monitor
#[derive(Debug, Serialize, Deserialize, Default)]
struct WindowStartupConfig {
    #[serde(rename = "autoMaximizeOnLaunch", default)]
    auto_maximize_on_launch: bool,
    #[serde(rename = "preferredMonitor", default)]
    preferred_monitor: usize,
    // For restoring position when auto-maximize is off
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
    #[serde(rename = "isMaximized", default)]
    is_maximized: Option<bool>,
}

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
    #[serde(rename = "completedAt", alias = "completed_at")]
    completed_at: Option<String>,
    todos: Option<Vec<TodoItem>>,
    #[serde(rename = "hasScenes", alias = "has_scenes")]
    has_scenes: Option<bool>,
    #[serde(rename = "hasShots", alias = "has_shots")]
    has_shots: Option<bool>,
    scenes: Option<Vec<Scene>>,
    #[serde(rename = "currentSceneId", alias = "current_scene_id")]
    current_scene_id: Option<String>,
    shots: Option<Vec<Shot>>,
    #[serde(rename = "currentShotId", alias = "current_shot_id")]
    current_shot_id: Option<String>,
    category: Option<String>,
    #[serde(rename = "timeEntries", alias = "time_entries")]
    time_entries: Option<Vec<serde_json::Value>>,
    #[serde(rename = "totalMinutesSpent", alias = "total_minutes_spent")]
    total_minutes_spent: Option<u32>,
    #[serde(rename = "hourlyRate", alias = "hourly_rate")]
    hourly_rate: Option<f64>,
    #[serde(rename = "targetHourlyRate", alias = "target_hourly_rate")]
    target_hourly_rate: Option<f64>,
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
    #[serde(rename = "executablePath", alias = "executable_path")]
    executable_path: String,
    version: Option<String>,
    #[serde(default)]
    icon: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Note {
    id: String,
    content: String,
    #[serde(rename = "createdAt", alias = "created_at")]
    created_at: String,
    #[serde(rename = "updatedAt", alias = "updated_at", default = "default_updated_at")]
    updated_at: String,
}

// Default function for updated_at - uses created_at or current time
fn default_updated_at() -> String {
    chrono::Utc::now().to_rfc3339()
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
    #[serde(rename = "createdAt", skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Scene {
    id: String,
    number: u32, // 0 for Main, 1+ for SC001, SC002...
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    preview: Option<String>, // Path to preview image
    todos: Vec<TodoItem>,
    notes: Vec<Note>,
    #[serde(rename = "browserTabs")]
    browser_tabs: Vec<BrowserTab>,
    links: Vec<Link>,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    wip: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Shot {
    id: String,
    #[serde(rename = "sceneId", skip_serializing_if = "Option::is_none")]
    scene_id: Option<String>, // Optional: scene this shot belongs to (None in shots-only mode)
    number: u32,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    preview: Option<String>, // Path to preview image
    todos: Vec<TodoItem>,
    notes: Vec<Note>,
    #[serde(rename = "browserTabs")]
    browser_tabs: Vec<BrowserTab>,
    links: Vec<Link>,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    wip: Option<bool>,
}

// WAL (Write-Ahead Log) structures for crash recovery during rename operations
#[derive(Debug, Serialize, Deserialize, Clone)]
struct RenameWAL {
    operation_type: String, // "rename_shot" | "rename_scene" | "rename_shot_thumbnails" | "rename_scene_thumbnails"
    timestamp: String,
    project_path: String,
    operations: Vec<RenameOperation>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RenameOperation {
    old_path: String,
    new_path: String,
    completed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct SceneFileCount {
    #[serde(rename = "versionFiles")]
    version_files: u32,
    thumbnails: u32,
}

#[derive(Clone, Serialize)]
struct RenameProgress {
    current: u32,
    total: u32,
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
    #[serde(rename = "hasScenes")]
    has_scenes: Option<bool>,
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
    #[serde(rename = "sceneName")]
    scene_name: Option<String>,
    #[serde(rename = "shotNumber")]
    shot_number: Option<u32>,
    #[serde(rename = "specialContext")]
    special_context: Option<String>,
    #[serde(rename = "assetName")]
    asset_name: Option<String>,
}

fn get_software_folder_name(software: &str) -> &str {
    match software.to_lowercase().as_str() {
        "blender" => "Blender",
        "houdini" => "Houdini",
        "maya" => "Maya",
        "after-effects" | "after effects" => "AfterEffects",
        "photoshop" => "Photoshop",
        "cinema4d" | "cinema 4d" => "Cinema4D",
        "substance" | "substance painter" => "Substance",
        "unreal" | "unreal engine" => "Unreal",
        "unity" => "Unity",
        "zbrush" => "ZBrush",
        "marmoset" | "marmoset toolbag" => "Marmoset",
        _ => software,
    }
}

fn read_project_metadata(project_path: &PathBuf) -> Result<Project, String> {
    let metadata_path = project_path.join(".project-metadata.json");
    let metadata_content = fs::read_to_string(&metadata_path)
        .map_err(|e| format!("Failed to read project metadata: {}", e))?;
    serde_json::from_str(&metadata_content)
        .map_err(|e| format!("Failed to parse project metadata: {}", e))
}

fn sanitize_folder_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

fn get_folder_template(software: &str, _has_scenes: bool, _has_shots: bool) -> Vec<FolderItem> {
    match software.to_lowercase().as_str() {
        "blender" => vec![
            FolderItem::Nested {
                name: "Geo".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Export".to_string()),
                    FolderItem::Simple("Import".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Tex".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Export".to_string()),
                    FolderItem::Simple("Import".to_string()),
                    FolderItem::Simple("Plates".to_string()),
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
        ],
        "houdini" => vec![
            FolderItem::Nested {
                name: "Geo".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Export".to_string()),
                    FolderItem::Simple("Import".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Tex".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Export".to_string()),
                    FolderItem::Simple("Import".to_string()),
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
        "photoshop" => vec![
            FolderItem::Nested {
                name: "Source".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Drafts".to_string()),
                    FolderItem::Simple("Final".to_string()),
                ],
            },
            FolderItem::Nested {
                name: "Assets".to_string(),
                subfolders: vec![
                    FolderItem::Simple("Textures".to_string()),
                    FolderItem::Simple("Brushes".to_string()),
                    FolderItem::Simple("Patterns".to_string()),
                    FolderItem::Simple("Fonts".to_string()),
                ],
            },
            FolderItem::Simple("Export".to_string()),
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

    let has_scenes = input.has_scenes.unwrap_or(false);

    for software in &input.software {
        let folder_name = get_software_folder_name(software);
        let software_path = project_path.join(folder_name);

        if has_scenes {
            // For projects with scenes: create only empty software folders
            // Full hierarchy will be created inside scene folders when scenes are added
            fs::create_dir_all(&software_path)
                .map_err(|e| format!("Failed to create software folder {}: {}", folder_name, e))?;
        } else {
            // For projects without scenes: create full folder hierarchy (flat structure)
            let software_folders = get_folder_template(
                software,
                false,
                input.has_shots.unwrap_or(false)
            );
            for folder_item in software_folders {
                create_folder_item(&software_path, &folder_item)?;
            }
        }
    }

    // Common folders
    let mut common_folders = vec!["_GlobalReferences", "_GlobalAssets"];
    if has_scenes {
        common_folders.push("_GlobalCompose");
    }
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
            icon: None,
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
        completed_at: None,
        todos: Some(vec![]),
        has_scenes: input.has_scenes,
        has_shots: input.has_shots,
        scenes: Some(vec![]),
        current_scene_id: None,
        shots: Some(vec![]),
        current_shot_id: None,
        category: input.category,
        time_entries: Some(vec![]),
        total_minutes_spent: Some(0),
        hourly_rate: None,
        target_hourly_rate: None,
    };

    let metadata_path = project_path.join(".project-metadata.json");
    let json = serde_json::to_string_pretty(&project)
        .map_err(|e| format!("Failed to serialize project: {}", e))?;
    fs::write(metadata_path, json)
        .map_err(|e| format!("Failed to write metadata: {}", e))?;

    Ok(project)
}

#[tauri::command]
async fn add_software_to_project(project_path: String, software_name: String) -> Result<(), String> {
    let project_path_buf = PathBuf::from(&project_path);

    // Check if project exists
    if !project_path_buf.exists() {
        return Err("Project path does not exist".to_string());
    }

    // Read project metadata to get has_scenes and has_shots
    let metadata_path = project_path_buf.join(".project-metadata.json");
    let metadata_content = fs::read_to_string(&metadata_path)
        .map_err(|e| format!("Failed to read project metadata: {}", e))?;
    let project: Project = serde_json::from_str(&metadata_content)
        .map_err(|e| format!("Failed to parse project metadata: {}", e))?;

    // Get folder template for the software
    let software_folders = get_folder_template(
        &software_name,
        project.has_scenes.unwrap_or(false),
        project.has_shots.unwrap_or(false)
    );
    let folder_name = get_software_folder_name(&software_name);
    let software_path = project_path_buf.join(folder_name);

    // Create software folders if they don't exist
    if !software_path.exists() {
        for folder_item in software_folders {
            create_folder_item(&software_path, &folder_item)?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn remove_software_from_project(project_path: String, software_name: String) -> Result<(), String> {
    let project_path_buf = PathBuf::from(&project_path);

    // Check if project exists
    if !project_path_buf.exists() {
        return Err("Project path does not exist".to_string());
    }

    // Get software folder name
    let folder_name = get_software_folder_name(&software_name);
    let software_path = project_path_buf.join(folder_name);

    // Delete software folder if it exists
    if software_path.exists() {
        fs::remove_dir_all(&software_path)
            .map_err(|e| format!("Failed to delete software folder: {}", e))?;
    }

    Ok(())
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
                // Check for and recover from incomplete WAL operations
                let project_path_str = entry.path().to_string_lossy().to_string();
                let _ = check_and_recover_wal(&project_path_str);

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

#[derive(Serialize)]
struct LaunchResult {
    file_name: String,
    pid: u32,
}

/// Find PID of a process that has a specific file open
#[cfg(target_os = "windows")]
fn find_process_with_file(_file_path: &str, process_name: &str) -> Option<u32> {
    use std::time::{SystemTime, UNIX_EPOCH};

    // Support multiple patterns separated by | (e.g., "houdin|hindie" for Houdini)
    let patterns: Vec<&str> = process_name.split('|').map(|s| s.trim()).collect();
    println!("[PID_SEARCH] Starting search for process matching patterns: {:?}", patterns);

    let mut system = System::new_all();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

    // Check if this is Photoshop/After Effects (they use launcher processes)
    let is_adobe_software = patterns.iter().any(|p| p.contains("photoshop") || p.contains("afterfx"));

    // Wait up to 20 seconds for process to start (Houdini can be very slow)
    for attempt in 0..40 {
        std::thread::sleep(Duration::from_millis(500));
        system.refresh_all();

        // Find newest process matching the name (started within last 60 seconds)
        let mut candidates: Vec<(u32, u64)> = Vec::new();

        for (pid, process) in system.processes() {
            let proc_name = process.name().to_lowercase();
            // Check if process name matches ANY of the patterns
            if patterns.iter().any(|pattern| proc_name.contains(&pattern.to_lowercase())) {
                let start_time = process.start_time();
                // If process was started recently (within last 60 seconds for slow-starting apps like Houdini)
                // Use checked subtraction to avoid underflow if start_time > now
                if let Some(age) = now.checked_sub(start_time) {
                    if age < 60 {
                        candidates.push((pid.as_u32(), start_time));
                        println!("[PID_SEARCH] Found candidate: {} (PID: {}, started: {}s ago)",
                            process.name(), pid, age);
                    }
                } else if start_time.saturating_sub(now) < 5 {
                    // Process start time is in "future" but within 5 seconds (clock skew)
                    // This can happen due to timing differences between system clocks
                    candidates.push((pid.as_u32(), start_time));
                    println!("[PID_SEARCH] Found candidate: {} (PID: {}, future start time but within tolerance)",
                        process.name(), pid);
                } else {
                    // Too far in future, skip it
                    println!("[PID_SEARCH] Skipping process with future start time: {} ({}s in future)",
                        process.name(), start_time.saturating_sub(now));
                }
            }
        }

        // For Adobe software: prefer OLDER stable process over brand new launcher process
        // For others: prefer NEWEST process
        if let Some((pid, _start_time)) = if is_adobe_software {
            // Find oldest process that's at least 2 seconds old (to avoid launcher process)
            candidates.iter()
                .filter(|(_, st)| {
                    if let Some(age) = now.checked_sub(*st) {
                        age >= 2  // At least 2 seconds old
                    } else {
                        false
                    }
                })
                .min_by_key(|(_, st)| st)
                .or_else(|| candidates.iter().min_by_key(|(_, st)| st))  // Fallback to any process
        } else {
            candidates.iter().max_by_key(|(_, st)| st)
        } {
            println!("[PID_SEARCH] ✓ Selected {} process with PID: {}",
                if is_adobe_software { "stable" } else { "newest" }, pid);
            return Some(*pid);
        }

        println!("[PID_SEARCH] Attempt {}/40: No matching process found yet", attempt + 1);
    }

    println!("[PID_SEARCH] ✗ Failed to find process after 20 seconds");
    None
}

/// Unified software launcher configuration
#[cfg(target_os = "windows")]
struct SoftwareLaunchConfig {
    use_explorer: bool,      // Use explorer.exe to launch (e.g., Houdini)
    needs_pid_lookup: bool,  // Need to find real PID after launch
    process_name: &'static str,  // Process name to search for (e.g., "houdin", "afterfx")
}

#[cfg(target_os = "windows")]
impl SoftwareLaunchConfig {
    /// Get launch configuration based on file extension
    fn from_extension(ext: &str) -> Self {
        match ext {
            "hip" | "hiplc" | "hipnc" => SoftwareLaunchConfig {
                use_explorer: false, // Direct launch with HFS env variable
                needs_pid_lookup: true,
                process_name: "houdin|hindie", // Matches houdinifx.exe, houdini.exe, hindie.steam.exe (Steam version)
            },
            "aep" => SoftwareLaunchConfig {
                use_explorer: false,
                needs_pid_lookup: true,
                process_name: "afterfx", // Matches "AfterFX.exe"
            },
            "psd" | "psb" => SoftwareLaunchConfig {
                use_explorer: false,
                needs_pid_lookup: true,
                process_name: "photoshop", // Matches "Photoshop.exe"
            },
            _ => SoftwareLaunchConfig {
                use_explorer: false,
                needs_pid_lookup: false,
                process_name: "",
            },
        }
    }

    /// Get launch configuration based on software name
    fn from_software_name(software: &str) -> Self {
        let software_lower = software.to_lowercase();
        if software_lower == "houdini" {
            SoftwareLaunchConfig {
                use_explorer: false, // Direct launch with HFS env variable
                needs_pid_lookup: true,
                process_name: "houdin|hindie", // Matches houdinifx.exe, houdini.exe, hindie.steam.exe (Steam version)
            }
        } else if software_lower == "after effects" || software_lower == "after-effects" {
            SoftwareLaunchConfig {
                use_explorer: false,
                needs_pid_lookup: true,
                process_name: "afterfx",
            }
        } else if software_lower == "photoshop" {
            SoftwareLaunchConfig {
                use_explorer: false,
                needs_pid_lookup: true,
                process_name: "photoshop",
            }
        } else if software_lower == "blender" {
            SoftwareLaunchConfig {
                use_explorer: false,
                needs_pid_lookup: true,
                process_name: "blender",
            }
        } else {
            SoftwareLaunchConfig {
                use_explorer: false,
                needs_pid_lookup: false,
                process_name: "",
            }
        }
    }

    /// Launch software with unified logic
    fn launch(&self, executable_path: &str, file_path: &str) -> Result<u32, String> {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        println!("[SoftwareLauncher] use_explorer: {}, needs_pid_lookup: {}, process_name: '{}'",
            self.use_explorer, self.needs_pid_lookup, self.process_name);

        // Step 1: Spawn the process
        let child = if self.use_explorer {
            println!("[SoftwareLauncher] Launching via explorer.exe: {}", file_path);
            Command::new("explorer")
                .arg(file_path)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to open file via explorer: {}", e))?
        } else {
            // For Houdini: launch with proper environment variables for user preferences
            if self.process_name.contains("houdin") || self.process_name.contains("hindie") {
                println!("[SoftwareLauncher] Launching Houdini with env setup: {} {}", executable_path, file_path);

                // Extract version from executable path (e.g., "Houdini 20.0.653" -> "20.0")
                let hfs_path = std::path::Path::new(executable_path)
                    .parent()  // bin
                    .and_then(|p| p.parent())  // Houdini X.X.XXX
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();

                // Try to extract major.minor version for HOUDINI_USER_PREF_DIR
                let version = std::path::Path::new(&hfs_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .and_then(|name| {
                        // Extract version like "20.0" from "Houdini 20.0.653" or "Houdini Indie"
                        let parts: Vec<&str> = name.split(|c: char| !c.is_ascii_digit() && c != '.').collect();
                        for part in parts {
                            if part.contains('.') {
                                let ver_parts: Vec<&str> = part.split('.').collect();
                                if ver_parts.len() >= 2 {
                                    return Some(format!("{}.{}", ver_parts[0], ver_parts[1]));
                                }
                            }
                        }
                        None
                    });

                let user_pref_dir = if let Some(ver) = &version {
                    let home = std::env::var("USERPROFILE").unwrap_or_default();
                    format!("{}\\Documents\\houdini{}", home, ver)
                } else {
                    String::new()
                };

                // HOME is critical - Houdini uses $HOME to find preferences on Windows
                let home = std::env::var("USERPROFILE").unwrap_or_default();
                let home_docs = format!("{}\\Documents", home);

                println!("[SoftwareLauncher] HFS={}", hfs_path);
                println!("[SoftwareLauncher] HOME={}", home_docs);
                println!("[SoftwareLauncher] HOUDINI_USER_PREF_DIR={}", user_pref_dir);

                let mut cmd = Command::new(executable_path);
                cmd.arg(file_path)
                   .creation_flags(CREATE_NO_WINDOW);

                // Set critical environment variables for Houdini to find user preferences
                // HOME is the most important - Houdini looks for $HOME/houdiniX.Y/
                cmd.env("HOME", &home_docs);

                if !hfs_path.is_empty() {
                    cmd.env("HFS", &hfs_path);
                }
                if !user_pref_dir.is_empty() {
                    cmd.env("HOUDINI_USER_PREF_DIR", &user_pref_dir);
                }

                cmd.spawn()
                   .map_err(|e| format!("Failed to launch Houdini: {}", e))?
            } else {
                println!("[SoftwareLauncher] Launching directly: {} {}", executable_path, file_path);
                Command::new(executable_path)
                    .arg(file_path)
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn()
                    .map_err(|e| format!("Failed to launch software: {}", e))?
            }
        };

        let initial_pid = child.id();
        println!("[SoftwareLauncher] Initial PID from spawn: {}", initial_pid);

        // Step 2: Find real PID if needed
        let final_pid = if self.needs_pid_lookup {
            println!("[SoftwareLauncher] Looking for real process: '{}'", self.process_name);
            match find_process_with_file(file_path, self.process_name) {
                Some(real_pid) => {
                    println!("[SoftwareLauncher] ✓ Found real PID: {} (initial was: {})", real_pid, initial_pid);
                    real_pid
                }
                None => {
                    println!("[SoftwareLauncher] ⚠ Failed to find real PID, using initial: {}", initial_pid);
                    initial_pid
                }
            }
        } else {
            println!("[SoftwareLauncher] No PID lookup needed, using initial PID: {}", initial_pid);
            initial_pid
        };

        println!("[SoftwareLauncher] ==> FINAL PID: {}", final_pid);
        Ok(final_pid)
    }
}

#[tauri::command]
async fn launch_software(input: LaunchSoftwareInput) -> Result<LaunchResult, String> {
    let project_path = PathBuf::from(&input.project_path);

    // Determine file extension and software folder based on software
    let (file_extension, software_folder) = match input.software.to_lowercase().as_str() {
        "blender" => (".blend", "Blender"),
        "houdini" => (".hip", "Houdini"),
        "maya" => (".ma", "Maya"),
        "after effects" | "after-effects" => (".aep", "AfterEffects"),
        "photoshop" => (".psd", "Photoshop"),
        "cinema 4d" | "cinema4d" => (".c4d", "Cinema4D"),
        "substance" | "substance painter" => (".spp", "Substance"),
        "unreal" | "unreal engine" => (".uproject", "Unreal"),
        "unity" => (".unity", "Unity"),
        "zbrush" => (".zpr", "ZBrush"),
        "marmoset" | "marmoset toolbag" => (".tbscene", "Marmoset"),
        _ => (".txt", "Unknown"), // fallback
    };

    // Determine target folder based on special context or scene
    let software_path = if let Some(ref context) = input.special_context {
        // Special contexts: Asset -> _GlobalAssets/, Compose -> _GlobalCompose/
        let context_folder = match context.to_lowercase().as_str() {
            "asset" => "_GlobalAssets",
            "comp" | "compose" => "_GlobalCompose",
            _ => software_folder,
        };
        project_path.join(context_folder)
    } else if let Some(ref scene_name) = input.scene_name {
        // Projects with scenes: Software/SCENE_CODE/
        let scene_folder = sanitize_folder_name(scene_name);
        project_path.join(software_folder).join(scene_folder)
    } else {
        // Projects without scenes: Software/
        project_path.join(software_folder)
    };

    // Ensure target directory exists
    if !software_path.exists() {
        fs::create_dir_all(&software_path)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    // Build base name using file_naming module
    let base_name_with_scene_shot = if let (Some(scene_name), Some(shot_num)) = (&input.scene_name, input.shot_number) {
        // Use new naming format: PROJECT_SCENE_SHOT or PROJECT_SCENE_SHOT_CONTEXT
        let components = file_naming::FileNameComponents::new(
            input.project_name.clone(),
            scene_name.clone(),
            shot_num,
            input.special_context.clone(),
            0, // version doesn't matter for base name
            String::new(),
        );
        components.get_base_name()
    } else if let Some(ref context) = input.special_context {
        // Special context without scene/shot: PROJECT_CONTEXT or PROJECT_CONTEXT_ASSETNAME
        let project_base = input.project_name.replace(" ", "").to_uppercase();
        let context_suffix = context.to_uppercase();
        if let Some(ref asset_name) = input.asset_name {
            // Sanitize: remove anything except alphanumeric
            let clean_name: String = asset_name
                .chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>()
                .to_uppercase();
            // PROJECT_CONTEXT_ASSETNAME (e.g., NEW20_ASSET_CAR)
            format!("{}_{}_{}", project_base, context_suffix, clean_name)
        } else {
            // Old format: PROJECT_CONTEXT (e.g., NEW20_ASSET)
            format!("{}_{}", project_base, context_suffix)
        }
    } else {
        // Fallback to simple project name if no scene/shot
        input.project_name.replace(" ", "").to_uppercase()
    };

    let mut highest_version = 0;
    let mut latest_file: Option<PathBuf> = None;

    // Scan software directory for existing version files
    if let Ok(entries) = fs::read_dir(&software_path) {
        for entry in entries.flatten() {
            if let Ok(file_name) = entry.file_name().into_string() {
                // Check if file matches our base pattern and is versioned
                if file_name.starts_with(&base_name_with_scene_shot) && file_naming::FileNameComponents::is_versioned(&file_name) {
                    // Extract version number using file_naming module
                    if let Some(version_num) = file_naming::FileNameComponents::extract_version(&file_name) {
                        if version_num > highest_version {
                            highest_version = version_num;
                            latest_file = Some(entry.path());
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
        // Create new file with v001 using file_naming module
        let file_name = if let (Some(scene_name), Some(shot_num)) = (&input.scene_name, input.shot_number) {
            let components = file_naming::FileNameComponents::new(
                input.project_name.clone(),
                scene_name.clone(),
                shot_num,
                input.special_context.clone(),
                1, // v001
                file_extension.to_string(),
            );
            components.build()
        } else {
            format!("{}_v001{}", base_name_with_scene_shot, file_extension)
        };
        let file_path = software_path.join(&file_name);
        (file_path, file_name)
    };

    // Launch software
    #[cfg(target_os = "windows")]
    {
        let software_lower = input.software.to_lowercase();
        println!("[LAUNCH] Software: '{}' -> '{}'", input.software, software_lower);

        // For After Effects, create project from template if it doesn't exist
        if (software_lower == "after effects" || software_lower == "after-effects") && !file_path.exists() {
            fs::write(&file_path, TEMPLATE_AEP)
                .map_err(|e| format!("Failed to create After Effects project from template: {}", e))?;
        }

        // For Blender, create project with path configuration if it doesn't exist
        if software_lower == "blender" && !file_path.exists() {
            println!("Creating new Blender file with path config: {:?}", file_path);

            // Create nullSpace folder in Documents for scripts
            let documents_dir = dirs::document_dir()
                .ok_or_else(|| "Could not determine Documents directory".to_string())?;

            let templates_dir = documents_dir.join("nullSpace").join("templates");

            // Create directories - return error if this fails
            std::fs::create_dir_all(&templates_dir)
                .map_err(|e| format!("Failed to create templates directory: {}", e))?;

            let script_path = templates_dir.join("blender_setup.py");

            // Write embedded script to temp file
            if let Err(e) = std::fs::write(&script_path, BLENDER_SETUP_PY) {
                println!("Warning: Failed to write temporary script: {}", e);
            } else {
                // Build scene and shot codes for render path
                let mut cmd = Command::new(&input.executable_path);
                cmd.arg("--background")
                    .arg("--python")
                    .arg(&script_path)
                    .arg("--")
                    .arg(file_path.to_str().unwrap())
                    .arg(&project_path);

                // Add scene and shot codes if available (new format: just scene name and shot number)
                if let (Some(scene_name), Some(shot_num)) = (&input.scene_name, input.shot_number) {
                    // Pass scene name directly (no SC_ prefix)
                    let scene_normalized = scene_name.replace(" ", "").to_uppercase();

                    // Pass shot number as 3-digit string (no SH prefix)
                    let shot_str = format!("{:03}", shot_num);

                    cmd.arg(&scene_normalized);
                    cmd.arg(&shot_str);

                    println!("Setting Blender render path with scene: {}, shot: {}", scene_normalized, shot_str);
                }

                // Spawn Blender process
                let child = cmd.spawn()
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

        // Use unified launcher for all software
        let launcher = SoftwareLaunchConfig::from_software_name(&input.software);
        let pid = launcher.launch(&input.executable_path, file_path.to_str().unwrap())?;

        return Ok(LaunchResult {
            file_name,
            pid,
        });
    }

    #[cfg(target_os = "macos")]
    {
        let child = Command::new("open")
            .arg("-a")
            .arg(&input.executable_path)
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to launch software: {}", e))?;

        let pid = child.id();
        return Ok(LaunchResult {
            file_name,
            pid,
        });
    }

    #[cfg(target_os = "linux")]
    {
        let child = Command::new(&input.executable_path)
            .arg(&file_path)
            .current_dir(&project_path)
            .spawn()
            .map_err(|e| format!("Failed to launch software: {}", e))?;

        let pid = child.id();
        return Ok(LaunchResult {
            file_name,
            pid,
        });
    }
}

#[tauri::command]
async fn launch_software_without_project(executable_path: String, software: String) -> Result<(), String> {
    println!("[LAUNCH_NO_PROJECT] Launching {} without project context", software);

    #[cfg(target_os = "windows")]
    {
        let software_lower = software.to_lowercase();

        // Special handling for Houdini - use Windows file association
        if software_lower == "houdini" {
            // Create temporary .hip file
            let temp_dir = std::env::temp_dir();
            let temp_file = temp_dir.join(format!("houdini_temp_{}.hip", Utc::now().timestamp()));

            // Use hython to create empty hip file
            let hython_path = find_hython_path(&executable_path)?;
            let file_path_str = temp_file.to_str()
                .ok_or("Invalid file path encoding")?
                .replace("\\", "\\\\");

            let python_script = format!("import hou; hou.hipFile.save(r'{}')", file_path_str);
            let output = Command::new(&hython_path)
                .arg("-c")
                .arg(&python_script)
                .output()
                .map_err(|e| format!("Failed to execute hython: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("hython failed to create temp project: {}", stderr));
            }

            // Launch using Windows file association
            Command::new("explorer")
                .arg(&temp_file)
                .spawn()
                .map_err(|e| format!("Failed to launch Houdini: {}", e))?;

            println!("[LAUNCH_NO_PROJECT] Successfully launched Houdini via explorer");
            Ok(())
        } else {
            // Default behavior for other software
            Command::new(&executable_path)
                .spawn()
                .map_err(|e| format!("Failed to launch software: {}", e))?;

            println!("[LAUNCH_NO_PROJECT] Successfully launched {}", software);
            Ok(())
        }
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-a")
            .arg(&executable_path)
            .spawn()
            .map_err(|e| format!("Failed to launch software: {}", e))?;

        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        Command::new(&executable_path)
            .spawn()
            .map_err(|e| format!("Failed to launch software: {}", e))?;

        Ok(())
    }
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
async fn reveal_in_explorer(path: String) -> Result<(), String> {
    use std::path::Path;
    let path_obj = Path::new(&path);

    #[cfg(target_os = "windows")]
    {
        // Check if path is a directory or file
        if path_obj.is_dir() {
            // For directories, just open them directly
            Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open folder in explorer: {}", e))?;
        } else {
            // For files, use /select to highlight the file
            Command::new("explorer")
                .arg("/select,")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to reveal in explorer: {}", e))?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to reveal in finder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // For Linux, try to use the file manager's reveal functionality
        // Different DEs have different commands, so we try common ones
        let result = Command::new("dbus-send")
            .arg("--session")
            .arg("--dest=org.freedesktop.FileManager1")
            .arg("--type=method_call")
            .arg("/org/freedesktop/FileManager1")
            .arg("org.freedesktop.FileManager1.ShowItems")
            .arg(format!("array:string:file://{}", path))
            .arg("string:")
            .spawn();

        if result.is_err() {
            // Fallback to opening parent directory
            let parent = path_obj.parent()
                .ok_or_else(|| "Failed to get parent directory".to_string())?;
            Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn open_file(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Use cmd /c start to open file with default application
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
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

#[derive(Serialize)]
struct OpenFileResult {
    file_name: String,
    pid: u32,
}

#[tauri::command]
async fn open_file_with_tracking(file_path: String, executable_path: String) -> Result<OpenFileResult, String> {
    use std::path::Path;

    let path = Path::new(&file_path);
    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid file name")?
        .to_string();

    #[cfg(target_os = "windows")]
    {
        // Detect software type from file extension
        // Use unified launcher based on file extension
        let file_extension = path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("");

        let launcher = SoftwareLaunchConfig::from_extension(file_extension);
        let pid = launcher.launch(&executable_path, &file_path)?;

        Ok(OpenFileResult { file_name, pid })
    }

    #[cfg(not(target_os = "windows"))]
    {
        // For macOS and Linux, use open/xdg-open (no PID tracking for now)
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .arg("-a")
                .arg(&executable_path)
                .arg(&file_path)
                .spawn()
                .map_err(|e| format!("Failed to open file: {}", e))?;
        }

        #[cfg(target_os = "linux")]
        {
            Command::new(&executable_path)
                .arg(&file_path)
                .spawn()
                .map_err(|e| format!("Failed to open file: {}", e))?;
        }

        // Return dummy PID (0) for non-Windows platforms
        Ok(OpenFileResult { file_name, pid: 0 })
    }
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
    read_dir_recursive(&path, 3) // Display up to 3 levels of folder depth
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

#[tauri::command]
async fn set_project_thumbnail(project_path: String, image_path: String) -> Result<String, String> {
    let project_dir = PathBuf::from(&project_path);
    let source_path = PathBuf::from(&image_path);

    if !source_path.exists() {
        return Err("Source image does not exist".to_string());
    }

    // Create .thumbnails directory if it doesn't exist
    let thumbnails_dir = project_dir.join(".thumbnails");
    fs::create_dir_all(&thumbnails_dir)
        .map_err(|e| format!("Failed to create .thumbnails directory: {}", e))?;

    // Delete old project thumbnails (with any extension and timestamp)
    if let Ok(entries) = fs::read_dir(&thumbnails_dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();
            if name_str.starts_with("project_thumbnail") {
                let _ = fs::remove_file(entry.path()); // Ignore errors
            }
        }
    }

    // Also clean up old thumbnails from project root (migration)
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

    let thumbnail_name = format!("project_thumbnail_{}.{}", timestamp, extension);
    let dest_path = thumbnails_dir.join(&thumbnail_name);

    // Copy the file
    fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("Failed to copy thumbnail: {}", e))?;

    // Return relative path from project root
    Ok(format!(".thumbnails/{}", thumbnail_name))
}

#[tauri::command]
async fn set_scene_preview(project_path: String, scene_number: u32, image_path: String) -> Result<String, String> {
    let project_dir = PathBuf::from(&project_path);
    let source_path = PathBuf::from(&image_path);

    if !source_path.exists() {
        return Err("Source image does not exist".to_string());
    }

    // Create .thumbnails directory if it doesn't exist
    let thumbnails_dir = project_dir.join(".thumbnails");
    fs::create_dir_all(&thumbnails_dir)
        .map_err(|e| format!("Failed to create .thumbnails directory: {}", e))?;

    // Create scene directory
    let scene_dir = thumbnails_dir.join(format!("scene{:03}", scene_number));
    fs::create_dir_all(&scene_dir)
        .map_err(|e| format!("Failed to create scene directory: {}", e))?;

    // Delete old scene preview
    if let Ok(entries) = fs::read_dir(&scene_dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();
            if name_str.starts_with("scene") {
                let _ = fs::remove_file(entry.path());
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

    let preview_name = format!("scene{:03}_{}.{}", scene_number, timestamp, extension);
    let dest_path = scene_dir.join(&preview_name);

    // Copy the file
    fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("Failed to copy preview: {}", e))?;

    // Return relative path from project root
    Ok(format!(".thumbnails/scene{:03}/{}", scene_number, preview_name))
}

#[tauri::command]
async fn set_shot_preview(project_path: String, scene_number: u32, shot_number: u32, image_path: String) -> Result<String, String> {
    let project_dir = PathBuf::from(&project_path);
    let source_path = PathBuf::from(&image_path);

    if !source_path.exists() {
        return Err("Source image does not exist".to_string());
    }

    // Create .thumbnails directory if it doesn't exist
    let thumbnails_dir = project_dir.join(".thumbnails");
    fs::create_dir_all(&thumbnails_dir)
        .map_err(|e| format!("Failed to create .thumbnails directory: {}", e))?;

    // Create scene directory
    let scene_dir = thumbnails_dir.join(format!("scene{:03}", scene_number));
    fs::create_dir_all(&scene_dir)
        .map_err(|e| format!("Failed to create scene directory: {}", e))?;

    // Delete old shot preview
    let shot_pattern = format!("shot{:03}", shot_number);
    if let Ok(entries) = fs::read_dir(&scene_dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();
            if name_str.starts_with(&shot_pattern) {
                let _ = fs::remove_file(entry.path());
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

    let preview_name = format!("shot{:03}_{}.{}", shot_number, timestamp, extension);
    let dest_path = scene_dir.join(&preview_name);

    // Copy the file
    fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("Failed to copy preview: {}", e))?;

    // Return relative path from project root
    Ok(format!(".thumbnails/scene{:03}/{}", scene_number, preview_name))
}

#[derive(Debug, Serialize)]
struct ProjectVersion {
    name: String,
    path: String,
    software: Vec<String>,
    created_at: u64,  // Unix timestamp in seconds
    modified_at: u64, // Unix timestamp in seconds
    is_versioned: bool, // true if file has _v### pattern, false otherwise
}

#[tauri::command]
async fn get_project_versions(project_path: String) -> Result<Vec<ProjectVersion>, String> {
    let project_dir = PathBuf::from(&project_path);

    // Get project metadata
    let project = read_project_metadata(&project_dir)?;
    let base_name = project.name.replace(" ", "").to_uppercase();
    let has_scenes = project.has_scenes.unwrap_or(false);

    let mut versions = Vec::new();

    // List of software folders to search
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Photoshop", "Cinema4D",
        "Substance", "Unreal", "Unity", "ZBrush", "Marmoset"
    ];

    // Helper function to scan a directory for version files
    fn scan_directory_for_versions(
        dir: &PathBuf,
        base_name: &str,
        versions: &mut Vec<ProjectVersion>,
        expected_software_folder: Option<&str>,
    ) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        let file_name = entry.file_name();
                        let file_name_str = file_name.to_string_lossy();
                        let file_path = entry.path();

                        // Determine software by extension
                        let extension = file_path.extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("")
                            .to_lowercase();

                        // Skip .blend1 backup files
                        if extension == "blend1" {
                            continue;
                        }

                        // Check if file matches known software extensions
                        let software_name = match extension.as_str() {
                            "blend" => Some("Blender"),
                            "hip" | "hiplc" | "hipnc" => Some("Houdini"),
                            "ma" | "mb" => Some("Maya"),
                            "aep" => Some("After Effects"),
                            "psd" | "psb" => Some("Photoshop"),
                            "c4d" => Some("Cinema 4D"),
                            "spp" => Some("Substance"),
                            "uproject" => Some("Unreal"),
                            "unity" => Some("Unity"),
                            "zpr" => Some("ZBrush"),
                            "tbscene" => Some("Marmoset"),
                            _ => None,
                        };

                        // Skip files with unknown extensions
                        if software_name.is_none() {
                            continue;
                        }

                        // Filter by expected software folder if specified
                        if let Some(expected) = expected_software_folder {
                            if software_name.unwrap() != expected {
                                continue;
                            }
                        }

                        // Check if file is versioned using file_naming module
                        let is_versioned = file_naming::FileNameComponents::is_versioned(&file_name_str);
                        let starts_with_base = file_name_str.starts_with(base_name);

                        // Only include versioned files that start with project name
                        if is_versioned && starts_with_base {
                            // Get file creation and modification time
                            let (created_at, modified_at) = if let Ok(metadata) = entry.metadata() {
                                let created = if let Ok(created) = metadata.created() {
                                    created.duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_secs()
                                } else {
                                    0
                                };
                                let modified = if let Ok(modified) = metadata.modified() {
                                    modified.duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_secs()
                                } else {
                                    0
                                };
                                (created, modified)
                            } else {
                                (0, 0)
                            };

                            versions.push(ProjectVersion {
                                name: file_name_str.to_string(),
                                path: file_path.to_string_lossy().to_string(),
                                software: vec![software_name.unwrap().to_string()],
                                created_at,
                                modified_at,
                                is_versioned: true,
                            });
                        }
                    }
                }
            }
        }
    }

    // Map folder names to expected software names for filtering
    fn get_expected_software_name(folder: &str) -> Option<&'static str> {
        match folder {
            "Blender" => Some("Blender"),
            "Houdini" => Some("Houdini"),
            "Maya" => Some("Maya"),
            "AfterEffects" => Some("After Effects"),
            "Photoshop" => Some("Photoshop"),
            "Cinema4D" => Some("Cinema 4D"),
            "Substance" => Some("Substance"),
            "Unreal" => Some("Unreal"),
            "Unity" => Some("Unity"),
            "ZBrush" => Some("ZBrush"),
            "Marmoset" => Some("Marmoset"),
            _ => None,
        }
    }

    // Search in each software folder
    for software_folder in software_folders {
        let software_dir = project_dir.join(software_folder);
        if !software_dir.exists() {
            continue;
        }

        let expected_software = get_expected_software_name(software_folder);

        if has_scenes {
            // For projects with scenes: scan Software/SCENE_CODE/ directories
            if let Ok(entries) = fs::read_dir(&software_dir) {
                for entry in entries.flatten() {
                    if let Ok(file_type) = entry.file_type() {
                        if file_type.is_dir() {
                            let scene_dir = entry.path();
                            let dir_name = entry.file_name().to_string_lossy().to_string();
                            // Skip hidden and special folders
                            if !dir_name.starts_with('.') && !dir_name.starts_with('_') {
                                scan_directory_for_versions(&scene_dir, &base_name, &mut versions, expected_software);
                            }
                        }
                    }
                }
            }
        } else {
            // For projects without scenes: scan Software/ directly
            scan_directory_for_versions(&software_dir, &base_name, &mut versions, expected_software);
        }
    }

    // Also scan special context folders: _GlobalAssets and _GlobalCompose (no filtering)
    let special_folders = vec!["_GlobalAssets", "_GlobalCompose"];
    for special_folder in special_folders {
        let special_dir = project_dir.join(special_folder);
        if special_dir.exists() {
            scan_directory_for_versions(&special_dir, &base_name, &mut versions, None);
        }
    }

    // Sort versions by name
    versions.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(versions)
}

#[tauri::command]
async fn extract_blend_thumbnail(path: String) -> Result<Option<String>, String> {
    blend_thumbnail::extract_blend_thumbnail(&path)
}

#[tauri::command]
async fn cleanup_backup_files(project_path: String) -> Result<u32, String> {
    let project_dir = PathBuf::from(&project_path);
    let mut deleted_count = 0u32;

    // Helper function to recursively scan directory for .blend1 files
    fn scan_for_blend1(dir: &PathBuf, deleted_count: &mut u32) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    let path = entry.path();
                    if file_type.is_dir() {
                        // Skip hidden and special folders
                        let dir_name = entry.file_name().to_string_lossy().to_string();
                        if !dir_name.starts_with('.') && !dir_name.starts_with('_')
                            && dir_name != "Render" && dir_name != "Output" && dir_name != "Cache" {
                            scan_for_blend1(&path, deleted_count);
                        }
                    } else if file_type.is_file() {
                        let extension = path.extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("")
                            .to_lowercase();

                        // Delete .blend1 backup files
                        if extension == "blend1" {
                            if fs::remove_file(&path).is_ok() {
                                *deleted_count += 1;
                                println!("Deleted backup file: {:?}", path);
                            }
                        }
                    }
                }
            }
        }
    }

    // List of software folders to search
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Photoshop", "Cinema4D",
        "Substance", "Unreal", "Unity", "ZBrush", "Marmoset"
    ];

    // Search in each software folder (recursively including scene subfolders)
    for software_folder in software_folders {
        let software_dir = project_dir.join(software_folder);
        if software_dir.exists() {
            scan_for_blend1(&software_dir, &mut deleted_count);
        }
    }

    Ok(deleted_count)
}

#[tauri::command]
async fn delete_shot_files(
    project_path: String,
    shot_number: u32,
    scene_number: u32,
) -> Result<u32, String> {
    let project_dir = PathBuf::from(&project_path);
    let mut deleted_count = 0u32;

    // Get project name and scene name from metadata
    let metadata_path = project_dir.join(".project-metadata.json");
    let (project_name, scene_name) = if let Ok(content) = fs::read_to_string(&metadata_path) {
        if let Ok(project) = serde_json::from_str::<Project>(&content) {
            // Find scene by number
            let scene = project.scenes
                .and_then(|scenes| scenes.into_iter().find(|s| s.number == scene_number));

            if let Some(scene) = scene {
                (project.name, scene.name)
            } else {
                return Err("Scene not found".to_string());
            }
        } else {
            return Err("Failed to parse project metadata".to_string());
        }
    } else {
        return Err("Project metadata not found".to_string());
    };

    // Build shot pattern using file_naming module: PROJECT_SCENE_SHOT_
    let shot_pattern = file_naming::FileNameComponents::shot_pattern(
        &project_name,
        &scene_name,
        shot_number
    );

    // List of software folders to search
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Photoshop", "Cinema4D",
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
                        let file_path = entry.path();

                        // Check if file matches shot pattern (PROJECT_SCENE_SHOT_)
                        if file_name_str.contains(&shot_pattern) {
                            if fs::remove_file(&file_path).is_ok() {
                                deleted_count += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    // Delete all thumbnails for the shot (files matching shot{:03}_*.*)
    let scene_thumbnails_dir = project_dir
        .join(".thumbnails")
        .join(format!("scene{:03}", scene_number));

    if scene_thumbnails_dir.exists() {
        let shot_pattern = format!("shot{:03}_", shot_number);

        if let Ok(entries) = fs::read_dir(&scene_thumbnails_dir) {
            for entry in entries.flatten() {
                let file_name = entry.file_name();
                let name_str = file_name.to_string_lossy();
                if name_str.starts_with(&shot_pattern) {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }

    // Delete shot folders from software directories
    // Shot folder name is just the number, e.g. "001", not "SH001"
    let shot_folder_name = format!("{:03}", shot_number);
    // Use sanitized scene name instead of SC{number} to match folder creation
    let scene_code = if scene_number > 0 {
        Some(file_naming::sanitize_folder_name(&scene_name))
    } else {
        None // shots-only mode
    };

    let software_configs = vec![
        ("Blender", vec!["Render/Preview", "Render/Final", "Render/Passes"]),
        ("Houdini", vec!["Render/Preview", "Render/Final", "Render/Passes"]),
        ("AfterEffects", vec!["Output/Preview", "Output/Final"]),
    ];

    for (software, folders) in software_configs {
        let software_path = project_dir.join(software);

        if !software_path.exists() {
            continue;
        }

        for folder in folders {
            let shot_folder = if let Some(ref sc) = scene_code {
                // Scene mode: {Software}/{scene}/{Render|Output}/{Preview|Final}/{shot}
                // e.g. Blender/HUSKY/Render/Preview/001
                software_path.join(sc).join(folder).join(&shot_folder_name)
            } else {
                // Shots-only mode: {Software}/{Render|Output}/{Preview|Final}/{shot}
                software_path.join(folder).join(&shot_folder_name)
            };

            if shot_folder.exists() {
                let _ = fs::remove_dir_all(&shot_folder);
            }
        }
    }

    Ok(deleted_count)
}

#[tauri::command]
async fn delete_scene_files(project_path: String, scene_number: u32) -> Result<u32, String> {
    let project_dir = PathBuf::from(&project_path);
    let mut deleted_count = 0u32;

    // Get project name and scene name from metadata
    let metadata_path = project_dir.join(".project-metadata.json");
    let (project_name, scene_name) = if let Ok(content) = fs::read_to_string(&metadata_path) {
        if let Ok(project) = serde_json::from_str::<Project>(&content) {
            // Find scene by number
            let scene = project.scenes
                .and_then(|scenes| scenes.into_iter().find(|s| s.number == scene_number));

            if let Some(scene) = scene {
                (project.name, scene.name)
            } else {
                return Err("Scene not found".to_string());
            }
        } else {
            return Err("Failed to parse project metadata".to_string());
        }
    } else {
        return Err("Project metadata not found".to_string());
    };

    // Build scene pattern using file_naming module: PROJECT_SCENE_
    let scene_pattern = file_naming::FileNameComponents::scene_pattern(&project_name, &scene_name);

    // List of software folders to search
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Photoshop", "Cinema4D",
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
                        let file_path = entry.path();

                        // Check if file matches scene pattern (PROJECT_SCENE_)
                        if file_name_str.contains(&scene_pattern) {
                            if fs::remove_file(&file_path).is_ok() {
                                deleted_count += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    // Delete thumbnail directory for the scene (removes all shot thumbnails in this scene)
    let scene_thumbnail_dir = project_dir
        .join(".thumbnails")
        .join(format!("scene{:03}", scene_number));

    if scene_thumbnail_dir.exists() {
        let _ = fs::remove_dir_all(&scene_thumbnail_dir);
    }

    // Delete scene folders from software directories
    // Use sanitized scene name instead of SC{number} to match folder creation
    let scene_code = file_naming::sanitize_folder_name(&scene_name);

    let software_configs = vec![
        ("Blender", vec!["Render/Preview", "Render/Final", "Render/Passes"]),
        ("Houdini", vec!["Render/Preview", "Render/Final", "Render/Passes"]),
        ("AfterEffects", vec!["Output/Preview", "Output/Final"]),
    ];

    for (software, folders) in software_configs {
        let software_path = project_dir.join(software);

        if !software_path.exists() {
            continue;
        }

        for folder in folders {
            let scene_folder = software_path.join(folder).join(&scene_code);

            if scene_folder.exists() {
                let _ = fs::remove_dir_all(&scene_folder);
            }
        }
    }

    Ok(deleted_count)
}

#[tauri::command]
async fn move_version_to_shot(
    version_path: String,
    project_path: String,
    target_shot_id: String,
) -> Result<String, String> {
    let version_file = PathBuf::from(&version_path);

    if !version_file.exists() {
        return Err("Version file not found".to_string());
    }

    let file_name = version_file.file_name()
        .ok_or("Invalid file name")?
        .to_str()
        .ok_or("Invalid file name encoding")?;

    // Parse current file using file_naming module
    let mut components = file_naming::FileNameComponents::parse(file_name)
        .ok_or("Failed to parse file name")?;

    // Get target shot's scene from project metadata
    let project_dir = PathBuf::from(&project_path);
    let metadata_path = project_dir.join(".project-metadata.json");
    let (target_shot_number, target_scene_name) = if let Ok(content) = fs::read_to_string(&metadata_path) {
        if let Ok(project) = serde_json::from_str::<Project>(&content) {
            // Find the target shot by ID
            let shot = project.shots
                .and_then(|shots| shots.into_iter().find(|s| s.id == target_shot_id))
                .ok_or("Target shot not found")?;

            let shot_number = shot.number;

            // Find the scene by ID (if shot has a scene)
            let scene_name = if let Some(scene_id) = &shot.scene_id {
                project.scenes
                    .and_then(|scenes| scenes.into_iter().find(|s| s.id == *scene_id))
                    .map(|scene| scene.name)
                    .ok_or("Scene not found for target shot")?
            } else {
                // Shots-only mode: no scene
                String::new()
            };

            (shot_number, scene_name)
        } else {
            return Err("Failed to parse project metadata".to_string());
        }
    } else {
        return Err("Project metadata not found".to_string());
    };

    // Update components with new shot and scene
    components.shot_number = target_shot_number;
    components.scene_name = target_scene_name;

    // Build new file name
    let new_file_name = components.build();

    let parent_dir = version_file.parent().ok_or("No parent directory")?;
    let new_path = parent_dir.join(&new_file_name);

    // Move the file
    fs::rename(&version_file, &new_path)
        .map_err(|e| format!("Failed to move file: {}", e))?;

    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn copy_version_to_shot(
    version_path: String,
    project_path: String,
    target_shot_id: String,
) -> Result<String, String> {
    let version_file = PathBuf::from(&version_path);

    if !version_file.exists() {
        return Err("Version file not found".to_string());
    }

    let file_name = version_file.file_name()
        .ok_or("Invalid file name")?
        .to_str()
        .ok_or("Invalid file name encoding")?;

    // Parse current file using file_naming module
    let mut components = file_naming::FileNameComponents::parse(file_name)
        .ok_or("Failed to parse file name")?;

    // Get target shot's scene from project metadata
    let project_dir = PathBuf::from(&project_path);
    let metadata_path = project_dir.join(".project-metadata.json");
    let (target_shot_number, target_scene_name) = if let Ok(content) = fs::read_to_string(&metadata_path) {
        if let Ok(project) = serde_json::from_str::<Project>(&content) {
            // Find the target shot by ID
            let shot = project.shots
                .and_then(|shots| shots.into_iter().find(|s| s.id == target_shot_id))
                .ok_or("Target shot not found")?;

            let shot_number = shot.number;

            // Find the scene by ID (if shot has a scene)
            let scene_name = if let Some(scene_id) = &shot.scene_id {
                project.scenes
                    .and_then(|scenes| scenes.into_iter().find(|s| s.id == *scene_id))
                    .map(|scene| scene.name)
                    .ok_or("Scene not found for target shot")?
            } else {
                // Shots-only mode: no scene
                String::new()
            };

            (shot_number, scene_name)
        } else {
            return Err("Failed to parse project metadata".to_string());
        }
    } else {
        return Err("Project metadata not found".to_string());
    };

    // Update components with new shot and scene
    components.shot_number = target_shot_number;
    components.scene_name = target_scene_name;

    // Build new file name
    let new_file_name = components.build();

    let parent_dir = version_file.parent().ok_or("No parent directory")?;
    let new_path = parent_dir.join(&new_file_name);

    // Copy the file
    fs::copy(&version_file, &new_path)
        .map_err(|e| format!("Failed to copy file: {}", e))?;

    Ok(new_path.to_string_lossy().to_string())
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
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("cmd")
            .args(&["/c", "start", &url])
            .creation_flags(CREATE_NO_WINDOW)
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
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            Command::new("cmd")
                .args(&["/c", "start", "http://"])
                .creation_flags(CREATE_NO_WINDOW)
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
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;

                Command::new("cmd")
                    .args(&["/c", "start", &link.url])
                    .creation_flags(CREATE_NO_WINDOW)
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
async fn start_watching_project(
    app_handle: tauri::AppHandle,
    project_path: String,
) -> Result<(), String> {
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
        // Create debouncer (500ms - balance between grouping events and responsiveness)
        let mut debouncer = match new_debouncer(
            Duration::from_millis(500),
            move |res: DebounceEventResult| {
                match res {
                    Ok(events) => {
                        let mut has_version_changes = false;
                        let mut has_output_changes = false;

                        // Collect all changes in batch
                        for event in events {
                            if let Some(path) = event.path.to_str() {
                                let is_version_file = path.contains("_v") && !path.ends_with(".blend1");
                                let is_output_file = path.contains("\\Render\\") ||
                                                    path.contains("/Render/") ||
                                                    path.contains("\\Output\\") ||
                                                    path.contains("/Output/");

                                if is_version_file {
                                    has_version_changes = true;
                                } else if is_output_file {
                                    has_output_changes = true;
                                }
                            }
                        }

                        // Clean up backup files only if version files changed
                        if has_version_changes {
                            let project_dir = PathBuf::from(&project_path_clone);
                            let software_folders = vec![
                                "Blender", "Houdini", "Maya", "AfterEffects", "Cinema4D",
                                "Substance", "Unreal", "Unity", "ZBrush", "Marmoset"
                            ];

                            for software_folder in &software_folders {
                                let software_dir = project_dir.join(software_folder);
                                if software_dir.exists() {
                                    if let Ok(entries) = fs::read_dir(&software_dir) {
                                        for entry in entries.flatten() {
                                            if let Ok(file_type) = entry.file_type() {
                                                if file_type.is_file() {
                                                    let file_path = entry.path();
                                                    if let Some(extension) = file_path.extension() {
                                                        if extension == "blend1" {
                                                            let _ = fs::remove_file(&file_path);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Emit events without throttling (debounce provides protection)
                        if has_version_changes {
                            let _ = app.emit_all("version-changed", ());
                        }

                        if has_output_changes {
                            let _ = app.emit_all("output-changed", ());
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
        for software_folder in &software_folders {
            let software_dir = project_dir.join(software_folder);
            if software_dir.exists() {
                let _ = debouncer.watcher().watch(&software_dir, RecursiveMode::Recursive);
            }
        }

        // Also watch Render folders for output files
        let render_dir = project_dir.join("Render");
        if render_dir.exists() {
            let _ = debouncer.watcher().watch(&render_dir, RecursiveMode::Recursive);
        }

        // Watch AfterEffects/Output folder
        let ae_output_dir = project_dir.join("AfterEffects").join("Output");
        if ae_output_dir.exists() {
            let _ = debouncer.watcher().watch(&ae_output_dir, RecursiveMode::Recursive);
        }

        // Loop with shutdown check
        while !shutdown_clone.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(100));
        }
    });

    // Store handle globally
    let mut handle = WATCHER_HANDLE.lock();
    *handle = Some(WatcherHandle {
        thread: Some(thread),
        shutdown,
    });
    Ok(())
}

#[tauri::command]
async fn stop_watching_project() -> Result<(), String> {
    let mut handle_guard = WATCHER_HANDLE.lock();

    if let Some(mut handle) = handle_guard.take() {
        // Signal shutdown
        handle.shutdown.store(true, Ordering::Relaxed);

        // Wait for thread to finish (with timeout)
        if let Some(thread) = handle.thread.take() {
            let timeout = Duration::from_secs(2);
            let start = std::time::Instant::now();

            loop {
                if thread.is_finished() {
                    let _ = thread.join();
                    break;
                }

                if start.elapsed() > timeout {
                    break;
                }

                std::thread::sleep(Duration::from_millis(100));
            }
        }
    }

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
fn save_project_file(project_path: String, filename: String, contents: Vec<u8>) -> Result<String, String> {
    use std::path::PathBuf;

    let project_dir = PathBuf::from(&project_path);

    // Validate that the project directory exists
    if !project_dir.exists() {
        return Err(format!("Project directory does not exist: {}", project_path));
    }

    // Create the full file path
    let file_path = project_dir.join(&filename);

    // Write the file
    fs::write(&file_path, contents)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(filename)
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

// ==================== WAL (Write-Ahead Log) Utility Functions ====================

/// Create a new WAL file for a rename operation
fn create_wal(project_path: &str, operation_type: &str) -> Result<RenameWAL, String> {
    let wal = RenameWAL {
        operation_type: operation_type.to_string(),
        timestamp: Utc::now().to_rfc3339(),
        project_path: project_path.to_string(),
        operations: Vec::new(),
    };

    let wal_path = Path::new(project_path).join(".nulls").join("rename_wal.json");
    fs::create_dir_all(wal_path.parent().unwrap())
        .map_err(|e| format!("Failed to create WAL directory: {}", e))?;

    let json = serde_json::to_string_pretty(&wal)
        .map_err(|e| format!("Failed to serialize WAL: {}", e))?;
    fs::write(&wal_path, json)
        .map_err(|e| format!("Failed to write WAL: {}", e))?;

    Ok(wal)
}

/// Save current WAL state to disk
fn save_wal(wal: &RenameWAL) -> Result<(), String> {
    let wal_path = Path::new(&wal.project_path).join(".nulls").join("rename_wal.json");
    let json = serde_json::to_string_pretty(wal)
        .map_err(|e| format!("Failed to serialize WAL: {}", e))?;
    fs::write(&wal_path, json)
        .map_err(|e| format!("Failed to write WAL: {}", e))?;
    Ok(())
}

/// Perform a file rename operation with WAL tracking
fn rename_with_wal(wal: &mut RenameWAL, old_path: &Path, new_path: &Path) -> Result<(), String> {
    // 1. Add operation to WAL (not completed yet)
    wal.operations.push(RenameOperation {
        old_path: old_path.to_string_lossy().to_string(),
        new_path: new_path.to_string_lossy().to_string(),
        completed: false,
    });
    save_wal(wal)?;

    // 2. Perform the rename operation
    fs::rename(old_path, new_path)
        .map_err(|e| format!("Failed to rename {} -> {}: {}",
            old_path.display(), new_path.display(), e))?;

    // 3. Mark as completed in WAL
    if let Some(last_op) = wal.operations.last_mut() {
        last_op.completed = true;
    }
    save_wal(wal)?;

    Ok(())
}

/// Rollback all completed operations from WAL (in reverse order)
fn rollback_from_wal(wal: &RenameWAL) -> Result<(), String> {
    println!("⚠️  Rolling back {} operations...", wal.operations.len());

    // Rollback in reverse order, only completed operations
    for op in wal.operations.iter().rev() {
        if op.completed {
            println!("  ↩️  Reverting: {} -> {}", op.new_path, op.old_path);
            // Ignore errors during rollback - file might not exist or already reverted
            let _ = fs::rename(&op.new_path, &op.old_path);
        }
    }

    Ok(())
}

/// Delete WAL file and .nulls folder after successful operation
fn delete_wal(wal: &RenameWAL) -> Result<(), String> {
    let nulls_dir = Path::new(&wal.project_path).join(".nulls");
    let wal_path = nulls_dir.join("rename_wal.json");
    if wal_path.exists() {
        fs::remove_file(&wal_path)
            .map_err(|e| format!("Failed to delete WAL: {}", e))?;
    }
    // Remove .nulls directory if empty
    if nulls_dir.exists() {
        let _ = fs::remove_dir(&nulls_dir); // Ignore error if not empty
    }
    Ok(())
}

/// Check for and recover from incomplete WAL operations on project open
fn check_and_recover_wal(project_path: &str) -> Result<(), String> {
    let wal_path = Path::new(project_path).join(".nulls").join("rename_wal.json");

    if wal_path.exists() {
        println!("🔧 Found incomplete WAL operation, recovering...");

        let json = fs::read_to_string(&wal_path)
            .map_err(|e| format!("Failed to read WAL: {}", e))?;
        let wal: RenameWAL = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse WAL: {}", e))?;

        // Rollback incomplete operation
        rollback_from_wal(&wal)?;

        // Delete WAL after recovery
        fs::remove_file(&wal_path)
            .map_err(|e| format!("Failed to delete WAL after recovery: {}", e))?;

        println!("✅ Successfully recovered from incomplete {} operation", wal.operation_type);
    }

    Ok(())
}

/// Emit progress event to frontend
fn emit_progress(app_handle: &tauri::AppHandle, current: usize, total: usize) {
    let _ = app_handle.emit_all("rename-progress", RenameProgress {
        current: current as u32,
        total: total as u32,
    });
}

/// Format shot number with leading zeros (e.g., 1 -> "001")
fn format_shot_number(number: u32) -> String {
    format!("{:03}", number)
}

// ==================== End of WAL Utilities ====================

// Helper function to find shot files matching a pattern
fn find_shot_files(project_path: &PathBuf, project_name: &str, scene_name: &str, shot_number: u32) -> Result<Vec<PathBuf>, String> {
    // Build shot pattern using file_naming module: PROJECT_SCENE_SHOT_
    let shot_pattern = file_naming::FileNameComponents::shot_pattern(
        project_name,
        scene_name,
        shot_number
    );
    let mut found_files = Vec::new();

    println!("🔍 Looking for files with pattern: {}", shot_pattern);

    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Cinema4D",
        "Substance", "Unreal", "Unity", "ZBrush", "Marmoset"
    ];

    for software_folder in software_folders {
        let software_dir = project_path.join(software_folder);
        if !software_dir.exists() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(&software_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        let file_name = entry.file_name();
                        let file_name_str = file_name.to_string_lossy();

                        // Check if file matches shot pattern and is versioned
                        if file_name_str.contains(&shot_pattern) && file_naming::FileNameComponents::is_versioned(&file_name_str) {
                            println!("✓ Found matching file: {}", file_name_str);
                            found_files.push(entry.path());
                        }
                    }
                }
            }
        }
    }

    println!("📦 Total files found: {}", found_files.len());
    Ok(found_files)
}

#[tauri::command]
async fn check_shot_files_accessible(project_path: String, shot_number: u32) -> Result<bool, String> {
    let project_dir = PathBuf::from(&project_path);

    // Get project name and scene name from metadata
    let metadata_path = project_dir.join(".project-metadata.json");
    let (project_name, scene_name) = if let Ok(content) = fs::read_to_string(&metadata_path) {
        if let Ok(project) = serde_json::from_str::<Project>(&content) {
            // Find the shot to get its scene
            let shot = project.shots
                .and_then(|shots| shots.into_iter().find(|s| s.number == shot_number))
                .ok_or("Shot not found")?;

            // Find the scene by ID (if shot has a scene)
            let scene_name = if let Some(scene_id) = &shot.scene_id {
                project.scenes
                    .and_then(|scenes| scenes.into_iter().find(|s| s.id == *scene_id))
                    .map(|scene| scene.name)
                    .ok_or("Scene not found for shot")?
            } else {
                // Shots-only mode: no scene
                String::new()
            };

            (project.name, scene_name)
        } else {
            return Err("Failed to parse project metadata".to_string());
        }
    } else {
        return Err("Project metadata not found".to_string());
    };

    // Find all files matching the shot number
    let files = find_shot_files(&project_dir, &project_name, &scene_name, shot_number)?;

    if files.is_empty() {
        return Ok(true); // No files to check, safe to rename
    }

    // Check if any file is locked by trying to open it with write access
    for file_path in files {
        match fs::OpenOptions::new()
            .write(true)
            .open(&file_path)
        {
            Ok(_) => {
                // File is accessible
                continue;
            }
            Err(_) => {
                // File is locked or inaccessible
                return Ok(false);
            }
        }
    }

    Ok(true)
}

#[tauri::command]
async fn rename_shot_files(
    app_handle: tauri::AppHandle,
    project_path: String,
    shot_id: String,
    new_shot_number: u32
) -> Result<u32, String> {
    let project_dir = PathBuf::from(&project_path);

    // Get project name, scene name and old shot number from metadata
    let metadata_path = project_dir.join(".project-metadata.json");
    let (project_name, scene_name, old_shot_number) = if let Ok(content) = fs::read_to_string(&metadata_path) {
        if let Ok(project) = serde_json::from_str::<Project>(&content) {
            // Find the shot by ID (not by number!)
            let shot = project.shots
                .and_then(|shots| shots.into_iter().find(|s| s.id == shot_id))
                .ok_or("Shot not found")?;

            // Find the scene by ID (if shot has a scene)
            let scene_name = if let Some(scene_id) = &shot.scene_id {
                project.scenes
                    .and_then(|scenes| scenes.into_iter().find(|s| s.id == *scene_id))
                    .map(|scene| scene.name)
                    .ok_or("Scene not found for shot")?
            } else {
                // Shots-only mode: no scene
                String::new()
            };

            (project.name, scene_name, shot.number)
        } else {
            return Err("Failed to parse project metadata".to_string());
        }
    } else {
        return Err("Project metadata not found".to_string());
    };

    // Find all files with old shot number
    let files = find_shot_files(&project_dir, &project_name, &scene_name, old_shot_number)?;

    if files.is_empty() {
        return Ok(0); // No files to rename
    }

    // Create WAL for transaction safety
    let mut wal = create_wal(&project_path, "rename_shot")?;
    let total = files.len();
    let mut renamed_count = 0u32;

    // Rename each file using file_naming module with WAL tracking
    for (index, file_path) in files.iter().enumerate() {
        if let Some(file_name) = file_path.file_name() {
            let file_name_str = file_name.to_string_lossy();

            // Parse the file name
            if let Some(mut components) = file_naming::FileNameComponents::parse(&file_name_str) {
                // Update shot number
                components.shot_number = new_shot_number;

                // Build new file name
                let new_file_name = components.build();

                if let Some(parent) = file_path.parent() {
                    let new_file_path = parent.join(&new_file_name);

                    // Rename the file with WAL tracking
                    match rename_with_wal(&mut wal, &file_path, &new_file_path) {
                        Ok(_) => {
                            renamed_count += 1;
                            println!("✓ Renamed: {} -> {}", file_name_str, new_file_name);

                            // Emit progress to frontend
                            emit_progress(&app_handle, index + 1, total);
                        }
                        Err(e) => {
                            // Rollback on error
                            println!("❌ Error renaming file, rolling back...");
                            rollback_from_wal(&wal)?;
                            delete_wal(&wal)?;
                            return Err(e);
                        }
                    }
                }
            }
        }
    }

    // Delete WAL after successful completion
    delete_wal(&wal)?;
    println!("✅ Successfully renamed {} files", renamed_count);

    Ok(renamed_count)
}

#[tauri::command]
async fn rename_shot_thumbnails(
    app_handle: tauri::AppHandle,
    project_path: String,
    shot_id: String,
    new_shot_number: u32,
) -> Result<u32, String> {
    let project_dir = Path::new(&project_path);
    let thumbnails_dir = project_dir.join(".thumbnails");
    let mut found_thumbnails = Vec::new();

    // Get scene name and old shot number from metadata
    let metadata_path = project_dir.join(".project-metadata.json");
    let (scene_name, old_shot_number) = if let Ok(content) = fs::read_to_string(&metadata_path) {
        if let Ok(project) = serde_json::from_str::<Project>(&content) {
            // Find the shot by ID (not by number!)
            let shot = project.shots
                .and_then(|shots| shots.into_iter().find(|s| s.id == shot_id))
                .ok_or("Shot not found")?;

            // Find the scene by ID (if shot has a scene)
            let scene_name = if let Some(scene_id) = &shot.scene_id {
                project.scenes
                    .and_then(|scenes| scenes.into_iter().find(|s| s.id == *scene_id))
                    .map(|scene| scene.name)
                    .unwrap_or_default()
            } else {
                String::new()
            };

            (scene_name, shot.number)
        } else {
            return Err("Failed to parse project metadata".to_string());
        }
    } else {
        return Err("Project metadata not found".to_string());
    };

    // Search for thumbnails in all software directories
    let software_folders = vec!["blender", "houdini", "aftereffects", "nuke", "maya", "cinema4d"];

    for software in software_folders {
        let software_dir = thumbnails_dir.join(software);
        if !software_dir.exists() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(&software_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        let file_name = entry.file_name();
                        let file_name_str = file_name.to_string_lossy().to_string();

                        // Pattern: shot{old_number}_*.png or sceneName_shot{old_number}_*.png
                        let old_pattern = format!("shot{}_", format_shot_number(old_shot_number));
                        let matches_shot = file_name_str.contains(&old_pattern);
                        let matches_scene = if !scene_name.is_empty() {
                            file_name_str.starts_with(&format!("{}_", file_naming::sanitize_folder_name(&scene_name)))
                        } else {
                            // Shots-only mode - match all thumbnails with this shot number
                            true
                        };

                        if matches_shot && matches_scene {
                            found_thumbnails.push(entry.path());
                        }
                    }
                }
            }
        }
    }

    if found_thumbnails.is_empty() {
        return Ok(0); // No thumbnails to rename
    }

    // Create WAL for transaction safety
    let mut wal = create_wal(&project_path, "rename_shot_thumbnails")?;
    let total = found_thumbnails.len();
    let mut renamed_count = 0u32;

    // Rename each thumbnail with WAL tracking
    for (index, thumb_path) in found_thumbnails.iter().enumerate() {
        let file_name = thumb_path.file_name().unwrap().to_string_lossy();
        let old_pattern = format!("shot{}_", format_shot_number(old_shot_number));
        let new_pattern = format!("shot{}_", format_shot_number(new_shot_number));
        let new_name = file_name.replace(&old_pattern, &new_pattern);
        let new_path = thumb_path.with_file_name(new_name.as_str());

        match rename_with_wal(&mut wal, thumb_path, &new_path) {
            Ok(_) => {
                renamed_count += 1;
                println!("✓ Renamed thumbnail: {} -> {}", file_name, new_name);
                emit_progress(&app_handle, index + 1, total);
            }
            Err(e) => {
                println!("❌ Error renaming thumbnail, rolling back...");
                rollback_from_wal(&wal)?;
                delete_wal(&wal)?;
                return Err(e);
            }
        }
    }

    delete_wal(&wal)?;
    println!("✅ Successfully renamed {} thumbnails", renamed_count);

    Ok(renamed_count)
}

#[tauri::command]
async fn count_shot_files(
    project_path: String,
    shot_id: String,
) -> Result<SceneFileCount, String> {
    let project_dir = Path::new(&project_path);
    let mut version_files = 0u32;
    let mut thumbnails = 0u32;

    // Read metadata to find the shot by ID
    let metadata_path = project_dir.join(".project-metadata.json");
    let (_project_name, scene_name, shot_number) = if let Ok(content) = fs::read_to_string(&metadata_path) {
        if let Ok(project) = serde_json::from_str::<Project>(&content) {
            // Find the shot by ID
            let shot = project.shots
                .and_then(|shots| shots.into_iter().find(|s| s.id == shot_id))
                .ok_or("Shot not found")?;

            // Find the scene by ID (if shot has a scene)
            let scene_name = if let Some(scene_id) = &shot.scene_id {
                project.scenes
                    .and_then(|scenes| scenes.into_iter().find(|s| s.id == *scene_id))
                    .map(|scene| scene.name)
                    .unwrap_or_default()
            } else {
                String::new()
            };

            (project.name, scene_name, shot.number)
        } else {
            return Err("Failed to parse project metadata".to_string());
        }
    } else {
        return Err("Project metadata not found".to_string());
    };

    // Build pattern that includes scene context for accurate counting
    let shot_pattern = format!("_SH{}_", format_shot_number(shot_number));
    let scene_pattern = if !scene_name.is_empty() {
        format!("_{}_", file_naming::sanitize_folder_name(&scene_name))
    } else {
        String::new()
    };

    // Count version files - only count files that match both scene and shot patterns
    for entry in WalkDir::new(project_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(file_name) = entry.file_name().to_str() {
                // For scenes mode: file must contain both scene and shot patterns
                // For shots-only mode: file must contain shot pattern and NOT contain any scene pattern
                let matches_shot = file_name.contains(&shot_pattern);
                let matches_scene = if !scene_pattern.is_empty() {
                    file_name.contains(&scene_pattern)
                } else {
                    // Shots-only mode: file should NOT contain any _SC pattern
                    !file_name.contains("_SC")
                };

                if matches_shot && matches_scene {
                    version_files += 1;
                }
            }
        }
    }

    // Count thumbnails
    let thumbnails_dir = project_dir.join(".thumbnails");
    let software_folders = vec!["blender", "houdini", "aftereffects", "nuke", "maya", "cinema4d"];
    let thumbnail_pattern = format!("shot{}_", format_shot_number(shot_number));

    for software in software_folders {
        let software_dir = thumbnails_dir.join(software);
        if !software_dir.exists() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(&software_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        let file_name = entry.file_name();
                        let file_name_str = file_name.to_string_lossy().to_string();
                        // Thumbnails use scene prefix: sceneName_shot001_...
                        let matches_thumbnail = file_name_str.contains(&thumbnail_pattern);
                        let matches_scene = if !scene_name.is_empty() {
                            file_name_str.starts_with(&format!("{}_", file_naming::sanitize_folder_name(&scene_name)))
                        } else {
                            // Shots-only mode
                            true
                        };

                        if matches_thumbnail && matches_scene {
                            thumbnails += 1;
                        }
                    }
                }
            }
        }
    }

    Ok(SceneFileCount {
        version_files,
        thumbnails,
    })
}

#[tauri::command]
async fn count_scene_files(
    project_path: String,
    scene_name: String,
) -> Result<SceneFileCount, String> {
    let project_dir = Path::new(&project_path);
    let mut version_files = 0u32;
    let mut thumbnails = 0u32;

    // Get project name from metadata
    let metadata_path = project_dir.join(".project-metadata.json");
    let _project_name = if let Ok(content) = fs::read_to_string(&metadata_path) {
        if let Ok(project) = serde_json::from_str::<Project>(&content) {
            project.name
        } else {
            return Err("Failed to parse project metadata".to_string());
        }
    } else {
        return Err("Project metadata not found".to_string());
    };

    // Count version files in software folders
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Cinema4D",
        "Substance", "Unreal", "Unity", "ZBrush", "Marmoset", "Nuke"
    ];

    for software_folder in software_folders {
        let software_path = project_dir.join(software_folder);
        if !software_path.exists() {
            continue;
        }

        // Use WalkDir to recursively search for files
        for entry in WalkDir::new(&software_path).into_iter().flatten() {
            if entry.file_type().is_file() {
                if let Some(file_name) = entry.path().file_name() {
                    let file_name_str = file_name.to_string_lossy();
                    if let Some(components) = file_naming::FileNameComponents::parse(&file_name_str) {
                        if components.scene_name == scene_name {
                            version_files += 1;
                        }
                    }
                }
            }
        }
    }

    // Count thumbnails
    let thumbnails_dir = project_dir.join(".thumbnails");
    if thumbnails_dir.exists() {
        let scene_pattern = format!("_{}_", scene_name);

        for software in vec!["blender", "houdini", "aftereffects", "nuke", "maya", "cinema4d"] {
            let software_dir = thumbnails_dir.join(software);
            if let Ok(entries) = fs::read_dir(&software_dir) {
                for entry in entries.flatten() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.contains(&scene_pattern) {
                        thumbnails += 1;
                    }
                }
            }
        }
    }

    Ok(SceneFileCount {
        version_files,
        thumbnails,
    })
}

#[tauri::command]
async fn rename_scene_files(
    app_handle: tauri::AppHandle,
    project_path: String,
    old_scene_name: String,
    new_scene_name: String,
) -> Result<u32, String> {
    let project_dir = Path::new(&project_path);
    let mut files_to_rename = Vec::new();

    // Search for all files with old scene name
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Cinema4D",
        "Substance", "Unreal", "Unity", "ZBrush", "Marmoset", "Nuke"
    ];

    for software_folder in software_folders {
        let software_path = project_dir.join(software_folder);
        if !software_path.exists() {
            continue;
        }

        for entry in WalkDir::new(&software_path).into_iter().flatten() {
            if entry.file_type().is_file() {
                if let Some(file_name) = entry.path().file_name() {
                    let file_name_str = file_name.to_string_lossy();
                    if let Some(components) = file_naming::FileNameComponents::parse(&file_name_str) {
                        if components.scene_name == old_scene_name {
                            files_to_rename.push(entry.path().to_path_buf());
                        }
                    }
                }
            }
        }
    }

    if files_to_rename.is_empty() {
        return Ok(0); // No files to rename
    }

    // Create WAL for transaction safety
    let mut wal = create_wal(&project_path, "rename_scene")?;
    let total = files_to_rename.len();
    let mut renamed_count = 0u32;

    // Rename each file with WAL tracking
    for (index, file_path) in files_to_rename.iter().enumerate() {
        let file_name = file_path.file_name().unwrap().to_string_lossy().to_string();

        if let Some(mut components) = file_naming::FileNameComponents::parse(&file_name) {
            // Update scene name
            components.scene_name = new_scene_name.clone();
            let new_file_name = components.build();
            let new_path = file_path.with_file_name(&new_file_name);

            match rename_with_wal(&mut wal, file_path, &new_path) {
                Ok(_) => {
                    renamed_count += 1;
                    println!("✓ Renamed: {} -> {}", file_name, new_file_name);
                    emit_progress(&app_handle, index + 1, total);
                }
                Err(e) => {
                    println!("❌ Error renaming file, rolling back...");
                    rollback_from_wal(&wal)?;
                    delete_wal(&wal)?;
                    return Err(e);
                }
            }
        }
    }

    delete_wal(&wal)?;
    println!("✅ Successfully renamed {} scene files", renamed_count);

    Ok(renamed_count)
}

#[tauri::command]
async fn rename_scene_thumbnails(
    app_handle: tauri::AppHandle,
    project_path: String,
    old_scene_name: String,
    new_scene_name: String,
) -> Result<u32, String> {
    let thumbnails_dir = Path::new(&project_path).join(".thumbnails");
    let mut found_thumbnails = Vec::new();

    if !thumbnails_dir.exists() {
        return Ok(0); // No thumbnails directory
    }

    // Search for thumbnails containing old scene name
    let old_pattern = format!("_{}_", old_scene_name);
    let software_folders = vec!["blender", "houdini", "aftereffects", "nuke", "maya", "cinema4d"];

    for software in software_folders {
        let software_dir = thumbnails_dir.join(software);
        if let Ok(entries) = fs::read_dir(&software_dir) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.contains(&old_pattern) {
                    found_thumbnails.push(entry.path());
                }
            }
        }
    }

    if found_thumbnails.is_empty() {
        return Ok(0); // No thumbnails to rename
    }

    // Create WAL for transaction safety
    let mut wal = create_wal(&project_path, "rename_scene_thumbnails")?;
    let total = found_thumbnails.len();
    let mut renamed_count = 0u32;

    // Rename each thumbnail with WAL tracking
    for (index, thumb_path) in found_thumbnails.iter().enumerate() {
        let file_name = thumb_path.file_name().unwrap().to_string_lossy();
        let old_pattern = format!("_{}_", old_scene_name);
        let new_pattern = format!("_{}_", new_scene_name);
        let new_name = file_name.replace(&old_pattern, &new_pattern);
        let new_path = thumb_path.with_file_name(new_name.as_str());

        match rename_with_wal(&mut wal, thumb_path, &new_path) {
            Ok(_) => {
                renamed_count += 1;
                println!("✓ Renamed scene thumbnail: {} -> {}", file_name, new_name);
                emit_progress(&app_handle, index + 1, total);
            }
            Err(e) => {
                println!("❌ Error renaming thumbnail, rolling back...");
                rollback_from_wal(&wal)?;
                delete_wal(&wal)?;
                return Err(e);
            }
        }
    }

    delete_wal(&wal)?;
    println!("✅ Successfully renamed {} scene thumbnails", renamed_count);

    Ok(renamed_count)
}

#[tauri::command]
async fn detect_software_paths() -> Result<std::collections::HashMap<String, String>, String> {
    use std::collections::HashMap;

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let mut detected_paths = HashMap::new();

        // Helper function to check if path exists
        fn path_exists(path: &str) -> bool {
            std::path::Path::new(path).exists()
        }

        // 1. Detect Blender
        // Check registry
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(blender_key) = hklm.open_subkey(r"SOFTWARE\BlenderFoundation") {
            if let Ok(subkeys) = blender_key.enum_keys().collect::<Result<Vec<_>, _>>() {
                for key_name in subkeys {
                    if let Ok(version_key) = blender_key.open_subkey(&key_name) {
                        if let Ok(install_dir) = version_key.get_value::<String, _>("InstallDir") {
                            let blender_exe = format!("{}\\blender.exe", install_dir);
                            if path_exists(&blender_exe) {
                                detected_paths.insert("blender".to_string(), blender_exe);
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Check default paths for Blender
        if !detected_paths.contains_key("blender") {
            let default_blender_paths = vec![
                r"C:\Program Files\Blender Foundation\Blender 4.3\blender.exe",
                r"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe",
                r"C:\Program Files\Blender Foundation\Blender 4.1\blender.exe",
                r"C:\Program Files\Blender Foundation\Blender 4.0\blender.exe",
                r"C:\Program Files\Blender Foundation\Blender 3.6\blender.exe",
            ];

            for path in default_blender_paths {
                if path_exists(path) {
                    detected_paths.insert("blender".to_string(), path.to_string());
                    break;
                }
            }
        }

        // 2. Detect Houdini
        if let Ok(houdini_key) = hklm.open_subkey(r"SOFTWARE\Side Effects Software") {
            if let Ok(subkeys) = houdini_key.enum_keys().collect::<Result<Vec<_>, _>>() {
                for key_name in subkeys {
                    if key_name.starts_with("Houdini") {
                        if let Ok(version_key) = houdini_key.open_subkey(&key_name) {
                            if let Ok(install_path) = version_key.get_value::<String, _>("InstallPath") {
                                let houdini_exe = format!("{}\\bin\\houdinifx.exe", install_path);
                                if path_exists(&houdini_exe) {
                                    detected_paths.insert("houdini".to_string(), houdini_exe);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Check default paths for Houdini
        if !detected_paths.contains_key("houdini") {
            let default_houdini_paths = vec![
                r"C:\Program Files\Side Effects Software\Houdini 20.5.370\bin\houdinifx.exe",
                r"C:\Program Files\Side Effects Software\Houdini 20.0.688\bin\houdinifx.exe",
                r"C:\Program Files\Side Effects Software\Houdini 19.5.805\bin\houdinifx.exe",
            ];

            for path in default_houdini_paths {
                if path_exists(path) {
                    detected_paths.insert("houdini".to_string(), path.to_string());
                    break;
                }
            }
        }

        // 3. Detect Adobe After Effects
        if let Ok(adobe_key) = hklm.open_subkey(r"SOFTWARE\Adobe\After Effects") {
            if let Ok(subkeys) = adobe_key.enum_keys().collect::<Result<Vec<_>, _>>() {
                for key_name in subkeys {
                    if let Ok(version_key) = adobe_key.open_subkey(&key_name) {
                        if let Ok(install_path) = version_key.get_value::<String, _>("InstallPath") {
                            let ae_exe = format!("{}\\AfterFX.exe", install_path);
                            if path_exists(&ae_exe) {
                                detected_paths.insert("after-effects".to_string(), ae_exe);
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Check default paths for After Effects
        if !detected_paths.contains_key("after-effects") {
            let default_ae_paths = vec![
                r"C:\Program Files\Adobe\Adobe After Effects 2024\Support Files\AfterFX.exe",
                r"C:\Program Files\Adobe\Adobe After Effects 2025\Support Files\AfterFX.exe",
                r"C:\Program Files\Adobe\Adobe After Effects 2023\Support Files\AfterFX.exe",
            ];

            for path in default_ae_paths {
                if path_exists(path) {
                    detected_paths.insert("after-effects".to_string(), path.to_string());
                    break;
                }
            }
        }

        // 4. Detect Adobe Photoshop
        if let Ok(adobe_key) = hklm.open_subkey(r"SOFTWARE\Adobe\Photoshop") {
            if let Ok(subkeys) = adobe_key.enum_keys().collect::<Result<Vec<_>, _>>() {
                for key_name in subkeys {
                    if let Ok(version_key) = adobe_key.open_subkey(&key_name) {
                        if let Ok(install_path) = version_key.get_value::<String, _>("ApplicationPath") {
                            if path_exists(&install_path) {
                                detected_paths.insert("photoshop".to_string(), install_path);
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Check default paths for Photoshop
        if !detected_paths.contains_key("photoshop") {
            let default_ps_paths = vec![
                r"C:\Program Files\Adobe\Adobe Photoshop 2024\Photoshop.exe",
                r"C:\Program Files\Adobe\Adobe Photoshop 2025\Photoshop.exe",
                r"C:\Program Files\Adobe\Adobe Photoshop 2023\Photoshop.exe",
            ];

            for path in default_ps_paths {
                if path_exists(path) {
                    detected_paths.insert("photoshop".to_string(), path.to_string());
                    break;
                }
            }
        }

        Ok(detected_paths)
    }

    #[cfg(not(target_os = "windows"))]
    {
        // For non-Windows platforms, return empty map for now
        Ok(HashMap::new())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OutputFile {
    name: String,
    path: String,
    software: String,
    render_type: String, // "preview" or "final"
    created_at: u64,
    size: u64,
    is_sequence: bool,
    frame_range: Option<String>, // e.g., "0001-0008"
    frame_count: Option<u32>,
    missing_frames: Option<String>, // e.g., "(0002-0004), 0007"
}

// Helper function to extract frame number from filename
fn extract_frame_number(filename: &str) -> Option<(String, u32, String)> {
    use regex::Regex;
    // Match patterns like: name.001.exr, name_001.png, 001.exr, etc.
    // Requires 3+ digits to avoid grouping files like "1.png", "2.png"
    let re = Regex::new(r"^(.*)[\._]?(\d{3,})\.([a-zA-Z0-9]+)$").ok()?;
    if let Some(caps) = re.captures(filename) {
        let prefix = caps.get(1).map_or("", |m| m.as_str()).to_string();
        let frame_str = caps.get(2)?.as_str();
        let frame_num = frame_str.parse::<u32>().ok()?;
        let ext = caps.get(3)?.as_str().to_string();
        return Some((prefix, frame_num, ext));
    }
    None
}

// Helper function to detect missing frames in a sequence
fn detect_missing_frames(frames: &[u32], first_frame: u32, last_frame: u32) -> Option<String> {
    let mut missing = Vec::new();

    for frame_num in first_frame..=last_frame {
        if !frames.contains(&frame_num) {
            missing.push(frame_num);
        }
    }

    if missing.is_empty() {
        return None;
    }

    // Group consecutive missing frames
    let mut groups = Vec::new();
    let mut start = missing[0];
    let mut prev = missing[0];

    for &frame in &missing[1..] {
        if frame == prev + 1 {
            prev = frame;
        } else {
            if start == prev {
                groups.push(format!("{:04}", start));
            } else {
                groups.push(format!("({:04}-{:04})", start, prev));
            }
            start = frame;
            prev = frame;
        }
    }

    // Add the last group
    if start == prev {
        groups.push(format!("{:04}", start));
    } else {
        groups.push(format!("({:04}-{:04})", start, prev));
    }

    Some(groups.join(", "))
}

// Helper function to check if file extension is an image format
fn is_image_format(ext: &str) -> bool {
    let image_formats = [
        "png", "jpg", "jpeg", "exr", "dpx", "tif", "tiff",
        "tga", "bmp", "hdr", "pic", "psd", "sgi", "rgb"
    ];
    image_formats.contains(&ext.to_lowercase().as_str())
}

// Helper function to group image sequences
fn group_sequences(files: Vec<OutputFile>) -> Vec<OutputFile> {
    use std::collections::HashMap;

    let mut sequences: HashMap<String, Vec<OutputFile>> = HashMap::new();
    let mut standalone_files = Vec::new();

    // Group files by prefix, extension, software, and render_type (to keep Preview and Final separate)
    for file in files {
        if let Some((prefix, _frame_num, ext)) = extract_frame_number(&file.name) {
            // Only group image formats into sequences
            if is_image_format(&ext) {
                let key = format!("{}_{}_{}_{}",prefix, ext, file.software, file.render_type);
                sequences.entry(key).or_insert_with(Vec::new).push(file);
            } else {
                // Non-image files are treated as standalone
                standalone_files.push(file);
            }
        } else {
            standalone_files.push(file);
        }
    }

    let mut result = Vec::new();

    // Process sequences
    for (_key, mut seq_files) in sequences {
        if seq_files.len() > 1 {
            // Sort by frame number
            seq_files.sort_by(|a, b| {
                let frame_a = extract_frame_number(&a.name).map(|(_, n, _)| n).unwrap_or(0);
                let frame_b = extract_frame_number(&b.name).map(|(_, n, _)| n).unwrap_or(0);
                frame_a.cmp(&frame_b)
            });

            let first = seq_files.first().unwrap();
            let last = seq_files.last().unwrap();

            let first_frame = extract_frame_number(&first.name).map(|(_, n, _)| n).unwrap_or(0);
            let last_frame = extract_frame_number(&last.name).map(|(_, n, _)| n).unwrap_or(0);

            // Get the directory path
            let dir_path = std::path::Path::new(&first.path)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            // Extract prefix and extension directly from the first file's name
            let (prefix, _, ext) = extract_frame_number(&first.name)
                .unwrap_or((String::new(), 0, String::new()));

            // Create display name with frame range (only prefix + frame range + ext, no render_type)
            // Ignore prefix if it's empty or consists only of digits (e.g., "0" from "0002.exr")
            let use_prefix = !prefix.is_empty() && !prefix.chars().all(|c| c.is_ascii_digit());
            let display_name = if use_prefix {
                format!("{}.{:04}-{:04}.{}", &prefix, first_frame, last_frame, &ext)
            } else {
                format!("{:04}-{:04}.{}", first_frame, last_frame, &ext)
            };

            // Sum up total size
            let total_size: u64 = seq_files.iter().map(|f| f.size).sum();

            // Detect missing frames
            let existing_frames: Vec<u32> = seq_files.iter()
                .filter_map(|f| extract_frame_number(&f.name).map(|(_, n, _)| n))
                .collect();
            let missing = detect_missing_frames(&existing_frames, first_frame, last_frame);

            result.push(OutputFile {
                name: display_name,
                path: dir_path,
                software: first.software.clone(),
                render_type: first.render_type.clone(),
                created_at: first.created_at,
                size: total_size,
                is_sequence: true,
                frame_range: Some(format!("{:04}-{:04}", first_frame, last_frame)),
                frame_count: Some(seq_files.len() as u32),
                missing_frames: missing,
            });
        } else if let Some(file) = seq_files.into_iter().next() {
            // Single file, treat as standalone
            standalone_files.push(file);
        }
    }

    // Add standalone files
    for file in standalone_files {
        result.push(OutputFile {
            name: file.name,
            path: file.path,
            software: file.software,
            render_type: file.render_type,
            created_at: file.created_at,
            size: file.size,
            is_sequence: false,
            frame_range: None,
            frame_count: None,
            missing_frames: None,
        });
    }

    result
}

// Helper function to recursively scan directory for output files
fn scan_output_dir_recursive(
    dir: &PathBuf,
    software: &str,
    render_type: &str,
    outputs: &mut Vec<OutputFile>,
    depth: usize,
    scene_filter: &Option<String>,
    shot_filter: &Option<String>
) {
    // Prevent infinite recursion with depth limit
    if depth > 10 {
        return;
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                let path = entry.path();

                // Recursively scan all subdirectories (no filtering at directory level)
                if metadata.is_dir() {
                    scan_output_dir_recursive(&path, software, render_type, outputs, depth + 1, scene_filter, shot_filter);
                } else if metadata.is_file() {
                    let file_name = entry.file_name().to_string_lossy().to_string();

                    // Skip hidden files and system files
                    if file_name.starts_with('.') || file_name.starts_with('~') {
                        continue;
                    }

                    // Filter by checking if file is inside the correct folder structure
                    let should_include = {
                        // Get parent directory path (without filename)
                        let dir_path = if let Some(parent) = path.parent() {
                            parent.to_string_lossy().to_string()
                        } else {
                            String::new()
                        };

                        // Split path into components (folders)
                        let path_components: Vec<&str> = dir_path
                            .split(['/', '\\'])
                            .filter(|s| !s.is_empty())
                            .collect();

                        let mut matches = true;

                        // If both scene and shot filters are present, check they appear in correct order
                        if scene_filter.is_some() && shot_filter.is_some() {
                            if let (Some(ref scene), Some(ref shot)) = (scene_filter, shot_filter) {
                                let scene_normalized = scene.to_uppercase().replace(" ", "");
                                let shot_normalized = shot.to_uppercase().replace(" ", "");

                                // Find indices of scene and shot folders
                                let scene_index = path_components.iter().position(|&component| {
                                    let comp_normalized = component.to_uppercase().replace(" ", "");
                                    comp_normalized == scene_normalized
                                });

                                let shot_index = path_components.iter().position(|&component| {
                                    let comp_normalized = component.to_uppercase().replace(" ", "");
                                    // Match exact "SH001" OR just "001" (without SH prefix)
                                    comp_normalized == shot_normalized ||
                                    (shot_normalized.starts_with("SH") && comp_normalized == &shot_normalized[2..])
                                });

                                // Both must exist AND shot must come after scene in the path
                                matches = match (scene_index, shot_index) {
                                    (Some(sc_idx), Some(sh_idx)) => sh_idx > sc_idx,
                                    _ => false
                                };
                            }
                        } else {
                            // Only one filter present, check individually

                            // Check scene filter if present
                            if let Some(ref scene) = scene_filter {
                                let scene_normalized = scene.to_uppercase().replace(" ", "");

                                let has_scene_folder = path_components.iter().any(|&component| {
                                    let comp_normalized = component.to_uppercase().replace(" ", "");
                                    comp_normalized == scene_normalized
                                });

                                if !has_scene_folder {
                                    matches = false;
                                }
                            }

                            // Check shot filter if present
                            if matches && shot_filter.is_some() {
                                if let Some(ref shot) = shot_filter {
                                    let shot_normalized = shot.to_uppercase().replace(" ", "");

                                    let has_shot_folder = path_components.iter().any(|&component| {
                                        let comp_normalized = component.to_uppercase().replace(" ", "");
                                        // Match exact "SH001" OR just "001" (without SH prefix)
                                        comp_normalized == shot_normalized ||
                                        (shot_normalized.starts_with("SH") && comp_normalized == &shot_normalized[2..])
                                    });

                                    if !has_shot_folder {
                                        matches = false;
                                    }
                                }
                            }
                        }

                        matches
                    };

                    if should_include {

                        if let Ok(created) = metadata.created().or_else(|_| metadata.modified()) {
                            if let Ok(duration) = created.duration_since(std::time::UNIX_EPOCH) {
                                outputs.push(OutputFile {
                                    name: file_name,
                                    path: path.to_string_lossy().to_string(),
                                    software: software.to_lowercase().replace("aftereffects", "after-effects"),
                                    render_type: render_type.to_string(),
                                    created_at: duration.as_secs(),
                                    size: metadata.len(),
                                    is_sequence: false,
                                    frame_range: None,
                                    frame_count: None,
                                    missing_frames: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
}

#[tauri::command]
async fn get_project_outputs(
    project_path: String,
    scene_filter: Option<String>,
    shot_filter: Option<String>
) -> Result<Vec<OutputFile>, String> {
    let project_dir = PathBuf::from(&project_path);
    let mut outputs = Vec::new();

    // Read project metadata to check has_scenes
    let project = read_project_metadata(&project_dir)?;
    let has_scenes = project.has_scenes.unwrap_or(false);

    // Define software folders to scan
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Cinema4D",
        "Substance", "Unreal", "Unity", "ZBrush", "Marmoset", "Photoshop"
    ];

    for software in &software_folders {
        let software_dir = project_dir.join(software);
        if !software_dir.exists() {
            continue;
        }

        // Determine render folder name (Render for most, Output for AfterEffects)
        let render_folder = if *software == "AfterEffects" { "Output" } else { "Render" };

        if has_scenes {
            // New hierarchy: Software/SCENE_CODE/Render/Preview/
            // Scan all scene folders
            if let Ok(entries) = fs::read_dir(&software_dir) {
                for entry in entries.flatten() {
                    let entry_path = entry.path();
                    if entry_path.is_dir() {
                        let scene_name = entry.file_name().to_string_lossy().to_string();

                        // Skip hidden folders and special folders
                        if scene_name.starts_with('.') || scene_name.starts_with('_') {
                            continue;
                        }

                        // Apply scene filter
                        if let Some(ref filter) = scene_filter {
                            if !scene_name.eq_ignore_ascii_case(filter) {
                                continue;
                            }
                        }

                        // Check Render/Preview inside scene folder
                        let preview_dir = entry_path.join(render_folder).join("Preview");
                        if preview_dir.exists() {
                            scan_output_dir_recursive(&preview_dir, software, "preview", &mut outputs, 0, &None, &shot_filter);
                        }

                        // Check Render/Final inside scene folder
                        let final_dir = entry_path.join(render_folder).join("Final");
                        if final_dir.exists() {
                            scan_output_dir_recursive(&final_dir, software, "final", &mut outputs, 0, &None, &shot_filter);
                        }
                    }
                }
            }
        } else {
            // Flat hierarchy: Software/Render/Preview/
            let preview_dir = software_dir.join(render_folder).join("Preview");
            if preview_dir.exists() {
                scan_output_dir_recursive(&preview_dir, software, "preview", &mut outputs, 0, &scene_filter, &shot_filter);
            }

            let final_dir = software_dir.join(render_folder).join("Final");
            if final_dir.exists() {
                scan_output_dir_recursive(&final_dir, software, "final", &mut outputs, 0, &scene_filter, &shot_filter);
            }
        }
    }

    // Group image sequences
    let grouped_outputs = group_sequences(outputs);

    Ok(grouped_outputs)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSceneFoldersInput {
    project_path: String,
    scene_code: String, // e.g., "RUNB", "INTRO" (no SC_ prefix)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateShotFoldersInput {
    project_path: String,
    scene_code: String, // e.g., "RUNB", "INTRO" (no SC_ prefix)
    shot_code: String,  // e.g., "001", "010" (no SH prefix, just 3-digit number)
}

#[tauri::command]
fn create_scene_folders(input: CreateSceneFoldersInput) -> Result<(), String> {
    let project_path = PathBuf::from(&input.project_path);

    // Read project metadata to get software list
    let project = read_project_metadata(&project_path)?;

    let scene_folder_name = sanitize_folder_name(&input.scene_code);

    // Create scene folder inside each software folder with full hierarchy
    for software in &project.software {
        let software_folder_name = get_software_folder_name(&software.name);
        let software_path = project_path.join(&software_folder_name);

        // Create software directory if it doesn't exist
        if !software_path.exists() {
            fs::create_dir_all(&software_path)
                .map_err(|e| format!("Failed to create software folder {}: {}", software_path.display(), e))?;
        }

        // Create scene folder inside software folder: Software/SCENE_CODE/
        let scene_path = software_path.join(&scene_folder_name);

        // Get full folder template for this software and create inside scene folder
        let software_folders = get_folder_template(&software.name, true, project.has_shots.unwrap_or(false));
        for folder_item in software_folders {
            create_folder_item(&scene_path, &folder_item)?;
        }
    }

    // Create scene folder in _GlobalCompose
    let global_compose_scene = project_path.join("_GlobalCompose").join(&scene_folder_name);
    fs::create_dir_all(&global_compose_scene)
        .map_err(|e| format!("Failed to create scene folder in _GlobalCompose: {}", e))?;

    Ok(())
}

#[tauri::command]
fn create_shot_folders(input: CreateShotFoldersInput) -> Result<(), String> {
    let project_path = PathBuf::from(&input.project_path);

    // Read project metadata to get software list
    let project = read_project_metadata(&project_path)?;

    let scene_folder_name = if !input.scene_code.is_empty() {
        sanitize_folder_name(&input.scene_code)
    } else {
        String::new()
    };
    let shot_folder_name = sanitize_folder_name(&input.shot_code);

    // Render/Output subfolders for shots
    let render_subfolders = vec!["Preview", "Final", "Passes"];
    let output_subfolders = vec!["Preview", "Final"];

    for software in &project.software {
        let software_folder_name = get_software_folder_name(&software.name);
        let software_path = project_path.join(&software_folder_name);

        // Determine if this software uses Render or Output folder
        let (render_folder, subfolders): (&str, &Vec<&str>) = match software.name.to_lowercase().as_str() {
            "after-effects" | "after effects" => ("Output", &output_subfolders),
            _ => ("Render", &render_subfolders),
        };

        for subfolder in subfolders {
            // New hierarchy: Software/SCENE_CODE/Render/Preview/SHOT_CODE/
            // Or for shots-only: Software/Render/Preview/SHOT_CODE/
            let shot_folder = if scene_folder_name.is_empty() {
                software_path.join(render_folder).join(subfolder).join(&shot_folder_name)
            } else {
                software_path.join(&scene_folder_name).join(render_folder).join(subfolder).join(&shot_folder_name)
            };
            fs::create_dir_all(&shot_folder)
                .map_err(|e| format!("Failed to create shot folder {}: {}", shot_folder.display(), e))?;
        }
    }

    Ok(())
}

#[tauri::command]
fn rename_scene_folders(
    project_path: String,
    old_folder_name: String,
    new_folder_name: String,
) -> Result<u32, String> {
    let project_path_buf = PathBuf::from(&project_path);
    let mut renamed_count = 0;

    // Read project metadata to get software list
    let project = read_project_metadata(&project_path_buf)?;

    let old_name = sanitize_folder_name(&old_folder_name);
    let new_name = sanitize_folder_name(&new_folder_name);

    // New hierarchy: scene folders are at Software/SCENE_CODE/ level
    for software in &project.software {
        let software_folder_name = get_software_folder_name(&software.name);
        let software_path = project_path_buf.join(&software_folder_name);

        if software_path.exists() {
            let old_scene_folder = software_path.join(&old_name);
            let new_scene_folder = software_path.join(&new_name);

            // Only rename if old folder exists and new folder doesn't exist
            if old_scene_folder.exists() {
                if new_scene_folder.exists() {
                    return Err(format!(
                        "Cannot rename: destination folder already exists: {}",
                        new_scene_folder.display()
                    ));
                }

                fs::rename(&old_scene_folder, &new_scene_folder)
                    .map_err(|e| {
                        format!(
                            "Failed to rename folder from {} to {}: {}",
                            old_scene_folder.display(),
                            new_scene_folder.display(),
                            e
                        )
                    })?;

                renamed_count += 1;
            }
        }
    }

    // Also rename scene folder in _GlobalCompose
    let global_compose_path = project_path_buf.join("_GlobalCompose");
    if global_compose_path.exists() {
        let old_compose_scene = global_compose_path.join(&old_name);
        let new_compose_scene = global_compose_path.join(&new_name);

        if old_compose_scene.exists() && !new_compose_scene.exists() {
            fs::rename(&old_compose_scene, &new_compose_scene)
                .map_err(|e| {
                    format!(
                        "Failed to rename _GlobalCompose scene folder: {}",
                        e
                    )
                })?;
            renamed_count += 1;
        }
    }

    Ok(renamed_count)
}

#[tauri::command]
fn rename_shot_folders(
    project_path: String,
    scene_folder_name: String,
    old_shot_folder_name: String,
    new_shot_folder_name: String,
) -> Result<u32, String> {
    let project_path = PathBuf::from(&project_path);
    let mut renamed_count = 0;

    // List of software and their render/output folders
    let software_configs = vec![
        ("Blender", vec!["Render/Preview", "Render/Final", "Render/Passes"]),
        ("Houdini", vec!["Render/Preview", "Render/Final", "Render/Passes"]),
        ("AfterEffects", vec!["Output/Preview", "Output/Final"]),
    ];

    for (software, folders) in software_configs {
        let software_path = project_path.join(software);
        if software_path.exists() {
            for folder in folders {
                let scene_folder = software_path.join(folder).join(&scene_folder_name);
                let old_shot_folder = scene_folder.join(&old_shot_folder_name);
                let new_shot_folder = scene_folder.join(&new_shot_folder_name);

                // Only rename if old folder exists and new folder doesn't exist
                if old_shot_folder.exists() {
                    if new_shot_folder.exists() {
                        return Err(format!(
                            "Cannot rename: destination folder already exists: {}",
                            new_shot_folder.display()
                        ));
                    }

                    fs::rename(&old_shot_folder, &new_shot_folder)
                        .map_err(|e| {
                            format!(
                                "Failed to rename shot folder from {} to {}: {}",
                                old_shot_folder.display(),
                                new_shot_folder.display(),
                                e
                            )
                        })?;

                    renamed_count += 1;
                }
            }
        }
    }

    Ok(renamed_count)
}

// Window state management structures
#[derive(Debug, Serialize, Deserialize)]
struct MonitorInfo {
    index: usize,
    name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    is_primary: bool,
}

// Internal function for getting monitors (used by both command and startup)
#[cfg(target_os = "windows")]
fn get_monitors_internal() -> Result<Vec<MonitorInfo>, String> {
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HMONITOR, HDC, MONITORINFOEXW,
    };
    use windows::Win32::Foundation::{BOOL, LPARAM, RECT};

    unsafe extern "system" fn monitor_enum_proc(
        hmonitor: HMONITOR,
        _hdc: HDC,
        _rect: *mut RECT,
        lparam: LPARAM,
    ) -> BOOL {
        let monitors = &mut *(lparam.0 as *mut Vec<MonitorInfo>);

        let mut info: MONITORINFOEXW = std::mem::zeroed();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;

        if GetMonitorInfoW(hmonitor, &mut info.monitorInfo as *mut _ as *mut _).as_bool() {
            let rect = info.monitorInfo.rcMonitor;
            let device_name = String::from_utf16_lossy(
                &info.szDevice.iter()
                    .take_while(|&&c| c != 0)
                    .map(|&c| c)
                    .collect::<Vec<u16>>()
            );

            let is_primary = info.monitorInfo.dwFlags & 1 == 1; // MONITORINFOF_PRIMARY

            monitors.push(MonitorInfo {
                index: monitors.len(),
                name: device_name,
                x: rect.left,
                y: rect.top,
                width: (rect.right - rect.left) as u32,
                height: (rect.bottom - rect.top) as u32,
                is_primary,
            });
        }

        BOOL::from(true)
    }

    let mut monitors = Vec::new();

    unsafe {
        EnumDisplayMonitors(
            HDC::default(),
            None,
            Some(monitor_enum_proc),
            LPARAM(&mut monitors as *mut _ as isize),
        );
    }

    Ok(monitors)
}

#[cfg(not(target_os = "windows"))]
fn get_monitors_internal() -> Result<Vec<MonitorInfo>, String> {
    Ok(vec![MonitorInfo {
        index: 0,
        name: "Primary Monitor".to_string(),
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        is_primary: true,
    }])
}

#[tauri::command]
fn get_available_monitors() -> Result<Vec<MonitorInfo>, String> {
    get_monitors_internal()
}

#[tauri::command]
fn set_window_to_monitor(
    window: tauri::Window,
    monitor_index: usize,
) -> Result<(), String> {
    let monitors = get_available_monitors()?;

    let monitor = monitors.get(monitor_index)
        .ok_or_else(|| format!("Monitor index {} not found", monitor_index))?;

    // Move window to monitor's position
    window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: monitor.x,
        y: monitor.y,
    })).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn is_position_valid(x: i32, y: i32) -> Result<bool, String> {
    let monitors = get_available_monitors()?;

    // Check if position is within any monitor bounds (with some tolerance)
    // We check if the point is within 100px of any monitor bounds to allow
    // for windows that might be partially off-screen
    for monitor in monitors {
        let tolerance = 100;
        let in_bounds = x >= monitor.x - tolerance
            && x < monitor.x + monitor.width as i32 + tolerance
            && y >= monitor.y - tolerance
            && y < monitor.y + monitor.height as i32 + tolerance;

        if in_bounds {
            return Ok(true);
        }
    }

    Ok(false)
}

#[tauri::command]
fn reset_window_position(window: tauri::Window) -> Result<(), String> {
    // Center window on primary monitor
    let monitors = get_available_monitors()?;
    let primary = monitors.iter()
        .find(|m| m.is_primary)
        .or_else(|| monitors.first())
        .ok_or_else(|| "No monitors found".to_string())?;

    let window_width = 1920;
    let window_height = 900;

    let center_x = primary.x + (primary.width as i32 - window_width) / 2;
    let center_y = primary.y + (primary.height as i32 - window_height) / 2;

    window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: center_x,
        y: center_y,
    })).map_err(|e| e.to_string())?;

    window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
        width: window_width as u32,
        height: window_height as u32,
    })).map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================
// Category Folder Management Commands
// ============================================

#[tauri::command]
async fn ensure_category_folder(
    projects_dir: String,
    category_name: String
) -> Result<String, String> {
    let category_path = PathBuf::from(&projects_dir).join(&category_name);

    if !category_path.exists() {
        fs::create_dir_all(&category_path)
            .map_err(|e| format!("Failed to create category folder: {}", e))?;
    }

    Ok(category_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn rename_category_folder(
    projects_dir: String,
    old_name: String,
    new_name: String
) -> Result<(), String> {
    let old_path = PathBuf::from(&projects_dir).join(&old_name);
    let new_path = PathBuf::from(&projects_dir).join(&new_name);

    if old_path.exists() {
        fs::rename(&old_path, &new_path)
            .map_err(|e| format!("Failed to rename category folder: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn scan_projects_in_folder(folder_path: String, category_name: Option<String>) -> Result<Vec<Project>, String> {
    let path = PathBuf::from(&folder_path);
    let mut projects = Vec::new();

    if !path.exists() {
        return Ok(projects);
    }

    if let Ok(entries) = fs::read_dir(&path) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let metadata_path = entry.path().join(".project-metadata.json");
                if metadata_path.exists() {
                    if let Ok(content) = fs::read_to_string(&metadata_path) {
                        if let Ok(mut project) = serde_json::from_str::<Project>(&content) {
                            let actual_path = entry.path().to_string_lossy().to_string();

                            // Check if path changed (project was moved manually)
                            let path_changed = project.path != actual_path;

                            // Update path from actual folder location
                            project.path = actual_path;

                            // Set category from folder name, not from metadata
                            project.category = category_name.clone();

                            // Save updated metadata if path changed
                            if path_changed {
                                if let Ok(json) = serde_json::to_string_pretty(&project) {
                                    let _ = fs::write(&metadata_path, json);
                                }
                            }

                            projects.push(project);
                        }
                    }
                }
            }
        }
    }

    Ok(projects)
}

#[tauri::command]
async fn move_projects_to_category(
    projects_dir: String,
    from_category: String,
    to_category: String
) -> Result<(), String> {
    let from_path = PathBuf::from(&projects_dir).join(&from_category);
    let to_path = PathBuf::from(&projects_dir).join(&to_category);

    // Ensure target folder exists
    fs::create_dir_all(&to_path)
        .map_err(|e| format!("Failed to create target folder: {}", e))?;

    // Move all subfolders (projects) - category is determined by folder, not metadata
    if from_path.exists() {
        if let Ok(entries) = fs::read_dir(&from_path) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let dest = to_path.join(entry.file_name());
                    fs::rename(entry.path(), &dest)
                        .map_err(|e| format!("Failed to move project: {}", e))?;
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn remove_empty_folder(folder_path: String) -> Result<(), String> {
    let path = PathBuf::from(&folder_path);
    if path.exists() && path.is_dir() {
        // Only remove if folder is empty
        let is_empty = fs::read_dir(&path)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false);

        if is_empty {
            fs::remove_dir(&path)
                .map_err(|e| format!("Failed to remove folder: {}", e))?;
        }
    }
    Ok(())
}

// Read window startup config from JSON file
fn read_window_config(app_handle: &tauri::AppHandle) -> WindowStartupConfig {
    let config_path = app_handle.path_resolver()
        .app_data_dir()
        .map(|p| p.join("window-config.json"));

    config_path
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

// Apply window settings before showing the window
fn apply_window_startup_settings(window: &tauri::Window, app_handle: &tauri::AppHandle) {
    let config = read_window_config(app_handle);

    if config.auto_maximize_on_launch {
        // Move to preferred monitor and maximize
        if let Ok(monitors) = get_monitors_internal() {
            if let Some(monitor) = monitors.get(config.preferred_monitor) {
                let _ = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition { x: monitor.x, y: monitor.y }
                ));
                let _ = window.maximize();
                return;
            }
        }
    }

    // Restore saved position if auto-maximize is off
    if let (Some(x), Some(y)) = (config.x, config.y) {
        let _ = window.set_position(tauri::Position::Physical(
            tauri::PhysicalPosition { x, y }
        ));
    }
    if let (Some(w), Some(h)) = (config.width, config.height) {
        let _ = window.set_size(tauri::Size::Physical(
            tauri::PhysicalSize { width: w, height: h }
        ));
    }
    if config.is_maximized == Some(true) {
        let _ = window.maximize();
    }
}

#[tauri::command]
fn save_window_config(app_handle: tauri::AppHandle, config: WindowStartupConfig) -> Result<(), String> {
    let config_path = app_handle.path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data dir")?
        .join("window-config.json");

    // Ensure directory exists
    if let Some(parent) = config_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| e.to_string())?;
    std::fs::write(&config_path, json)
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Command to show window after WebView is ready
#[tauri::command]
fn show_main_window(window: tauri::Window) {
    let _ = window.show();
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            apply_window_startup_settings(&window, &app.handle());
            // Don't show window here - let JS call show_main_window when ready
            // This prevents the white flash while WebView content loads
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_project,
            add_software_to_project,
            remove_software_from_project,
            load_projects,
            update_project,
            delete_project,
            launch_software,
            launch_software_without_project,
            open_in_explorer,
            reveal_in_explorer,
            open_file,
            open_file_with_tracking,
            get_folder_structure,
            set_project_thumbnail,
            set_scene_preview,
            set_shot_preview,
            get_project_versions,
            extract_blend_thumbnail,
            cleanup_backup_files,
            delete_shot_files,
            delete_scene_files,
            move_version_to_shot,
            copy_version_to_shot,
            get_directory_size,
            open_url,
            open_links_in_browser,
            fetch_page_title,
            start_watching_project,
            stop_watching_project,
            save_feedback,
            save_project_file,
            read_feedback,
            read_feedback_full,
            check_shot_files_accessible,
            rename_shot_files,
            rename_shot_thumbnails,
            count_shot_files,
            count_scene_files,
            rename_scene_files,
            rename_scene_thumbnails,
            create_scene_folders,
            create_shot_folders,
            rename_scene_folders,
            rename_shot_folders,
            time_tracking::start_time_tracking,
            time_tracking::stop_time_tracking,
            time_tracking::pause_time_tracking,
            time_tracking::resume_time_tracking,
            time_tracking::get_active_sessions,
            time_tracking::is_session_focused,
            time_tracking::increment_software_stats,
            time_tracking::check_process_alive,
            time_tracking::get_session_status,
            time_tracking::update_session_pid,
            time_tracking::migrate_to_child_process,
            time_tracking::get_focus_summary,
            detect_software_paths,
            get_project_outputs,
            get_available_monitors,
            set_window_to_monitor,
            is_position_valid,
            reset_window_position,
            ensure_category_folder,
            rename_category_folder,
            scan_projects_in_folder,
            move_projects_to_category,
            remove_empty_folder,
            save_window_config,
            show_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}