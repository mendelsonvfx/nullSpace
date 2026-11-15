//! ffmpeg/ffprobe for media previews: finding them (own install → NullConverter → PATH from the
//! registry), and downloading the pinned gyan.dev 9.0.2 essentials build on request (Settings → Data).
//!
//! CONTRACT (shared with media_preview.rs and the frontend — keep these names and shapes):
//! - `Tools`, `ToolSource`, `current()`, `refresh_in_background()`
//! - commands `get_media_tools_status`, `download_ffmpeg`, `cancel_ffmpeg_download`, `refresh_media_tools`
//! - events `media-tools:changed` (payload `MediaToolsStatus`), `ffmpeg:progress` / `ffmpeg:done`
//!   (payload `MediaToolsStatus`)
//!
//! Nothing here runs on the caller's thread except reading the cached snapshot: the search runs on its
//! own thread (coalesced, one at a time), the download on another one.

use std::fs::{self, File};
use std::future::Future;
use std::io::{self, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::pin::pin;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, MutexGuard, OnceLock};
use std::task::{Poll, Waker};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::Manager;

/// Where the ffmpeg in use came from
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolSource {
    Nullspace,
    Nullconverter,
    Path,
}

/// A verified ffmpeg + ffprobe pair from one folder
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Tools {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    /// e.g. "9.0.2" (best effort; libavcodec version decides validity)
    pub version: String,
    pub source: ToolSource,
}

/// Download/install phase shown in Settings → Data
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Idle,
    Downloading,
    Verifying,
    Installing,
    Cancelling,
    Error,
}

/// Snapshot for the frontend. `seq` grows with every change so stale snapshots can be ignored
#[derive(Clone, Debug, Serialize)]
pub struct MediaToolsStatus {
    pub seq: u64,
    /// False until the first search finished
    pub checked: bool,
    pub tools: Option<Tools>,
    pub phase: Phase,
    pub downloaded: u64,
    pub total: u64,
    pub last_error: Option<String>,
}

// ---- Pinned download ----------------------------------------------------------------------------

/// Version folder name of our own install (`%LOCALAPPDATA%\nullspace.app\ffmpeg\<version>\`)
const FFMPEG_VERSION: &str = "9.0.2";
const ZIP_URL: &str =
    "https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip";
/// Official asset size and digest from the GitHub release (checked against the API listing)
const ZIP_SIZE: u64 = 114_768_076;
const ZIP_SHA256: &str = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba";
/// Exact entry names inside the archive (its single top-level folder is the build name)
const ZIP_FFMPEG: &str = "ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe";
const ZIP_FFPROBE: &str = "ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe";

const PARTIAL_NAME: &str = "download.partial";
const MIN_FREE_BYTES: u64 = 500 * 1024 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// No data for this long while waiting for the response or a chunk = connection lost
const CHUNK_TIMEOUT: Duration = Duration::from_secs(30);
const WATCHDOG_TICK: Duration = Duration::from_millis(250);
/// At most 10 progress events a second
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);
const WRITE_BUFFER: usize = 256 * 1024;

/// `-version` (the first start of a fresh exe includes Defender's scan)
const VERSION_TIMEOUT: Duration = Duration::from_secs(30);
/// ffmpeg 5.1+ (libavcodec 59.37): older builds are skipped for the next source
const MIN_LIBAVCODEC: (u32, u32) = (59, 37);
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const ERR_OFFLINE: &str = "No internet connection";
const ERR_BLOCKED: &str = "TLS/proxy blocked the download — install ffmpeg manually (PATH) or via NullConverter";
const ERR_CORRUPT: &str = "Downloaded file changed or is corrupted — update nullSpace";
const ERR_DISK: &str = "Not enough disk space";

// ---- Shared state -------------------------------------------------------------------------------

struct State {
    seq: u64,
    checked: bool,
    tools: Option<Tools>,
    phase: Phase,
    downloaded: u64,
    total: u64,
    last_error: Option<String>,
}

impl State {
    fn snapshot(&self) -> MediaToolsStatus {
        MediaToolsStatus {
            seq: self.seq,
            checked: self.checked,
            tools: self.tools.clone(),
            phase: self.phase,
            downloaded: self.downloaded,
            total: self.total,
            last_error: self.last_error.clone(),
        }
    }

    /// Call after every change: the new snapshot carries a larger `seq`
    fn bump(&mut self) -> MediaToolsStatus {
        self.seq += 1;
        self.snapshot()
    }
}

static STATE: Mutex<State> = Mutex::new(State {
    seq: 0,
    checked: false,
    tools: None,
    phase: Phase::Idle,
    downloaded: 0,
    total: 0,
    last_error: None,
});

static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

/// One search at a time (the background refresher and the installer both publish results)
static DISCOVERY_LOCK: Mutex<()> = Mutex::new(());
static REFRESH_RUNNING: AtomicBool = AtomicBool::new(false);
static REFRESH_PENDING: AtomicBool = AtomicBool::new(false);

/// `-version` results by exe path, so a candidate is only started again when its file changed
struct Validation {
    path: PathBuf,
    modified: Option<SystemTime>,
    len: u64,
    /// None: not usable (too old or not ffmpeg)
    version: Option<String>,
}
static VALIDATED: Mutex<Vec<Validation>> = Mutex::new(Vec::new());
const VALIDATED_MAX: usize = 16;

static DOWNLOADING: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

/// Mutex poisoning can't happen with panic = "abort"; in tests keep going with the data anyway
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn remember_app(app: &tauri::AppHandle) {
    let _ = APP.set(app.clone());
}

fn emit(event: &str, status: MediaToolsStatus) {
    if let Some(app) = APP.get() {
        let _ = app.emit_all(event, status);
    }
}

// ---- Public API ---------------------------------------------------------------------------------

/// Last known tools. Never blocks (no process runs here); None while not found or not yet searched
pub fn current() -> Option<Tools> {
    lock(&STATE).tools.clone()
}

/// Search again on a background thread (window focus, NotFound on spawn, after install).
/// On a change: calls `crate::media_preview::tools_changed(..)` and emits `media-tools:changed`
pub fn refresh_in_background(app: &tauri::AppHandle) {
    remember_app(app);
    REFRESH_PENDING.store(true, Ordering::SeqCst);
    if REFRESH_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        // The running search picks the request up when it finishes
        return;
    }
    let spawned = thread::Builder::new()
        .name("media-tools".into())
        .stack_size(256 * 1024)
        .spawn(refresh_worker);
    if spawned.is_err() {
        REFRESH_RUNNING.store(false, Ordering::SeqCst);
    }
}

