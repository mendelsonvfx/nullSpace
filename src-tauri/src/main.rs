#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod time_tracking;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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
    #[serde(rename = "hasShots", alias = "has_shots")]
    has_shots: Option<bool>,
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
    executable_path: String,
    version: Option<String>,
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

    for software in &input.software {
        let software_folders = get_folder_template(software);
        let folder_name = get_software_folder_name(software);
        let software_path = project_path.join(folder_name);

        for folder_item in software_folders {
            create_folder_item(&software_path, &folder_item)?;
        }
    }

    let common_folders = vec!["_GlobalReferences", "_GlobalAssets"];
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
        completed_at: None,
        todos: Some(vec![]),
        has_shots: input.has_shots,
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

#[derive(Serialize)]
struct LaunchResult {
    file_name: String,
    pid: u32,
}

/// Find PID of a process that has a specific file open
#[cfg(target_os = "windows")]
fn find_process_with_file(_file_path: &str, process_name: &str) -> Option<u32> {
    use std::time::{SystemTime, UNIX_EPOCH};

    println!("[PID_SEARCH] Starting search for process containing: '{}'", process_name);

    let mut system = System::new_all();
    let search_name = process_name.to_lowercase();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

    // Check if this is Photoshop/After Effects (they use launcher processes)
    let is_adobe_software = search_name.contains("photoshop") || search_name.contains("afterfx");

    // Wait up to 20 seconds for process to start (Houdini can be very slow)
    for attempt in 0..40 {
        std::thread::sleep(Duration::from_millis(500));
        system.refresh_all();

        // Find newest process matching the name (started within last 60 seconds)
        let mut candidates: Vec<(u32, u64)> = Vec::new();

        for (pid, process) in system.processes() {
            let proc_name = process.name().to_lowercase();
            if proc_name.contains(&search_name) {
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
            "hip" => SoftwareLaunchConfig {
                use_explorer: true,
                needs_pid_lookup: true,
                process_name: "houdin", // Matches "houdini.exe" or "houdinifx.exe"
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
                use_explorer: true,
                needs_pid_lookup: true,
                process_name: "houdin",
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
        println!("[SoftwareLauncher] use_explorer: {}, needs_pid_lookup: {}, process_name: '{}'",
            self.use_explorer, self.needs_pid_lookup, self.process_name);

        // Step 1: Spawn the process
        let child = if self.use_explorer {
            println!("[SoftwareLauncher] Launching via explorer.exe: {}", file_path);
            Command::new("explorer")
                .arg(file_path)
                .spawn()
                .map_err(|e| format!("Failed to open file via explorer: {}", e))?
        } else {
            println!("[SoftwareLauncher] Launching directly: {} {}", executable_path, file_path);
            Command::new(executable_path)
                .arg(file_path)
                .spawn()
                .map_err(|e| format!("Failed to launch software: {}", e))?
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
        if shot_num == 0 {
            format!("{}_main", base_name)
        } else {
            format!("{}_Shot{:03}", base_name, shot_num)
        }
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
    is_versioned: bool, // true if file has _v### pattern, false otherwise
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

                        // Determine software by extension
                        let extension = file_path.extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("");

                        // Skip .blend1 backup files
                        if extension == "blend1" {
                            continue;
                        }

                        // Check if file matches known software extensions
                        let software_name = match extension {
                            "blend" => Some("Blender"),
                            "hip" => Some("Houdini"),
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

                        // Check if file has version pattern
                        let has_version = file_name_str.contains("_v");
                        let starts_with_base = file_name_str.starts_with(&base_name);

                        // Include file if: (1) has version pattern and starts with base name, OR (2) no version pattern
                        if (has_version && starts_with_base) || !has_version {
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
                                software: vec![software_name.unwrap().to_string()],
                                created_at,
                                is_versioned: has_version && starts_with_base,
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
async fn move_version_to_shot(
    version_path: String,
    _project_path: String,
    target_shot_number: u32,
) -> Result<String, String> {
    let version_file = PathBuf::from(&version_path);

    if !version_file.exists() {
        return Err("Version file not found".to_string());
    }

    let file_name = version_file.file_name()
        .ok_or("Invalid file name")?
        .to_str()
        .ok_or("Invalid file name encoding")?;

    // Parse current shot number from filename
    let shot_pattern = regex::Regex::new(r"_Shot(\d{3})_").unwrap();
    let main_pattern = regex::Regex::new(r"_main_").unwrap();

    // Generate new filename with target shot number
    let new_file_name = if let Some(caps) = shot_pattern.captures(file_name) {
        // Replace existing shot number
        let current_shot = &caps[1];
        let target_shot_str = if target_shot_number == 0 {
            "main".to_string()
        } else {
            format!("Shot{:03}", target_shot_number)
        };
        file_name.replace(
            &format!("_Shot{}_", current_shot),
            &format!("_{}_", target_shot_str)
        )
    } else if main_pattern.is_match(file_name) {
        // Replace main with shot number
        let target_shot_str = if target_shot_number == 0 {
            "main".to_string()
        } else {
            format!("Shot{:03}", target_shot_number)
        };
        file_name.replace("_main_", &format!("_{}_", target_shot_str))
    } else {
        // Add shot number if not present
        let name_without_ext = file_name.rsplit_once('.').map(|(n, _)| n).unwrap_or(file_name);
        let ext = version_file.extension().and_then(|e| e.to_str()).unwrap_or("");
        let target_shot_str = if target_shot_number == 0 {
            "main".to_string()
        } else {
            format!("Shot{:03}", target_shot_number)
        };
        format!("{}_{}.{}", name_without_ext, target_shot_str, ext)
    };

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
    _project_path: String,
    target_shot_number: u32,
) -> Result<String, String> {
    let version_file = PathBuf::from(&version_path);

    if !version_file.exists() {
        return Err("Version file not found".to_string());
    }

    let file_name = version_file.file_name()
        .ok_or("Invalid file name")?
        .to_str()
        .ok_or("Invalid file name encoding")?;

    // Parse current shot number from filename
    let shot_pattern = regex::Regex::new(r"_Shot(\d{3})_").unwrap();
    let main_pattern = regex::Regex::new(r"_main_").unwrap();

    // Generate new filename with target shot number
    let new_file_name = if let Some(caps) = shot_pattern.captures(file_name) {
        // Replace existing shot number
        let current_shot = &caps[1];
        let target_shot_str = if target_shot_number == 0 {
            "main".to_string()
        } else {
            format!("Shot{:03}", target_shot_number)
        };
        file_name.replace(
            &format!("_Shot{}_", current_shot),
            &format!("_{}_", target_shot_str)
        )
    } else if main_pattern.is_match(file_name) {
        // Replace main with shot number
        let target_shot_str = if target_shot_number == 0 {
            "main".to_string()
        } else {
            format!("Shot{:03}", target_shot_number)
        };
        file_name.replace("_main_", &format!("_{}_", target_shot_str))
    } else {
        // Add shot number if not present
        let name_without_ext = file_name.rsplit_once('.').map(|(n, _)| n).unwrap_or(file_name);
        let ext = version_file.extension().and_then(|e| e.to_str()).unwrap_or("");
        let target_shot_str = if target_shot_number == 0 {
            "main".to_string()
        } else {
            format!("Shot{:03}", target_shot_number)
        };
        format!("{}_{}.{}", name_without_ext, target_shot_str, ext)
    };

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

// Helper function to find shot files matching a pattern
fn find_shot_files(project_path: &PathBuf, project_name: &str, shot_number: u32) -> Result<Vec<PathBuf>, String> {
    let base_name = project_name.replace(" ", "");
    let shot_pattern = if shot_number == 0 {
        format!("{}_main", base_name)
    } else {
        format!("{}_Shot{:03}", base_name, shot_number)
    };
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

                        // Check if file matches shot pattern
                        if file_name_str.starts_with(&shot_pattern) && file_name_str.contains("_v") {
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

    // Find all files matching the shot number
    let files = find_shot_files(&project_dir, &project_name, shot_number)?;

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
    project_path: String,
    old_shot_number: u32,
    new_shot_number: u32
) -> Result<u32, String> {
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

    // Find all files with old shot number
    let files = find_shot_files(&project_dir, &project_name, old_shot_number)?;

    if files.is_empty() {
        return Ok(0); // No files to rename
    }

    let base_name = project_name.replace(" ", "");
    let old_pattern = if old_shot_number == 0 {
        format!("{}_main", base_name)
    } else {
        format!("{}_Shot{:03}", base_name, old_shot_number)
    };
    let new_pattern = if new_shot_number == 0 {
        format!("{}_main", base_name)
    } else {
        format!("{}_Shot{:03}", base_name, new_shot_number)
    };

    let mut renamed_count = 0u32;

    // Rename each file
    for file_path in files {
        if let Some(file_name) = file_path.file_name() {
            let file_name_str = file_name.to_string_lossy();
            let new_file_name = file_name_str.replace(&old_pattern, &new_pattern);

            if let Some(parent) = file_path.parent() {
                let new_file_path = parent.join(&new_file_name);

                // Rename the file
                match fs::rename(&file_path, &new_file_path) {
                    Ok(_) => {
                        renamed_count += 1;
                        println!("Renamed: {} -> {}", file_name_str, new_file_name);
                    }
                    Err(e) => {
                        return Err(format!("Failed to rename file {}: {}", file_name_str, e));
                    }
                }
            }
        }
    }

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
    // Match patterns like: name.0001.exr, name_0001.png, 0001.exr, etc.
    let re = Regex::new(r"^(.*)[\._]?(\d{4,})\.([a-zA-Z0-9]+)$").ok()?;
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

// Helper function to group image sequences
fn group_sequences(files: Vec<OutputFile>) -> Vec<OutputFile> {
    use std::collections::HashMap;

    let mut sequences: HashMap<String, Vec<OutputFile>> = HashMap::new();
    let mut standalone_files = Vec::new();

    // Group files by prefix, extension, software, and render_type (to keep Preview and Final separate)
    for file in files {
        println!("Processing file: {} (path: {}, render_type: {})", file.name, file.path, file.render_type);
        if let Some((prefix, frame_num, ext)) = extract_frame_number(&file.name) {
            println!("  -> Detected as sequence: prefix='{}', frame={}, ext='{}'", prefix, frame_num, ext);
            let key = format!("{}_{}_{}_{}",prefix, ext, file.software, file.render_type);
            sequences.entry(key).or_insert_with(Vec::new).push(file);
        } else {
            println!("  -> Not a sequence, standalone file");
            standalone_files.push(file);
        }
    }

    println!("Found {} sequences and {} standalone files", sequences.len(), standalone_files.len());

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
            let display_name = if prefix.is_empty() {
                format!("{:04}-{:04}.{}", first_frame, last_frame, &ext)
            } else {
                format!("{}.{:04}-{:04}.{}", &prefix, first_frame, last_frame, &ext)
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
    depth: usize
) {
    // Prevent infinite recursion with depth limit
    if depth > 10 {
        return;
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                let path = entry.path();

                // Recursively scan subdirectories
                if metadata.is_dir() {
                    scan_output_dir_recursive(&path, software, render_type, outputs, depth + 1);
                } else if metadata.is_file() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    // Skip hidden files and system files
                    if file_name.starts_with('.') || file_name.starts_with('~') {
                        continue;
                    }

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

#[tauri::command]
async fn get_project_outputs(project_path: String) -> Result<Vec<OutputFile>, String> {
    let project_dir = PathBuf::from(&project_path);
    let mut outputs = Vec::new();

    println!("Scanning for outputs in: {}", project_path);

    // Define software folders to scan
    let software_folders = vec![
        "Blender", "Houdini", "Maya", "AfterEffects", "Cinema4D",
        "Substance", "Unreal", "Unity", "ZBrush", "Marmoset", "Photoshop"
    ];

    // Scan each software folder for Render/Preview and Render/Final
    for software in &software_folders {
        let software_dir = project_dir.join(software);
        if !software_dir.exists() {
            continue;
        }

        // Check Render/Preview (recursively scan all subdirs)
        let preview_dir = software_dir.join("Render").join("Preview");
        if preview_dir.exists() {
            println!("Scanning Preview dir: {:?}", preview_dir);
            scan_output_dir_recursive(&preview_dir, software, "preview", &mut outputs, 0);
        }

        // Check Render/Final (recursively scan all subdirs)
        let final_dir = software_dir.join("Render").join("Final");
        if final_dir.exists() {
            println!("Scanning Final dir: {:?}", final_dir);
            scan_output_dir_recursive(&final_dir, software, "final", &mut outputs, 0);
        }
    }

    // Also check for Output/Preview and Output/Final (for After Effects, recursively)
    let output_dir = project_dir.join("AfterEffects").join("Output");
    if output_dir.exists() {
        // Preview
        let preview_dir = output_dir.join("Preview");
        if preview_dir.exists() {
            scan_output_dir_recursive(&preview_dir, "AfterEffects", "preview", &mut outputs, 0);
        }

        // Final
        let final_dir = output_dir.join("Final");
        if final_dir.exists() {
            scan_output_dir_recursive(&final_dir, "AfterEffects", "final", &mut outputs, 0);
        }
    }

    println!("Found {} raw output files before grouping", outputs.len());

    // Group image sequences
    let grouped_outputs = group_sequences(outputs);

    println!("After grouping: {} outputs", grouped_outputs.len());

    Ok(grouped_outputs)
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
            reveal_in_explorer,
            open_file,
            open_file_with_tracking,
            get_folder_structure,
            set_project_thumbnail,
            get_project_versions,
            cleanup_backup_files,
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
            time_tracking::start_time_tracking,
            time_tracking::stop_time_tracking,
            time_tracking::pause_time_tracking,
            time_tracking::resume_time_tracking,
            time_tracking::get_active_sessions,
            time_tracking::is_session_focused,
            time_tracking::increment_software_stats,
            time_tracking::check_process_alive,
            time_tracking::get_focus_summary,
            detect_software_paths,
            get_project_outputs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}