/// App start: removes leftovers of interrupted installs inside our own ffmpeg folder, then searches
pub fn startup(app: &tauri::AppHandle) {
    remember_app(app);
    REFRESH_PENDING.store(true, Ordering::SeqCst);
    if REFRESH_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return;
    }
    let spawned = thread::Builder::new()
        .name("media-tools".into())
        .stack_size(256 * 1024)
        .spawn(|| {
            cleanup_own_folder();
            refresh_worker();
        });
    if spawned.is_err() {
        REFRESH_RUNNING.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn get_media_tools_status() -> MediaToolsStatus {
    lock(&STATE).snapshot()
}

#[tauri::command]
pub fn refresh_media_tools(app: tauri::AppHandle) {
    refresh_in_background(&app);
}

/// Downloads and installs the pinned build. Progress comes as `ffmpeg:progress`, the end as `ffmpeg:done`;
/// the returned promise also settles at the end. A second call while one runs returns at once
#[tauri::command]
pub async fn download_ffmpeg(app: tauri::AppHandle) -> Result<(), String> {
    remember_app(&app);
    if DOWNLOADING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Ok(());
    }
    let status = {
        let mut st = lock(&STATE);
        st.phase = if CANCEL.load(Ordering::SeqCst) { Phase::Cancelling } else { Phase::Downloading };
        st.downloaded = 0;
        st.total = ZIP_SIZE;
        st.last_error = None;
        st.bump()
    };
    emit("ffmpeg:progress", status);

    let (tx, mut rx) = tauri::async_runtime::channel::<Result<(), String>>(1);
    let spawned = thread::Builder::new()
        .name("ffmpeg-download".into())
        .spawn(move || {
            let outcome = finish_install(install_pinned());
            // Capacity 1, one message: never full. The receiver may be gone (window closed)
            let _ = tx.try_send(outcome);
        });
    if let Err(e) = spawned {
        return finish_install(Err(Failure::Message(format!("Could not start the download: {e}"))));
    }
    rx.recv().await.unwrap_or(Ok(()))
}

#[tauri::command]
pub fn cancel_ffmpeg_download() {
    if !DOWNLOADING.load(Ordering::SeqCst) {
        return;
    }
    CANCEL.store(true, Ordering::SeqCst);
    let status = {
        let mut st = lock(&STATE);
        if matches!(st.phase, Phase::Downloading | Phase::Verifying | Phase::Installing) {
            st.phase = Phase::Cancelling;
            Some(st.bump())
        } else {
            None
        }
    };
    if let Some(status) = status {
        emit("ffmpeg:progress", status);
    }
}

// ---- Discovery ----------------------------------------------------------------------------------

fn refresh_worker() {
    loop {
        while REFRESH_PENDING.swap(false, Ordering::SeqCst) {
            discover_and_publish();
        }
        REFRESH_RUNNING.store(false, Ordering::SeqCst);
        // A request that arrived between the last swap and the store above
        if !REFRESH_PENDING.load(Ordering::SeqCst)
            || REFRESH_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err()
        {
            break;
        }
    }
}

fn discover_and_publish() {
    let _guard = lock(&DISCOVERY_LOCK);
    let found = discover();
    let status = {
        let mut st = lock(&STATE);
        if st.checked && st.tools == found {
            return;
        }
        st.checked = true;
        st.tools = found.clone();
        st.bump()
    };
    crate::media_preview::tools_changed(found);
    emit("media-tools:changed", status);
}

/// `%LOCALAPPDATA%\nullspace.app\ffmpeg` (the app's local data folder, identifier nullspace.app)
fn own_root() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("nullspace.app").join("ffmpeg"))
}

fn nullconverter_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("nullconvert.app").join("ffmpeg"))
}

fn discover() -> Option<Tools> {
    // 1. Our own install: a final version folder only exists after it passed `-version`
    if let Some(root) = own_root() {
        if let Some((version, dir)) = newest_own_install(&root) {
            return Some(Tools {
                ffmpeg: dir.join("ffmpeg.exe"),
                ffprobe: dir.join("ffprobe.exe"),
                version,
                source: ToolSource::Nullspace,
            });
        }
    }
    // 2. NullConverter's copy
    if let Some(dir) = nullconverter_dir() {
        if let Some(tools) = check_candidate(&dir, ToolSource::Nullconverter) {
            return Some(tools);
        }
    }
    // 3. PATH as it is now in the registry (our own environment is as old as the process)
    registry_path_dirs().iter().find_map(|dir| check_candidate(dir, ToolSource::Path))
}

/// Newest `<root>\<version>-<installed ms>\` holding both exes; returns (version label, folder)
fn newest_own_install(root: &Path) -> Option<(String, PathBuf)> {
    let entries = fs::read_dir(root).ok()?;
    let mut best: Option<((Vec<u32>, u64), PathBuf)> = None;
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(parsed) = parse_version_dir(&name) else { continue };
        let dir = entry.path();
        if pair_in(&dir).is_none() {
            continue;
        }
        if best.as_ref().map_or(true, |(b, _)| parsed > *b) {
            best = Some((parsed, dir));
        }
    }
    best.map(|((version, _), dir)| (version.iter().map(u32::to_string).collect::<Vec<_>>().join("."), dir))
}

/// Install folder name → (version, install stamp): "9.0.2-1731600000000" → ([9, 0, 2], 1731600000000),
/// a plain "9.0.2" → stamp 0. Every reinstall gets its own folder, so one whose exes are still running
/// (an ongoing scrub) is never renamed or replaced. Anything else ("….tmp") is not an install
fn parse_version_dir(name: &str) -> Option<(Vec<u32>, u64)> {
    let (version, stamp) = match name.split_once('-') {
        Some((v, s)) => (v, if s.bytes().all(|b| b.is_ascii_digit()) { s.parse().ok()? } else { return None }),
        None => (name, 0),
    };
    if version.is_empty() {
        return None;
    }
    let parts = version
        .split('.')
        .map(|p| if p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()) { None } else { p.parse().ok() })
        .collect::<Option<Vec<u32>>>()?;
    Some((parts, stamp))
}

fn pair_in(dir: &Path) -> Option<(PathBuf, PathBuf)> {
    let ffmpeg = dir.join("ffmpeg.exe");
    let ffprobe = dir.join("ffprobe.exe");
    (ffmpeg.is_file() && ffprobe.is_file()).then_some((ffmpeg, ffprobe))
}

fn check_candidate(dir: &Path, source: ToolSource) -> Option<Tools> {
    let (ffmpeg, ffprobe) = pair_in(dir)?;
    let version = validated_version(&ffmpeg)?;
    Some(Tools { ffmpeg, ffprobe, version, source })
}

/// Runs `-version` only for an exe not seen before (or replaced since)
fn validated_version(ffmpeg: &Path) -> Option<String> {
    let meta = fs::metadata(ffmpeg).ok()?;
    let modified = meta.modified().ok();
    let len = meta.len();
    {
        let cache = lock(&VALIDATED);
        if let Some(v) = cache.iter().find(|v| v.path == ffmpeg && v.modified == modified && v.len == len) {
            return v.version.clone();
        }
    }
    // A failed start or a timeout is not remembered: it may be Defender's first scan or a busy disk
    let output = run_version(ffmpeg).ok()?;
    let version = version_if_supported(&output);
    let mut cache = lock(&VALIDATED);
    cache.retain(|v| v.path != ffmpeg);
    if cache.len() >= VALIDATED_MAX {
        cache.remove(0);
    }
    cache.push(Validation { path: ffmpeg.to_path_buf(), modified, len, version: version.clone() });
    version
}

/// Label from `-version` output when libavcodec is new enough, otherwise None
fn version_if_supported(output: &str) -> Option<String> {
    let avcodec = parse_libavcodec(output)?;
    (avcodec >= MIN_LIBAVCODEC).then(|| version_label(output))
}

/// `libavcodec     62. 11.100 / 62. 11.100` → (62, 11). The only reliable version: git builds say
/// "ffmpeg version N-…", distro builds "4.4.2-0ubuntu…"
fn parse_libavcodec(output: &str) -> Option<(u32, u32)> {
    for line in output.lines() {
        let Some(rest) = line.trim_start().strip_prefix("libavcodec") else { continue };
        if !rest.starts_with(|c: char| c.is_whitespace()) {
            continue;
        }
        let compiled = rest.split('/').next().unwrap_or("");
        let compact: String = compiled.chars().filter(|c| !c.is_whitespace()).collect();
        let mut parts = compact.split('.');
        let major = parts.next()?.parse().ok()?;
        let minor = parts.next()?.parse().ok()?;
        return Some((major, minor));
    }
    None
}

/// Best-effort "9.0.2" from "ffmpeg version 9.0.2-essentials_build-www.gyan.dev"; `n7.1` → "7.1";
/// git builds keep their token ("N-118000-g…", cut to 32 chars)
fn version_label(output: &str) -> String {
    let token = output
        .lines()
        .find_map(|l| l.trim_start().strip_prefix("ffmpeg version "))
        .and_then(|rest| rest.split_whitespace().next())
        .unwrap_or("");
    let token = match token.strip_prefix('n') {
        Some(rest) if rest.starts_with(|c: char| c.is_ascii_digit()) => rest,
        _ => token,
    };
    let numeric: String = token.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let numeric = numeric.trim_end_matches('.');
    if numeric.contains('.') {
        numeric.to_string()
    } else {
        token.chars().take(32).collect()
    }
}

fn kill_and_reap(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// `ffmpeg -hide_banner -version` → stdout. No window; killed after 30 s
fn run_version(exe: &Path) -> Result<String, String> {
    use std::os::windows::process::CommandExt;

    let mut child = Command::new(exe)
        .args(["-hide_banner", "-version"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    let Some(stdout) = child.stdout.take() else {
        kill_and_reap(&mut child);
        return Err("No stdout".to_string());
    };
    let deadline = Instant::now() + VERSION_TIMEOUT;
    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    let reader = thread::Builder::new()
        .name("ffmpeg-version".into())
        .stack_size(64 * 1024)
        .spawn(move || {
            let mut buf = Vec::new();
            let _ = Read::take(stdout, 1024 * 1024).read_to_end(&mut buf);
            let _ = tx.send(buf);
        });
    if reader.is_err() {
        kill_and_reap(&mut child);
        return Err("Could not start a reader thread".to_string());
    }
    let output = match rx.recv_timeout(VERSION_TIMEOUT) {
        Ok(buf) => buf,
        Err(_) => {
            kill_and_reap(&mut child);
            return Err("ffmpeg -version timed out".to_string());
        }
    };
    // stdout closed: the process is exiting
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(10)),
            _ => {
                kill_and_reap(&mut child);
                break;
            }
        }
    }
    Ok(String::from_utf8_lossy(&output).into_owned())
}

/// Folders of the machine PATH, then the user PATH, read fresh from the registry
fn registry_path_dirs() -> Vec<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let system = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment")
        .ok();
    let user = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Environment").ok();
    let read = |key: &Option<RegKey>, name: &str| -> Option<String> {
        key.as_ref().and_then(|k| k.get_value::<String, _>(name).ok())
    };
    // Same precedence as Windows builds the environment: user variables over machine ones;
    // dynamic ones (USERPROFILE, SystemRoot…) only exist in the process environment, which keeps them right
    let lookup = |name: &str| -> Option<String> {
        read(&user, name).or_else(|| read(&system, name)).or_else(|| std::env::var(name).ok())
    };

    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for raw in [read(&system, "Path"), read(&user, "Path")].into_iter().flatten() {
        for entry in raw.split(';') {
            let entry = entry.trim().trim_matches('"').trim();
            if entry.is_empty() {
                continue;
            }
            let expanded = expand_vars(entry, &lookup, 3);
            let path = PathBuf::from(expanded.trim_end_matches(['\\', '/']));
            if !path.is_absolute() {
                continue;
            }
            let key = path.to_string_lossy().to_lowercase();
            if seen.contains(&key) {
                continue;
            }
            seen.push(key);
            dirs.push(path);
        }
    }
    dirs
}

/// `%NAME%` expansion (names are case-insensitive through `lookup`). Unknown names and a lone `%`
/// stay as written; values are expanded again up to `depth` levels
fn expand_vars(input: &str, lookup: &dyn Fn(&str) -> Option<String>, depth: u32) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        let Some(end) = after.find('%') else {
            out.push_str(&rest[start..]);
            return out;
        };
        let name = &after[..end];
        match (!name.is_empty()).then(|| lookup(name)).flatten() {
            Some(value) if depth > 0 => out.push_str(&expand_vars(&value, lookup, depth - 1)),
            Some(value) => out.push_str(&value),
            None => {
                // Not a variable: keep the first % and look for a variable starting at the second
                out.push('%');
                rest = after;
                continue;
            }
        }
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    out
}

/// Leftovers of an interrupted install and replaced versions — only inside our own folder
fn cleanup_own_folder() {
    if DOWNLOADING.load(Ordering::SeqCst) {
        return;
    }
    let Some(root) = own_root() else { return };
    let keep = newest_own_install(&root).map(|(_, dir)| dir);
    let Ok(entries) = fs::read_dir(&root) else { return };
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else { continue };
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        if file_type.is_file() && name.ends_with(".partial") {
            let _ = fs::remove_file(&path);
        } else if file_type.is_dir() {
            let stale_version = parse_version_dir(&name).is_some() && keep.as_ref() != Some(&path);
            if name.ends_with(".tmp") || stale_version {
                let _ = fs::remove_dir_all(&path);
            }
        }
    }
}

// ---- Download and install -----------------------------------------------------------------------

enum Failure {
    Cancelled,
    Message(String),
}

fn fail(message: &str) -> Failure {
    Failure::Message(message.to_string())
}

fn io_failure(e: io::Error) -> Failure {
    // ERROR_HANDLE_DISK_FULL / ERROR_DISK_FULL
    if matches!(e.raw_os_error(), Some(39) | Some(112)) {
        return fail(ERR_DISK);
    }
    Failure::Message(format!("Could not write ffmpeg to disk: {e}"))
}

fn net_failure(e: reqwest::Error) -> Failure {
    let mut text = e.to_string();
    let mut source = std::error::Error::source(&e);
    while let Some(s) = source {
        text.push_str(" | ");
        text.push_str(&s.to_string());
        source = s.source();
    }
    let text = text.to_lowercase();
    if ["certificate", "tls", "handshake", "proxy"].iter().any(|k| text.contains(k)) {
        fail(ERR_BLOCKED)
    } else {
        fail(ERR_OFFLINE)
    }
}

fn http_failure(status: reqwest::StatusCode) -> Failure {
    match status.as_u16() {
        404 | 410 => fail(ERR_CORRUPT),
        429 | 500..=599 => Failure::Message(format!("GitHub is not available right now (HTTP {}) — try again later", status.as_u16())),
        _ => fail(ERR_BLOCKED),
    }
}

/// Sets the phase unless a cancel already switched it to Cancelling
fn set_phase(phase: Phase) {
    let status = {
        let mut st = lock(&STATE);
        if st.phase == Phase::Cancelling {
            return;
        }
        st.phase = phase;
        st.bump()
    };
    emit("ffmpeg:progress", status);
}

fn set_downloaded(downloaded: u64) {
    let status = {
        let mut st = lock(&STATE);
        st.downloaded = downloaded;
        st.bump()
    };
    emit("ffmpeg:progress", status);
}

fn check_cancel() -> Result<(), Failure> {
    if CANCEL.load(Ordering::SeqCst) { Err(Failure::Cancelled) } else { Ok(()) }
}

/// Runs on the download thread
fn install_pinned() -> Result<(), Failure> {
    let root = own_root().ok_or_else(|| fail("Could not find the local app data folder"))?;
    fs::create_dir_all(&root).map_err(io_failure)?;
    if free_space(&root).is_some_and(|free| free < MIN_FREE_BYTES) {
        return Err(fail(ERR_DISK));
    }

    let partial = root.join(PARTIAL_NAME);
    tauri::async_runtime::block_on(download_to(&partial))?;
    check_cancel()?;

    set_phase(Phase::Installing);
    let tmp = root.join(format!("{FFMPEG_VERSION}.tmp"));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err(io_failure)?;
    let targets = [(ZIP_FFMPEG, tmp.join("ffmpeg.exe")), (ZIP_FFPROBE, tmp.join("ffprobe.exe"))];
    let targets: Vec<(&str, &Path)> = targets.iter().map(|(n, p)| (*n, p.as_path())).collect();
    extract_files(&partial, &targets, &CANCEL).map_err(|e| match e {
        ExtractError::Cancelled => Failure::Cancelled,
        ExtractError::Io(e) => io_failure(e),
        // The archive matched the pinned hash, so this is a wrong pin, not a bad download
        ExtractError::Format(detail) => {
            eprintln!("[media_tools] ffmpeg archive: {detail}");
            fail(ERR_CORRUPT)
        }
    })?;
    let _ = fs::remove_file(&partial);

    // First start of the new exe: also lets Defender scan it before previews need it
    let output = run_version(&tmp.join("ffmpeg.exe"))
        .map_err(|e| Failure::Message(format!("The downloaded ffmpeg did not start: {e}")))?;
    if version_if_supported(&output).is_none() {
        return Err(fail(ERR_CORRUPT));
    }
    check_cancel()?;

    // A new folder per install: a previous one may still be running a scrub, so it is never touched here;
    // discovery switches to the newest, and the next app start removes the older ones
    let millis = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let final_dir = root.join(format!("{FFMPEG_VERSION}-{millis}"));
    fs::rename(&tmp, &final_dir).map_err(io_failure)?;

    discover_and_publish();
    Ok(())
}

/// Updates the snapshot, emits `ffmpeg:done`, frees the slot for the next download
fn finish_install(result: Result<(), Failure>) -> Result<(), String> {
    if let Some(root) = own_root() {
        let _ = fs::remove_file(root.join(PARTIAL_NAME));
        let _ = fs::remove_dir_all(root.join(format!("{FFMPEG_VERSION}.tmp")));
    }
    let (status, outcome) = {
        let mut st = lock(&STATE);
        let outcome = match result {
            Ok(()) => {
                st.phase = Phase::Idle;
                st.last_error = None;
                st.downloaded = st.total;
                Ok(())
            }
            Err(Failure::Cancelled) => {
                st.phase = Phase::Idle;
                st.last_error = None;
                st.downloaded = 0;
                Ok(())
            }
            Err(Failure::Message(message)) => {
                st.phase = Phase::Error;
                st.last_error = Some(message.clone());
                Err(message)
            }
        };
        (st.bump(), outcome)
    };
    CANCEL.store(false, Ordering::SeqCst);
    DOWNLOADING.store(false, Ordering::SeqCst);
    emit("ffmpeg:done", status);
    outcome
}

fn free_space(dir: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let wide: Vec<u16> = dir.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut free: u64 = 0;
    // SAFETY: `wide` is NUL-terminated and outlives the call; `free` is a valid out pointer
    unsafe { GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), Some(&mut free), None, None) }.ok()?;
    Some(free)
}

/// Stall/cancel watchdog for the download future: no tokio timer is available to this crate, so one
/// small thread checks every 250 ms and wakes the waiting future when the connection stalls or the
/// user cancels
struct Watch {
    base: Instant,
    last_ms: AtomicU64,
    stalled: AtomicBool,
    done: AtomicBool,
    waker: Mutex<Option<Waker>>,
}

impl Watch {
    fn touch(&self) {
        self.last_ms.store(self.base.elapsed().as_millis() as u64, Ordering::SeqCst);
    }

    fn wake(&self) {
        if let Some(waker) = lock(&self.waker).take() {
            waker.wake();
        }
    }
}

/// Stops the watchdog thread when the download ends (any way)
struct WatchGuard(Arc<Watch>);

impl Drop for WatchGuard {
    fn drop(&mut self) {
        self.0.done.store(true, Ordering::SeqCst);
    }
}

fn start_watchdog() -> Result<WatchGuard, Failure> {
    let watch = Arc::new(Watch {
        base: Instant::now(),
        last_ms: AtomicU64::new(0),
        stalled: AtomicBool::new(false),
        done: AtomicBool::new(false),
        waker: Mutex::new(None),
    });
    let w = watch.clone();
    thread::Builder::new()
        .name("ffmpeg-download-watch".into())
        .stack_size(64 * 1024)
        .spawn(move || loop {
            thread::sleep(WATCHDOG_TICK);
            if w.done.load(Ordering::SeqCst) {
                break;
            }
            let idle = (w.base.elapsed().as_millis() as u64).saturating_sub(w.last_ms.load(Ordering::SeqCst));
            if idle > CHUNK_TIMEOUT.as_millis() as u64 {
                w.stalled.store(true, Ordering::SeqCst);
                w.wake();
            }
            if CANCEL.load(Ordering::SeqCst) {
                w.wake();
            }
        })
        .map_err(|e| Failure::Message(format!("Could not start the download: {e}")))?;
    Ok(WatchGuard(watch))
}

/// Awaits `fut`, giving up on cancel or after 30 s without it completing
async fn guarded<F: Future>(watch: &Watch, fut: F) -> Result<F::Output, Failure> {
    watch.touch();
    let mut fut = pin!(fut);
    std::future::poll_fn(|cx| {
        if CANCEL.load(Ordering::SeqCst) {
            return Poll::Ready(Err(Failure::Cancelled));
        }
        if watch.stalled.load(Ordering::SeqCst) {
            return Poll::Ready(Err(fail(ERR_OFFLINE)));
        }
        if let Poll::Ready(value) = fut.as_mut().poll(cx) {
            return Poll::Ready(Ok(value));
        }
        *lock(&watch.waker) = Some(cx.waker().clone());
        // A flag set between the checks above and storing the waker would otherwise be missed
        if CANCEL.load(Ordering::SeqCst) || watch.stalled.load(Ordering::SeqCst) {
            cx.waker().wake_by_ref();
        }
        Poll::Pending
    })
    .await
}

/// Streams the pinned zip into `partial`, hashing on the way; verified on return
async fn download_to(partial: &Path) -> Result<(), Failure> {
    let guard = start_watchdog()?;
    let watch = &*guard.0;
    let client = reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .user_agent("nullSpace-ffmpeg/1.0")
        .build()
        .map_err(net_failure)?;

    let mut response = guarded(watch, client.get(ZIP_URL).send()).await?.map_err(net_failure)?;
    if !response.status().is_success() {
        return Err(http_failure(response.status()));
    }
    if response.content_length() != Some(ZIP_SIZE) {
        return Err(fail(ERR_CORRUPT));
    }

    let file = File::create(partial).map_err(io_failure)?;
    let mut writer = BufWriter::with_capacity(WRITE_BUFFER, file);
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();
    while let Some(chunk) = guarded(watch, response.chunk()).await?.map_err(net_failure)? {
        downloaded += chunk.len() as u64;
        if downloaded > ZIP_SIZE {
            return Err(fail(ERR_CORRUPT));
        }
        hasher.update(&chunk);
        writer.write_all(&chunk).map_err(io_failure)?;
        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            last_emit = Instant::now();
            set_downloaded(downloaded);
        }
    }
    if downloaded != ZIP_SIZE {
        return Err(fail(ERR_OFFLINE));
    }
    let file = writer.into_inner().map_err(|e| io_failure(e.into_error()))?;
    drop(file);
    set_downloaded(downloaded);
    check_cancel()?;

    set_phase(Phase::Verifying);
    if !digest_matches(&hasher.finalize(), ZIP_SHA256) {
        return Err(fail(ERR_CORRUPT));
    }
    Ok(())
}

fn digest_matches(digest: &[u8], expected_hex: &str) -> bool {
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    hex.eq_ignore_ascii_case(expected_hex)
}

// ---- Minimal zip reader -------------------------------------------------------------------------
// Only for the hash-verified archive: end of central directory → central directory → the wanted
// entries → their local headers → stored or raw-deflate data, checked by CRC-32 and size

#[derive(Debug)]
enum ExtractError {
    Cancelled,
    Io(io::Error),
    Format(String),
}

impl From<io::Error> for ExtractError {
    fn from(e: io::Error) -> Self {
        ExtractError::Io(e)
    }
}

fn format_err(message: &str) -> ExtractError {
    ExtractError::Format(message.to_string())
}

#[derive(Clone, Debug)]
struct ZipEntry {
    method: u16,
    crc: u32,
    compressed: u64,
    size: u64,
    local_offset: u64,
}

fn le16(b: &[u8], at: usize) -> Option<u16> {
    b.get(at..at + 2).map(|s| u16::from_le_bytes([s[0], s[1]]))
}

fn le32(b: &[u8], at: usize) -> Option<u32> {
    b.get(at..at + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

const EOCD_SIG: u32 = 0x0605_4b50;
const CDH_SIG: u32 = 0x0201_4b50;
const LFH_SIG: u32 = 0x0403_4b50;
const MAX_CENTRAL_DIR: u64 = 16 * 1024 * 1024;

/// Central-directory records of `wanted` (each must occur exactly once), plus where the directory starts
fn find_entries(file: &mut File, wanted: &[&str]) -> Result<(Vec<ZipEntry>, u64), ExtractError> {
    let len = file.seek(SeekFrom::End(0))?;
    let tail_len = len.min(22 + 65_535);
    let tail_start = len - tail_len;
    file.seek(SeekFrom::Start(tail_start))?;
    let mut tail = vec![0u8; tail_len as usize];
    file.read_exact(&mut tail)?;

    // Last record whose comment runs exactly to the end of the file
    let eocd = (0..tail.len().saturating_sub(21))
        .rev()
        .find(|&i| {
            le32(&tail, i) == Some(EOCD_SIG)
                && le16(&tail, i + 20).is_some_and(|comment| i + 22 + comment as usize == tail.len())
        })
        .ok_or_else(|| format_err("No end of central directory"))?;
    let count = le16(&tail, eocd + 10).ok_or_else(|| format_err("Truncated end record"))?;
    let cd_size = le32(&tail, eocd + 12).ok_or_else(|| format_err("Truncated end record"))? as u64;
    let cd_offset = le32(&tail, eocd + 16).ok_or_else(|| format_err("Truncated end record"))? as u64;
    if count == 0xFFFF || cd_size == 0xFFFF_FFFF || cd_offset == 0xFFFF_FFFF {
        return Err(format_err("Zip64 is not supported"));
    }
    if cd_size > MAX_CENTRAL_DIR || cd_offset + cd_size > tail_start + eocd as u64 {
        return Err(format_err("Central directory out of range"));
    }

    file.seek(SeekFrom::Start(cd_offset))?;
    let mut cd = vec![0u8; cd_size as usize];
    file.read_exact(&mut cd)?;

    let mut found: Vec<Option<ZipEntry>> = vec![None; wanted.len()];
    let mut at = 0usize;
    for _ in 0..count {
        let bad = || format_err("Truncated central directory");
        if le32(&cd, at) != Some(CDH_SIG) {
            return Err(bad());
        }
        let flags = le16(&cd, at + 8).ok_or_else(bad)?;
        let method = le16(&cd, at + 10).ok_or_else(bad)?;
        let crc = le32(&cd, at + 16).ok_or_else(bad)?;
        let compressed = le32(&cd, at + 20).ok_or_else(bad)? as u64;
        let size = le32(&cd, at + 24).ok_or_else(bad)? as u64;
        let name_len = le16(&cd, at + 28).ok_or_else(bad)? as usize;
        let extra_len = le16(&cd, at + 30).ok_or_else(bad)? as usize;
        let comment_len = le16(&cd, at + 32).ok_or_else(bad)? as usize;
        let local_offset = le32(&cd, at + 42).ok_or_else(bad)? as u64;
        let name = cd.get(at + 46..at + 46 + name_len).ok_or_else(bad)?;
        if let Some(i) = wanted.iter().position(|w| w.as_bytes() == name) {
            if found[i].is_some() {
                return Err(format_err("Duplicate entry"));
            }
            if flags & 1 != 0 {
                return Err(format_err("Encrypted entry"));
            }
            if compressed == 0xFFFF_FFFF || size == 0xFFFF_FFFF || local_offset == 0xFFFF_FFFF {
                return Err(format_err("Zip64 is not supported"));
            }
            found[i] = Some(ZipEntry { method, crc, compressed, size, local_offset });
        }
        at += 46 + name_len + extra_len + comment_len;
    }
    let entries = found.into_iter().collect::<Option<Vec<_>>>().ok_or_else(|| format_err("Entry not found"))?;
    Ok((entries, cd_offset))
}

/// Extracts each `(entry name, destination)`; checks `cancel` between buffers
fn extract_files(zip: &Path, targets: &[(&str, &Path)], cancel: &AtomicBool) -> Result<(), ExtractError> {
    let mut file = File::open(zip)?;
    let names: Vec<&str> = targets.iter().map(|(n, _)| *n).collect();
    let (entries, cd_offset) = find_entries(&mut file, &names)?;
    for (entry, (_, dest)) in entries.iter().zip(targets) {
        extract_entry(&mut file, entry, cd_offset, dest, cancel)?;
    }
    Ok(())
}

fn extract_entry(file: &mut File, entry: &ZipEntry, cd_offset: u64, dest: &Path, cancel: &AtomicBool) -> Result<(), ExtractError> {
    use miniz_oxide::inflate::stream::{inflate, InflateState};
    use miniz_oxide::{DataFormat, MZError, MZFlush, MZStatus};

    file.seek(SeekFrom::Start(entry.local_offset))?;
    let mut header = [0u8; 30];
    file.read_exact(&mut header)?;
    if le32(&header, 0) != Some(LFH_SIG) {
        return Err(format_err("Bad local header"));
    }
    let name_len = le16(&header, 26).unwrap_or(0) as u64;
    let extra_len = le16(&header, 28).unwrap_or(0) as u64;
    let data_start = entry.local_offset + 30 + name_len + extra_len;
    if data_start + entry.compressed > cd_offset {
        return Err(format_err("Entry data out of range"));
    }
    file.seek(SeekFrom::Start(data_start))?;
    let mut input = Read::take(&mut *file, entry.compressed);

    let mut out = BufWriter::with_capacity(WRITE_BUFFER, File::create(dest)?);
    let mut crc = 0u32;
    let mut written: u64 = 0;
    const BUF: usize = 64 * 1024;
    let mut push = |data: &[u8], crc: &mut u32, written: &mut u64| -> Result<(), ExtractError> {
        *written += data.len() as u64;
        if *written > entry.size {
            return Err(format_err("Entry larger than recorded"));
        }
        *crc = crc32_update(*crc, data);
        out.write_all(data)?;
        Ok(())
    };

    match entry.method {
        0 => {
            if entry.compressed != entry.size {
                return Err(format_err("Stored entry size mismatch"));
            }
            let mut buf = vec![0u8; BUF];
            loop {
                if cancel.load(Ordering::SeqCst) {
                    return Err(ExtractError::Cancelled);
                }
                let n = input.read(&mut buf)?;
                if n == 0 {
                    break;
                }
                push(&buf[..n], &mut crc, &mut written)?;
            }
        }
        8 => {
            let mut state = InflateState::new_boxed(DataFormat::Raw);
            let mut inbuf = vec![0u8; BUF];
            let mut outbuf = vec![0u8; BUF];
            let (mut start, mut end) = (0usize, 0usize);
            let mut input_done = false;
            loop {
                if cancel.load(Ordering::SeqCst) {
                    return Err(ExtractError::Cancelled);
                }
                if start == end && !input_done {
                    end = input.read(&mut inbuf)?;
                    start = 0;
                    input_done = end == 0;
                }
                let result = inflate(&mut state, &inbuf[start..end], &mut outbuf, MZFlush::None);
                start += result.bytes_consumed;
                if result.bytes_written > 0 {
                    push(&outbuf[..result.bytes_written], &mut crc, &mut written)?;
                }
                match result.status {
                    Ok(MZStatus::StreamEnd) => break,
                    Ok(_) => {}
                    // No progress: more input is needed (none left = truncated stream)
                    Err(MZError::Buf) if result.bytes_consumed == 0 && result.bytes_written == 0 => {
                        if input_done || start < end {
                            return Err(format_err("Truncated deflate stream"));
                        }
                    }
                    Err(MZError::Buf) => {}
                    Err(_) => return Err(format_err("Corrupt deflate stream")),
                }
            }
        }
        _ => return Err(format_err("Unsupported compression method")),
    }

    if written != entry.size {
        return Err(format_err("Entry size mismatch"));
    }
    if crc != entry.crc {
        return Err(format_err("CRC mismatch"));
    }
    out.flush()?;
    Ok(())
}

const CRC_TABLE: [u32; 256] = {
    let mut table = [0u32; 256];
    let mut i = 0;
    while i < 256 {
        let mut c = i as u32;
        let mut k = 0;
        while k < 8 {
            c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            k += 1;
        }
        table[i] = c;
        i += 1;
    }
    table
};

/// CRC-32 (IEEE, as in zip); start with 0, feed chunks in order
fn crc32_update(crc: u32, data: &[u8]) -> u32 {
    let mut c = !crc;
    for &b in data {
        c = CRC_TABLE[((c ^ b as u32) & 0xFF) as usize] ^ (c >> 8);
    }
    !c
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nullspace-media-tools-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    /// Minimal zip writer for the tests: (name, data, deflate?)
    fn build_zip(entries: &[(&str, &[u8], bool)]) -> Vec<u8> {
        let mut out = Vec::new();
        let mut central = Vec::new();
        for (name, data, deflate) in entries {
            let packed = if *deflate { miniz_oxide::deflate::compress_to_vec(data, 6) } else { data.to_vec() };
            let method: u16 = if *deflate { 8 } else { 0 };
            let crc = crc32_update(0, data);
            let offset = out.len() as u32;
            out.extend_from_slice(&LFH_SIG.to_le_bytes());
            out.extend_from_slice(&20u16.to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(&method.to_le_bytes());
            out.extend_from_slice(&[0u8; 4]);
            out.extend_from_slice(&crc.to_le_bytes());
            out.extend_from_slice(&(packed.len() as u32).to_le_bytes());
            out.extend_from_slice(&(data.len() as u32).to_le_bytes());
            out.extend_from_slice(&(name.len() as u16).to_le_bytes());
            out.extend_from_slice(&3u16.to_le_bytes());
            out.extend_from_slice(name.as_bytes());
            out.extend_from_slice(&[1, 2, 3]);
            out.extend_from_slice(&packed);

            central.extend_from_slice(&CDH_SIG.to_le_bytes());
            central.extend_from_slice(&20u16.to_le_bytes());
            central.extend_from_slice(&20u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&method.to_le_bytes());
            central.extend_from_slice(&[0u8; 4]);
            central.extend_from_slice(&crc.to_le_bytes());
            central.extend_from_slice(&(packed.len() as u32).to_le_bytes());
            central.extend_from_slice(&(data.len() as u32).to_le_bytes());
            central.extend_from_slice(&(name.len() as u16).to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&[0u8; 8]);
            central.extend_from_slice(&offset.to_le_bytes());
            central.extend_from_slice(name.as_bytes());
        }
        let cd_offset = out.len() as u32;
        out.extend_from_slice(&central);
        out.extend_from_slice(&EOCD_SIG.to_le_bytes());
        out.extend_from_slice(&[0u8; 4]);
        out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
        out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
        out.extend_from_slice(&(central.len() as u32).to_le_bytes());
        out.extend_from_slice(&cd_offset.to_le_bytes());
        out.extend_from_slice(&7u16.to_le_bytes());
        out.extend_from_slice(b"comment");
        out
    }

    fn sample(len: usize) -> Vec<u8> {
        // Compressible but not trivial, longer than the 64 KB buffers
        (0..len).map(|i| ((i * 31) ^ (i >> 7)) as u8).collect()
    }

    #[test]
    fn crc32_known_value() {
        assert_eq!(crc32_update(0, b"123456789"), 0xCBF4_3926);
        let split = crc32_update(crc32_update(0, b"1234"), b"56789");
        assert_eq!(split, 0xCBF4_3926);
    }

    #[test]
    fn sha256_and_size_check() {
        let digest = Sha256::digest(b"abc");
        assert!(digest_matches(&digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
        assert!(!digest_matches(&digest, ZIP_SHA256));
        assert_eq!(ZIP_SHA256.len(), 64);
        assert_eq!(ZIP_SIZE, 114_768_076);
    }

    #[test]
    fn zip_reader_extracts_deflated_and_stored() {
        let dir = temp_dir("zip-ok");
        let big = sample(300_000);
        let small = b"ffprobe stored".to_vec();
        let zip = build_zip(&[
            ("root/", &b""[..], false),
            ("root/bin/ffmpeg.exe", &big[..], true),
            ("root/bin/ffplay.exe", &b"skip me"[..], true),
            ("root/bin/ffprobe.exe", &small[..], false),
        ]);
        let zip_path = dir.join("a.zip");
        fs::write(&zip_path, &zip).expect("write zip");
        let a = dir.join("ffmpeg.exe");
        let b = dir.join("ffprobe.exe");
        let cancel = AtomicBool::new(false);
        extract_files(&zip_path, &[("root/bin/ffmpeg.exe", &a), ("root/bin/ffprobe.exe", &b)], &cancel)
            .expect("extract");
        assert_eq!(fs::read(&a).expect("read a"), big);
        assert_eq!(fs::read(&b).expect("read b"), small);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn zip_reader_rejects_bad_input() {
        let dir = temp_dir("zip-bad");
        let data = sample(100_000);
        let dest = dir.join("out.exe");
        let cancel = AtomicBool::new(false);

        // Missing entry
        let zip = build_zip(&[("x/ffmpeg.exe", &data[..], true)]);
        let p = dir.join("missing.zip");
        fs::write(&p, &zip).expect("write");
        assert!(matches!(extract_files(&p, &[("x/ffprobe.exe", &dest)], &cancel), Err(ExtractError::Format(_))));

        // Duplicate entry
        let zip = build_zip(&[("x/ffmpeg.exe", &data[..], true), ("x/ffmpeg.exe", &data[..], true)]);
        let p = dir.join("dup.zip");
        fs::write(&p, &zip).expect("write");
        assert!(matches!(extract_files(&p, &[("x/ffmpeg.exe", &dest)], &cancel), Err(ExtractError::Format(_))));

        // CRC mismatch: flip one byte of the CRC in the central directory
        let mut zip = build_zip(&[("x/ffmpeg.exe", &data[..], true)]);
        let cd = zip.windows(4).rposition(|w| w == CDH_SIG.to_le_bytes()).expect("cd");
        zip[cd + 16] ^= 0xFF;
        let p = dir.join("crc.zip");
        fs::write(&p, &zip).expect("write");
        assert!(matches!(extract_files(&p, &[("x/ffmpeg.exe", &dest)], &cancel), Err(ExtractError::Format(_))));

        // Not a zip
        let p = dir.join("junk.zip");
        fs::write(&p, b"definitely not a zip file").expect("write");
        assert!(matches!(extract_files(&p, &[("x/ffmpeg.exe", &dest)], &cancel), Err(ExtractError::Format(_))));

        // Cancelled
        let zip = build_zip(&[("x/ffmpeg.exe", &data[..], true)]);
        let p = dir.join("cancel.zip");
        fs::write(&p, &zip).expect("write");
        let cancelled = AtomicBool::new(true);
        assert!(matches!(extract_files(&p, &[("x/ffmpeg.exe", &dest)], &cancelled), Err(ExtractError::Cancelled)));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn libavcodec_version_parsing() {
        let gyan = "ffmpeg version 9.0.2-essentials_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers\n\
                    built with gcc\nlibavutil      60. 26.100 / 60. 26.100\nlibavcodec     62. 28.100 / 62. 28.100\n";
        assert_eq!(parse_libavcodec(gyan), Some((62, 28)));
        assert_eq!(version_if_supported(gyan).as_deref(), Some("9.0.2"));

        let old = "ffmpeg version 4.4.2-0ubuntu0.22.04.1 Copyright\nlibavcodec     58.134.100 / 58.134.100\n";
        assert_eq!(parse_libavcodec(old), Some((58, 134)));
        assert_eq!(version_if_supported(old), None);

        let edge = "ffmpeg version n5.1 Copyright\nlibavcodec     59. 37.100 / 59. 37.100\n";
        assert_eq!(version_if_supported(edge).as_deref(), Some("5.1"));
        let below = "ffmpeg version 5.0 Copyright\nlibavcodec     59. 18.100 / 59. 18.100\n";
        assert_eq!(version_if_supported(below), None);

        let git = "ffmpeg version N-118000-g1234abcd-20250101 Copyright\nlibavcodec     61. 31.100 / 61. 31.100\n";
        assert_eq!(version_if_supported(git).as_deref(), Some("N-118000-g1234abcd-20250101"));

        assert_eq!(parse_libavcodec("libavcodecx 99.1\nnothing"), None);
        assert_eq!(version_if_supported("not ffmpeg at all"), None);
    }

    #[test]
    fn env_var_expansion() {
        let lookup = |name: &str| -> Option<String> {
            match name.to_ascii_lowercase().as_str() {
                "systemroot" => Some(r"C:\Windows".to_string()),
                "tools" => Some(r"%SystemRoot%\tools".to_string()),
                "loop" => Some("%loop%".to_string()),
                _ => None,
            }
        };
        assert_eq!(expand_vars(r"%SystemRoot%\System32", &lookup, 3), r"C:\Windows\System32");
        assert_eq!(expand_vars(r"%TOOLS%\bin", &lookup, 3), r"C:\Windows\tools\bin");
        assert_eq!(expand_vars(r"C:\100%\%unknown%\x", &lookup, 3), r"C:\100%\%unknown%\x");
        assert_eq!(expand_vars("a%%b", &lookup, 3), "a%%b");
        assert_eq!(expand_vars("50% off %SYSTEMROOT%", &lookup, 3), r"50% off C:\Windows");
        assert_eq!(expand_vars("trailing %", &lookup, 3), "trailing %");
        // Self-reference stops at the depth limit
        assert_eq!(expand_vars("%loop%", &lookup, 2), "%loop%");
    }

    #[test]
    fn version_folders() {
        assert_eq!(parse_version_dir("9.0.2"), Some((vec![9, 0, 2], 0)));
        assert_eq!(parse_version_dir("9.0.2-1731600000000"), Some((vec![9, 0, 2], 1731600000000)));
        assert_eq!(parse_version_dir("10.1"), Some((vec![10, 1], 0)));
        assert_eq!(parse_version_dir("9.0.2.tmp"), None);
        assert_eq!(parse_version_dir("9.0.2-123.tmp"), None);
        assert_eq!(parse_version_dir("9.0.2.old-123.tmp"), None);
        assert_eq!(parse_version_dir(""), None);
        assert_eq!(parse_version_dir("9..2"), None);

        let root = temp_dir("versions");
        for v in ["7.1", "9.0.2-100", "9.0.2-200", "10.0.0"] {
            fs::create_dir_all(root.join(v)).expect("dir");
            fs::write(root.join(v).join("ffmpeg.exe"), b"x").expect("exe");
        }
        // 10.0.0 lacks ffprobe: not an install. The later reinstall of 9.0.2 wins
        for v in ["7.1", "9.0.2-100", "9.0.2-200"] {
            fs::write(root.join(v).join("ffprobe.exe"), b"x").expect("exe");
        }
        let (name, dir) = newest_own_install(&root).expect("install");
        assert_eq!(name, "9.0.2");
        assert_eq!(dir, root.join("9.0.2-200"));
        let _ = fs::remove_dir_all(&root);
    }

    /// The real pinned archive: `NULLSPACE_FFMPEG_ZIP=<path> cargo test real_pinned_zip -- --ignored`
    #[test]
    #[ignore]
    fn real_pinned_zip() {
        let Ok(zip) = std::env::var("NULLSPACE_FFMPEG_ZIP") else { return };
        let dir = temp_dir("real-zip");
        let a = dir.join("ffmpeg.exe");
        let b = dir.join("ffprobe.exe");
        let cancel = AtomicBool::new(false);
        let t = Instant::now();
        extract_files(Path::new(&zip), &[(ZIP_FFMPEG, &a), (ZIP_FFPROBE, &b)], &cancel).expect("extract");
        println!("extracted in {} ms", t.elapsed().as_millis());
        let output = run_version(&a).expect("ffmpeg -version");
        println!("{output}");
        assert_eq!(version_if_supported(&output).as_deref(), Some(FFMPEG_VERSION));
        let probe = run_version(&b).expect("ffprobe -version");
        assert!(probe.contains("ffprobe version"));
        let _ = fs::remove_dir_all(&dir);
    }
}
