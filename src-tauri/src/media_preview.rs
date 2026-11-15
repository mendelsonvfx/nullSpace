//! Hover previews of videos and image sequences: row thumbnails and the 16-frame scrub strip.
//! One scheduler thread owns all state (processes, budget, current scrub); see the plan.
//!
//! CONTRACT (shared with the frontend src/utils/mediaPreview.ts — keep these names and shapes):
//! - command `get_video_thumbnail(path, modified, size) -> Result<Option<VideoThumb>, String>`
//!   errors "no_ffmpeg" / "busy" are not final (frontend retries later)
//! - command `start_scrub(window, request: ScrubRequest)` — sync, only queues
//! - command `cancel_scrub(id)` — sync, only queues; acts only if `id` is the current scrub
//! - command `clear_media_preview_cache()`
//! - events (to the requesting window): `scrub-meta`, `scrub-frame`, `scrub-done`
//! - `tools_changed(..)` is called by media_tools when ffmpeg appears/changes/disappears
//!
//! How a video scrub runs:
//! 1. slot 0 (`-ss 0`) and ffprobe start together; `scrub-meta` goes out once the size is known;
//! 2. ffprobe reads one packet at each slot time: the keyframe each slot would land on;
//! 3. slots sharing a keyframe share one process (`-noaccurate_seek -skip_frame nokey`), coarse to fine;
//!    with few keyframes and a cheap decode one `-threads 4` process picks exact frames by number;
//! 4. slot 15 is the exact last frame: accurate seek near the end (right away when the last GOP is
//!    short, last and with 4 threads when it's long; until then it shows the last keyframe).
//!
//! A slot can be sent twice (slot 15: keyframe first, then the exact last frame).
//! Every request that isn't cancelled or replaced ends with `scrub-done`.

use std::collections::{HashMap, VecDeque};
use std::ffi::OsString;
use std::hash::Hash;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::image_thumbnail::{ScrubImage, ScrubJob};
use crate::media_tools::Tools;

/// Row thumbnail of a video (64 px, JPEG data URL)
#[derive(Clone, Debug, Serialize)]
pub struct VideoThumb {
    pub data_url: String,
    /// Pixel size of the thumbnail itself (its aspect is the video's display aspect)
    pub width: u32,
    pub height: u32,
}

/// One frame of an image sequence (name relative to the sequence folder)
#[derive(Clone, Debug, Deserialize)]
pub struct SequenceFrame {
    pub name: String,
    pub frame: u32,
    /// Part of the frontend's cache key; not needed here
    #[allow(dead_code)]
    pub modified: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScrubKind {
    Video,
    Sequence,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ScrubRequest {
    /// Opaque, unique per request
    pub id: String,
    pub kind: ScrubKind,
    /// Video file, or the sequence folder
    pub path: String,
    /// Video: file mtime (ms) and size, as the frontend already knows them (no metadata() on the scheduler)
    pub modified: u64,
    pub size: u64,
    /// Sequence only: up to 16 frames, in timeline order
    #[serde(default)]
    pub frames: Vec<SequenceFrame>,
    /// Slots still missing (None = all)
    #[serde(default)]
    pub indices: Option<Vec<u32>>,
    /// Longest side of a scrub frame, px (min(384, ceil(224 * devicePixelRatio)))
    pub max_side: u32,
}

/// `scrub-meta`: sent once per request as soon as the source size is known
#[derive(Clone, Debug, Serialize)]
pub struct ScrubMeta {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub duration_ms: Option<u64>,
    pub fps: Option<f64>,
    /// Number of slots (16, or fewer for short sources)
    pub count: u32,
}

/// `scrub-frame`: one slot ready
#[derive(Clone, Debug, Serialize)]
pub struct ScrubFrame {
    pub id: String,
    pub slot: u32,
    pub data_url: String,
    /// Video: time of the frame shown in this slot
    pub time_ms: Option<u64>,
    /// Sequence: frame number shown in this slot
    pub frame: Option<u32>,
}

/// `scrub-done`: request finished (all slots sent, aliased or failed)
#[derive(Clone, Debug, Serialize)]
pub struct ScrubDone {
    pub id: String,
    /// Slots that will never come
    pub failed: Vec<u32>,
    /// (slot, source_slot): this slot shows the same picture as source_slot (shared keyframe)
    pub aliases: Vec<(u32, u32)>,
}

// ---------------------------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------------------------

const SLOTS: usize = 16;
/// Coarse to fine: the first frames cover the whole timeline
const ORDER: [u32; SLOTS] = [0, 15, 8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13];
/// Memory all running ffmpeg/ffprobe processes may use together, MB
const BUDGET_MB: u64 = 768;
/// Smallest per-process estimate, and the estimate before the frame size is known, MB
const MIN_PROC_MB: u64 = 60;
const UNKNOWN_PROC_MB: u64 = 120;
/// Row thumbnails never take more process slots than this
const THUMB_SLOTS: u32 = 2;
/// Waiting row thumbnails (newest first); older ones are dropped with "busy"
const THUMB_STACK: usize = 64;
const THUMB_VF: &str = "scale=iw*sar:ih,scale=64:64:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,format=yuvj420p";
/// One process decoding every frame (exact picks) is chosen up to this many decoded pixels
const SELECT_MAX_PX: f64 = 2.5e9;
/// ... and only with fewer unique keyframes than this
const SELECT_MAX_UNIQUE: usize = 12;
/// Last GOP shorter than this: the exact last frame is cheap and goes right after slot 0
const SHORT_TAIL_S: f64 = 1.0;
/// Output limits of one process
const MAX_FRAME_BYTES: usize = 512 * 1024;
const MAX_PROC_BYTES: usize = 8 * 1024 * 1024;
const PROC_TIMEOUT: Duration = Duration::from_secs(10);
const PROBE_TIMEOUT: Duration = Duration::from_secs(8);
/// After stdout closed: how often to check for exit, and when to kill a process that doesn't exit
const REAP_POLL: Duration = Duration::from_millis(10);
const REAP_GRACE: Duration = Duration::from_secs(2);
const PROBE_CACHE: usize = 200;
const FAILURE_CACHE: usize = 256;
/// ffmpeg not found on spawn: search again at most this often
const REFRESH_INTERVAL: Duration = Duration::from_secs(10);
const READER_STACK: usize = 64 * 1024;

const NO_FFMPEG: &str = "no_ffmpeg";
const BUSY: &str = "busy";

/// Sequence formats decoded in process (image_thumbnail) and through ffmpeg
const SEQ_IN_PROCESS: [&str; 10] = ["jpg", "jpeg", "png", "gif", "bmp", "tga", "tif", "tiff", "hdr", "exr"];
const SEQ_FFMPEG: [&str; 9] = ["webp", "dpx", "sgi", "rgb", "rgba", "bw", "pic", "int", "inta"];

#[derive(Clone, Copy, Debug)]
struct Limits {
    budget_mb: u64,
    max_procs: u32,
    thumb_slots: u32,
    select_max_px: f64,
}

impl Limits {
    fn for_machine() -> Self {
        let cores = std::thread::available_parallelism().map_or(4, |n| n.get()) as u32;
        Limits { budget_mb: BUDGET_MB, max_procs: max_procs(cores), thumb_slots: THUMB_SLOTS, select_max_px: SELECT_MAX_PX }
    }
}

/// Hard cap of concurrent processes: half the logical cores, 2..=8
fn max_procs(cores: u32) -> u32 {
    (cores / 2).clamp(2, 8)
}

/// Budget share of one process: process slots and estimated memory (MB)
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Cost {
    mb: u64,
    slots: u32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Usage {
    procs: u32,
    slots: u32,
    mb: u64,
    thumb_slots: u32,
}

/// A process may start when nothing runs (even one over budget), or when it fits both limits
fn fits(used: Usage, cost: Cost, limits: &Limits) -> bool {
    used.procs == 0 || (used.slots + cost.slots <= limits.max_procs && used.mb + cost.mb <= limits.budget_mb)
}

/// Decoder memory of one `-threads 1` process: max(60 MB, W×H×k), k = 10 for 8-bit 4:2:0, 40 for
/// 4:4:4, alpha or more than 8 bits
fn proc_mb(width: u32, height: u32, pix_fmt: &str) -> u64 {
    let k = if heavy_pix_fmt(pix_fmt) { 40 } else { 10 };
    ((width as u64 * height as u64 * k) >> 20).max(MIN_PROC_MB)
}

fn heavy_pix_fmt(pix_fmt: &str) -> bool {
    let p = pix_fmt.to_ascii_lowercase();
    const ALPHA: [&str; 7] = ["yuva", "rgba", "bgra", "argb", "abgr", "gbrap", "ya"];
    const DEEP: [&str; 12] = ["p9", "p10", "p12", "p14", "p16", "10le", "10be", "12le", "12be", "16le", "16be", "f32"];
    p.contains("444") || ALPHA.iter().any(|a| p.starts_with(a)) || DEEP.iter().any(|d| p.contains(d))
        || p.starts_with("rgb48") || p.starts_with("rgb64") || p.starts_with("bgr48") || p.starts_with("bgr64")
}

// ---------------------------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------------------------

static TOOLS_AVAILABLE: AtomicBool = AtomicBool::new(false);

/// Path from the frontend: slashes unified, absolute, without `\\?\` (no length limit:
/// ffmpeg ≥ 5.1 and Rust handle long paths themselves)
pub fn normalize_media_path(path: &str) -> Result<PathBuf, String> {
    let invalid = || "Invalid path".to_string();
    let trimmed = path.trim();
    if trimmed.contains('\0') {
        return Err(invalid());
    }
    #[cfg(windows)]
    let mut p = {
        let s = trimmed.replace('/', "\\");
        if s.starts_with(r"\\.\") {
            return Err(invalid());
        }
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{}", rest)
        } else if let Some(rest) = s.strip_prefix(r"\\?\") {
            rest.to_string()
        } else {
            s
        }
    };
    #[cfg(not(windows))]
    let mut p = trimmed.to_string();
    let sep = std::path::MAIN_SEPARATOR;
    let is_root = |s: &str| s.len() == 1 || (s.len() == 3 && s.as_bytes()[1] == b':');
    while p.len() > 1 && p.ends_with(sep) && !is_root(&p) {
        p.pop();
    }
    if p.is_empty() || !Path::new(&p).is_absolute() {
        return Err(invalid());
    }
    Ok(PathBuf::from(p))
}

/// Whether ffmpeg is known to be available (never blocks)
pub fn tools_available() -> bool {
    TOOLS_AVAILABLE.load(Ordering::Relaxed)
}

/// Frame size for `width`×`height` (display size) fitting `max_side`: never enlarged, even sides
pub fn fit_even(width: u32, height: u32, max_side: u32) -> (u32, u32) {
    if width == 0 || height == 0 {
        return (2, 2);
    }
    let scale = (max_side as f64 / width.max(height) as f64).min(1.0);
    let even = |v: f64| (((v / 2.0).round() as u32) * 2).max(2);
    (even(width as f64 * scale), even(height as f64 * scale))
}

/// Blocking (image_thumbnail workers): a still decoded by ffmpeg as RGBA PNG fitting `side`.
/// None when ffmpeg is missing, busy or can't read the file
pub fn ffmpeg_still_png(path: &Path, modified: u64, size: u64, side: u32) -> Option<Vec<u8>> {
    let (tx, rx) = mpsc::channel();
    let key = StillKey { media: MediaKey { path: path.to_path_buf(), modified, size }, kind: StillKind::Png(side) };
    sender().send(Cmd::Still { key, reply: Box::new(move |r| { let _ = tx.send(r); }) }).ok()?;
    rx.recv_timeout(Duration::from_secs(20)).ok()?.ok()?
}

/// Called by media_tools when the ffmpeg in use changed (None: not available)
pub fn tools_changed(tools: Option<Tools>) {
    TOOLS_AVAILABLE.store(tools.is_some(), Ordering::Relaxed);
    let _ = sender().send(Cmd::Tools(tools));
}

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------

static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

#[tauri::command]
pub async fn get_video_thumbnail(app: tauri::AppHandle, path: String, modified: u64, size: u64) -> Result<Option<VideoThumb>, String> {
    let _ = APP.set(app);
    let Ok(path) = normalize_media_path(&path) else { return Ok(None) };
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    let key = StillKey { media: MediaKey { path, modified, size }, kind: StillKind::VideoThumb };
    let reply: StillReply = Box::new(move |r| { let _ = tx.try_send(r); });
    if sender().send(Cmd::Still { key, reply }).is_err() {
        return Err(BUSY.to_string());
    }
    let jpeg = rx.recv().await.unwrap_or_else(|| Err(BUSY.to_string()))?;
    Ok(jpeg.and_then(|bytes| video_thumb(&bytes)))
}

fn video_thumb(jpeg: &[u8]) -> Option<VideoThumb> {
    let (width, height) = jpeg_size(jpeg)?;
    Some(VideoThumb { data_url: jpeg_data_url(jpeg), width, height })
}

#[tauri::command]
pub fn start_scrub(window: tauri::Window, request: ScrubRequest) {
    let _ = APP.set(tauri::Manager::app_handle(&window));
    let path = normalize_media_path(&request.path).ok();
    let emit: Emitter = Arc::new(move |event| {
        let _ = match event {
            ScrubEvent::Meta(m) => window.emit("scrub-meta", m),
            ScrubEvent::Frame(f) => window.emit("scrub-frame", f),
            ScrubEvent::Done(d) => window.emit("scrub-done", d),
        };
    });
    let _ = sender().send(Cmd::Scrub { req: request, path, emit });
}

#[tauri::command]
pub fn cancel_scrub(id: String) {
    let _ = sender().send(Cmd::Cancel(id));
}

#[tauri::command]
pub fn clear_media_preview_cache() {
    let _ = sender().send(Cmd::Clear);
}

// ---------------------------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct MediaKey {
    path: PathBuf,
    modified: u64,
    size: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum StillKind {
    /// 64 px JPEG of a video's first frame
    VideoThumb,
    /// RGBA PNG of an image fitting this side (WebP thumbnails)
    Png(u32),
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct StillKey {
    media: MediaKey,
    kind: StillKind,
}

type StillReply = Box<dyn FnOnce(Result<Option<Vec<u8>>, String>) + Send>;

#[derive(Clone, Debug)]
pub enum ScrubEvent {
    Meta(ScrubMeta),
    Frame(ScrubFrame),
    Done(ScrubDone),
}

type Emitter = Arc<dyn Fn(ScrubEvent) + Send + Sync>;

enum ProcMsg {
    /// One JPEG of a frame stream
    Frame(Vec<u8>),
    /// Whole stdout of a collecting process
    Output(Vec<u8>),
    /// Source size read from the input's header (image sequences through ffmpeg)
    Dims(u32, u32),
    /// stdout closed; `ok` false when reading failed or a limit was hit
    End { ok: bool },
}

enum Cmd {
    Still { key: StillKey, reply: StillReply },
    Scrub { req: ScrubRequest, path: Option<PathBuf>, emit: Emitter },
    Cancel(String),
    Clear,
    Tools(Option<Tools>),
    Proc(u64, ProcMsg),
    Decoded { id: String, slot: u32, image: Option<ScrubImage> },
    #[cfg(test)]
    Inspect(Box<dyn FnOnce(&Scheduler) + Send>),
}

fn sender() -> &'static mpsc::Sender<Cmd> {
    static TX: OnceLock<mpsc::Sender<Cmd>> = OnceLock::new();
    TX.get_or_init(|| spawn_scheduler(None, Limits::for_machine(), true))
}

fn spawn_scheduler(tools: Option<Tools>, limits: Limits, global: bool) -> mpsc::Sender<Cmd> {
    let (tx, rx) = mpsc::channel();
    let scheduler = Scheduler::new(tx.clone(), tools, limits);
    let spawned = std::thread::Builder::new().name("media-preview".into()).spawn(move || {
        let mut scheduler = scheduler;
        if global {
            // On this thread: media_tools may hold its own lock while calling tools_changed.
            // Queued Tools commands are newer and are applied after this
            scheduler.global = true;
            scheduler.set_tools(crate::media_tools::current());
        }
        scheduler.run(rx);
    });
    if let Err(e) = spawned {
        println!("[MediaPreview] Scheduler not started: {}", e);
    }
    tx
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Exe {
    Ffmpeg,
    Ffprobe,
}

#[derive(Clone, Debug)]
enum ReadMode {
    /// Whole stdout, sent at the end
    Collect,
    /// A stream of JPEGs, sent one by one; optionally the input's header size first
    Jpeg { header: Option<PathBuf> },
}

/// Where the n-th frame of a process goes: the first slot owns it, the others show it too
#[derive(Clone, Debug, PartialEq)]
struct OutSpec {
    slots: Vec<u32>,
    time_ms: Option<u64>,
    frame: Option<u32>,
}

#[derive(Debug)]
enum Work {
    Probe,
    Keys,
    /// `retry` runs when the last output didn't come (exact last frame: empty output near the end)
    Frames { outputs: Vec<OutSpec>, retry: Option<Box<Task>> },
}

#[derive(Debug)]
struct Task {
    exe: Exe,
    args: Vec<OsString>,
    cost: Cost,
    read: ReadMode,
    timeout: Duration,
    work: Work,
}

enum Owner {
    Still { key: StillKey, waiters: Vec<StillReply>, output: Vec<u8> },
    Scrub { id: String, work: Work, received: usize, output: Vec<u8> },
    Done,
}

struct Proc {
    child: Option<Child>,
    job: Option<job::Job>,
    cost: Cost,
    thumb: bool,
    owner: Owner,
    deadline: Instant,
    /// stdout closed; the slot is freed once the process has exited too
    ended: Option<Instant>,
    killed: bool,
}

impl Proc {
    /// Closing the job kills the whole tree (shims included); kill() covers a failed job setup
    fn kill(&mut self) -> bool {
        self.job = None;
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
        }
        !std::mem::replace(&mut self.killed, true)
    }
}

/// Row thumbnails waiting for a slot: newest on top, identical requests merged
#[derive(Default)]
struct StillStack {
    jobs: Vec<(StillKey, Vec<StillReply>)>,
}

impl StillStack {
    /// Returns the waiters dropped from the bottom when the stack overflows
    fn push(&mut self, key: StillKey, reply: StillReply) -> Vec<StillReply> {
        if let Some(i) = self.jobs.iter().position(|(k, _)| *k == key) {
            let mut job = self.jobs.remove(i);
            job.1.push(reply);
            self.jobs.push(job);
            return Vec::new();
        }
        self.jobs.push((key, vec![reply]));
        if self.jobs.len() > THUMB_STACK {
            return self.jobs.remove(0).1;
        }
        Vec::new()
    }

    fn pop(&mut self) -> Option<(StillKey, Vec<StillReply>)> {
        self.jobs.pop()
    }

    fn is_empty(&self) -> bool {
        self.jobs.is_empty()
    }

    fn drain(&mut self) -> Vec<StillReply> {
        self.jobs.drain(..).flat_map(|(_, w)| w).collect()
    }
}

/// Small LRU (a few hundred entries: a linear scan on eviction is fine)
struct Lru<K, V> {
    map: HashMap<K, (V, u64)>,
    tick: u64,
    cap: usize,
}

impl<K: Hash + Eq + Clone, V> Lru<K, V> {
    fn new(cap: usize) -> Self {
        Lru { map: HashMap::new(), tick: 0, cap }
    }

    fn get(&mut self, key: &K) -> Option<&V> {
        self.tick += 1;
        let tick = self.tick;
        self.map.get_mut(key).map(|entry| {
            entry.1 = tick;
            &entry.0
        })
    }

    fn contains(&self, key: &K) -> bool {
        self.map.contains_key(key)
    }

    fn insert(&mut self, key: K, value: V) {
        self.tick += 1;
        self.map.insert(key, (value, self.tick));
        if self.map.len() > self.cap {
            if let Some(oldest) = self.map.iter().min_by_key(|(_, (_, t))| *t).map(|(k, _)| k.clone()) {
                self.map.remove(&oldest);
            }
        }
    }

    fn clear(&mut self) {
        self.map.clear();
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
enum FailureKey {
    Probe(MediaKey),
    Still(StillKey),
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum SlotState {
    Empty,
    Own,
    Alias(u32),
}

struct Shown {
    data_url: String,
    time_ms: Option<u64>,
    frame: Option<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum SeqMode {
    InProcess,
    Ffmpeg,
}

struct Seq {
    folder: PathBuf,
    frames: Vec<SequenceFrame>,
    mode: SeqMode,
    cancelled: Arc<AtomicBool>,
    /// The other frames are queued once the first one gave the letterbox size
    rest_started: bool,
}

/// The one scrub in progress
struct Scrub {
    id: String,
    emit: Emitter,
    media: MediaKey,
    max_side: u32,
    indices: Option<Vec<u32>>,
    count: u32,
    slots: [SlotState; SLOTS],
    emitted: [bool; SLOTS],
    shown: Vec<Option<Shown>>,
    queue: VecDeque<Task>,
    /// Processes and decodes whose results are still to come
    busy: u32,
    meta_sent: bool,
    probe: Option<Arc<Probe>>,
    /// Video frame size once the probe is known
    out: Option<(u32, u32)>,
    /// Source size from an image header (sequences)
    src_dims: Option<(u32, u32)>,
    /// Size of the first frame delivered, and of slot 0's (the sequence letterbox)
    first_dims: Option<(u32, u32)>,
    box0: Option<(u32, u32)>,
    seq: Option<Seq>,
}

impl Scrub {
    fn new(id: String, emit: Emitter, media: MediaKey, max_side: u32, indices: Option<Vec<u32>>) -> Self {
        Scrub {
            id,
            emit,
            media,
            max_side,
            indices,
            count: SLOTS as u32,
            slots: [SlotState::Empty; SLOTS],
            emitted: [false; SLOTS],
            shown: (0..SLOTS).map(|_| None).collect(),
            queue: VecDeque::new(),
            busy: 0,
            meta_sent: false,
            probe: None,
            out: None,
            src_dims: None,
            first_dims: None,
            box0: None,
            seq: None,
        }
    }

    fn wanted(&self, slot: u32) -> bool {
        slot < self.count && (slot as usize) < SLOTS && self.indices.as_ref().is_none_or(|v| v.contains(&slot))
    }

    fn finished(&self) -> bool {
        self.busy == 0 && self.queue.is_empty()
    }

    fn send_meta(&mut self, width: u32, height: u32, duration_ms: Option<u64>, fps: Option<f64>) {
        if self.meta_sent {
            return;
        }
        self.meta_sent = true;
        (self.emit)(ScrubEvent::Meta(ScrubMeta { id: self.id.clone(), width, height, duration_ms, fps, count: self.count }));
    }

    fn apply_probe(&mut self, probe: Arc<Probe>) {
        self.count = probe.count();
        self.out = Some(fit_even(probe.width, probe.height, self.max_side));
        self.send_meta(probe.width, probe.height, probe.duration.and_then(secs_ms), probe.fps);
        self.probe = Some(probe);
    }

    fn emit_slot(&mut self, slot: u32, src: u32) {
        if !self.wanted(slot) {
            return;
        }
        let Some(shown) = self.shown.get(src as usize).and_then(|s| s.as_ref()) else { return };
        let frame = ScrubFrame {
            id: self.id.clone(),
            slot,
            data_url: shown.data_url.clone(),
            time_ms: shown.time_ms,
            frame: shown.frame,
        };
        (self.emit)(ScrubEvent::Frame(frame));
        self.emitted[slot as usize] = true;
    }

    fn set_alias(&mut self, slot: u32, src: u32) {
        if (slot as usize) >= SLOTS || slot == src {
            return;
        }
        self.slots[slot as usize] = SlotState::Alias(src);
        self.emit_slot(slot, src);
    }

    /// A frame arrived: its owner slot, the slots listed with it, and earlier aliases of the owner
    fn deliver(&mut self, out: &OutSpec, data_url: String, dims: Option<(u32, u32)>) {
        let Some(&rep) = out.slots.first() else { return };
        if rep as usize >= SLOTS {
            return;
        }
        if rep == 0 {
            self.box0 = dims;
        }
        if self.first_dims.is_none() {
            self.first_dims = dims;
        }
        if self.seq.is_some() && !self.meta_sent {
            if let Some((w, h)) = self.src_dims.or(dims) {
                self.send_meta(w, h, None, None);
            }
        }
        self.shown[rep as usize] = Some(Shown { data_url, time_ms: out.time_ms, frame: out.frame });
        self.slots[rep as usize] = SlotState::Own;
        self.emit_slot(rep, rep);
        for &slot in &out.slots[1..] {
            if (slot as usize) < SLOTS {
                self.slots[slot as usize] = SlotState::Alias(rep);
                self.emit_slot(slot, rep);
            }
        }
        for slot in 0..SLOTS as u32 {
            if self.slots[slot as usize] == SlotState::Alias(rep) && !self.emitted[slot as usize] {
                self.emit_slot(slot, rep);
            }
        }
    }

    fn done(&mut self) {
        if !self.meta_sent {
            if let Some((w, h)) = self.first_dims {
                self.send_meta(w, h, None, None);
            }
        }
        let failed = (0..self.count.min(SLOTS as u32)).filter(|&s| self.wanted(s) && !self.emitted[s as usize]).collect();
        let aliases = (0..SLOTS as u32)
            .filter_map(|s| match self.slots[s as usize] {
                SlotState::Alias(src) if self.emitted[s as usize] && self.wanted(s) => Some((s, src)),
                _ => None,
            })
            .collect();
        (self.emit)(ScrubEvent::Done(ScrubDone { id: self.id.clone(), failed, aliases }));
    }
}

struct Scheduler {
    tx: mpsc::Sender<Cmd>,
    tools: Option<Tools>,
    limits: Limits,
    procs: HashMap<u64, Proc>,
    next_id: u64,
    stills: StillStack,
    current: Option<Scrub>,
    probes: Lru<MediaKey, Arc<Probe>>,
    failures: Lru<FailureKey, ()>,
    last_refresh: Option<Instant>,
    killed_total: u64,
    /// The app's scheduler (not a test instance): keeps TOOLS_AVAILABLE in step
    global: bool,
    #[cfg(test)]
    peak_procs: u32,
    #[cfg(test)]
    peak_proc_bytes: u64,
}

impl Scheduler {
    fn new(tx: mpsc::Sender<Cmd>, tools: Option<Tools>, limits: Limits) -> Self {
        Scheduler {
            tx,
            tools,
            limits,
            procs: HashMap::new(),
            next_id: 1,
            stills: StillStack::default(),
            current: None,
            probes: Lru::new(PROBE_CACHE),
            failures: Lru::new(FAILURE_CACHE),
            last_refresh: None,
            killed_total: 0,
            global: false,
            #[cfg(test)]
            peak_procs: 0,
            #[cfg(test)]
            peak_proc_bytes: 0,
        }
    }

    fn set_tools(&mut self, tools: Option<Tools>) {
        if self.global {
            TOOLS_AVAILABLE.store(tools.is_some(), Ordering::Relaxed);
        }
        self.tools = tools;
    }

    fn run(&mut self, rx: mpsc::Receiver<Cmd>) {
        loop {
            let now = Instant::now();
            let cmd = match self.next_deadline(now) {
                None => match rx.recv() {
                    Ok(cmd) => Some(cmd),
                    Err(_) => break,
                },
                Some(at) => match rx.recv_timeout(at.saturating_duration_since(now)) {
                    Ok(cmd) => Some(cmd),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => break,
                },
            };
            if let Some(cmd) = cmd {
                self.handle(cmd);
            }
            self.tick(Instant::now());
            self.pump();
        }
    }

    fn handle(&mut self, cmd: Cmd) {
        match cmd {
            Cmd::Still { key, reply } => self.on_still(key, reply),
            Cmd::Scrub { req, path, emit } => self.on_scrub(req, path, emit),
            Cmd::Cancel(id) => {
                if self.current.as_ref().is_some_and(|s| s.id == id) {
                    self.drop_current();
                }
            }
            Cmd::Clear => {
                self.probes.clear();
                self.failures.clear();
            }
            Cmd::Tools(tools) => {
                self.set_tools(tools);
                if self.tools.is_none() {
                    for reply in self.stills.drain() {
                        reply(Err(NO_FFMPEG.to_string()));
                    }
                }
            }
            Cmd::Proc(id, msg) => match msg {
                ProcMsg::Frame(jpeg) => self.on_frame(id, jpeg),
                ProcMsg::Output(bytes) => match self.procs.get_mut(&id).map(|p| &mut p.owner) {
                    Some(Owner::Still { output, .. }) | Some(Owner::Scrub { output, .. }) => *output = bytes,
                    _ => {}
                },
                ProcMsg::Dims(w, h) => {
                    let owner = match self.procs.get(&id).map(|p| &p.owner) {
                        Some(Owner::Scrub { id, .. }) => id.clone(),
                        _ => return,
                    };
                    if let Some(s) = self.current.as_mut().filter(|s| s.id == owner) {
                        s.src_dims.get_or_insert((w, h));
                    }
                }
                ProcMsg::End { ok } => self.on_end(id, ok),
            },
            Cmd::Decoded { id, slot, image } => self.on_decoded(id, slot, image),
            #[cfg(test)]
            Cmd::Inspect(f) => f(self),
        }
    }

    fn usage(&self) -> Usage {
        let mut u = Usage::default();
        for p in self.procs.values() {
            u.procs += 1;
            u.slots += p.cost.slots;
            u.mb += p.cost.mb;
            if p.thumb {
                u.thumb_slots += p.cost.slots;
            }
        }
        u
    }

    fn next_deadline(&self, now: Instant) -> Option<Instant> {
        self.procs
            .values()
            .map(|p| match p.ended {
                Some(_) => now + REAP_POLL,
                None if !p.killed => p.deadline,
                None => now + Duration::from_secs(1),
            })
            .min()
    }

    /// Timeouts, and reaping processes whose stdout already closed
    fn tick(&mut self, now: Instant) {
        let ids: Vec<u64> = self.procs.keys().copied().collect();
        for id in ids {
            let Some(p) = self.procs.get(&id) else { continue };
            match p.ended {
                Some(at) => {
                    if !self.try_reap(id) && now.saturating_duration_since(at) > REAP_GRACE {
                        if let Some(p) = self.procs.get_mut(&id) {
                            if p.kill() {
                                self.killed_total += 1;
                            }
                        }
                    }
                }
                None => {
                    if !p.killed && now >= p.deadline {
                        if let Some(p) = self.procs.get_mut(&id) {
                            if p.kill() {
                                self.killed_total += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    /// Frees the process' slot once it has exited (stdout already closed)
    fn try_reap(&mut self, id: u64) -> bool {
        let Some(p) = self.procs.get_mut(&id) else { return true };
        if p.ended.is_none() {
            return false;
        }
        let exited = match p.child.as_mut() {
            Some(child) => !matches!(child.try_wait(), Ok(None)),
            None => true,
        };
        if exited {
            #[cfg(all(test, windows))]
            if let Some(peak) = p.job.as_ref().and_then(|j| j.peak_memory()) {
                self.peak_proc_bytes = self.peak_proc_bytes.max(peak);
            }
            self.procs.remove(&id);
        }
        exited
    }

    /// Start whatever fits: scrub first, then row thumbnails (at most THUMB_SLOTS)
    fn pump(&mut self) {
        loop {
            let usage = self.usage();
            let Some(cost) = self.current.as_ref().and_then(|s| s.queue.front()).map(|t| t.cost) else { break };
            if !fits(usage, cost, &self.limits) {
                // Thumbnails wait too: they'd take the room the scrub needs next
                return;
            }
            let Some((sid, task)) = self.current.as_mut().and_then(|s| s.queue.pop_front().map(|t| (s.id.clone(), t))) else { break };
            let owner = Owner::Scrub { id: sid.clone(), work: task.work, received: 0, output: Vec::new() };
            match self.launch(task.exe, &task.args, task.read, task.cost, false, task.timeout, owner) {
                Ok(()) => {
                    if let Some(s) = self.current.as_mut() {
                        s.busy += 1;
                    }
                }
                Err((Owner::Scrub { work, .. }, _)) => self.finish_scrub_work(&sid, work, 0, Vec::new(), false, false),
                Err(_) => {}
            }
        }
        if self.tools.is_none() {
            for reply in self.stills.drain() {
                reply(Err(NO_FFMPEG.to_string()));
            }
            return;
        }
        while !self.stills.is_empty() {
            let usage = self.usage();
            let cost = Cost { mb: UNKNOWN_PROC_MB, slots: 1 };
            if usage.thumb_slots + cost.slots > self.limits.thumb_slots || !fits(usage, cost, &self.limits) {
                break;
            }
            let Some((key, waiters)) = self.stills.pop() else { break };
            let args = still_args(&key);
            let owner = Owner::Still { key, waiters, output: Vec::new() };
            if let Err((Owner::Still { waiters, .. }, not_found)) =
                self.launch(Exe::Ffmpeg, &args, ReadMode::Collect, cost, true, PROC_TIMEOUT, owner)
            {
                let error = if not_found { NO_FFMPEG } else { BUSY };
                for reply in waiters {
                    reply(Err(error.to_string()));
                }
            }
        }
    }

    /// Spawn a process with its job object and stdout reader. On failure the owner comes back
    /// (with true when the exe is gone: a new search is started)
    #[allow(clippy::too_many_arguments)]
    fn launch(&mut self, exe: Exe, args: &[OsString], read: ReadMode, cost: Cost, thumb: bool, timeout: Duration, owner: Owner) -> Result<(), (Owner, bool)> {
        let Some(tools) = self.tools.as_ref() else { return Err((owner, true)) };
        let program = match exe {
            Exe::Ffmpeg => tools.ffmpeg.clone(),
            Exe::Ffprobe => tools.ffprobe.clone(),
        };
        let id = self.next_id;
        self.next_id += 1;
        match spawn_process(&program, args, read, id, self.tx.clone()) {
            Ok((child, job)) => {
                let deadline = Instant::now() + timeout;
                self.procs.insert(id, Proc { child: Some(child), job, cost, thumb, owner, deadline, ended: None, killed: false });
                #[cfg(test)]
                {
                    self.peak_procs = self.peak_procs.max(self.procs.len() as u32);
                }
                Ok(())
            }
            Err(e) => {
                let not_found = e.kind() == std::io::ErrorKind::NotFound;
                if not_found {
                    self.refresh_tools();
                }
                Err((owner, not_found))
            }
        }
    }

    fn refresh_tools(&mut self) {
        if self.last_refresh.is_some_and(|t| t.elapsed() < REFRESH_INTERVAL) {
            return;
        }
        self.last_refresh = Some(Instant::now());
        if let Some(app) = APP.get() {
            crate::media_tools::refresh_in_background(app);
        }
    }

    fn on_still(&mut self, key: StillKey, reply: StillReply) {
        if self.tools.is_none() {
            reply(Err(NO_FFMPEG.to_string()));
            return;
        }
        if self.failures.contains(&FailureKey::Still(key.clone())) {
            reply(Ok(None));
            return;
        }
        for p in self.procs.values_mut() {
            if let Owner::Still { key: running, waiters, .. } = &mut p.owner {
                if *running == key && p.ended.is_none() {
                    waiters.push(reply);
                    return;
                }
            }
        }
        for dropped in self.stills.push(key, reply) {
            dropped(Err(BUSY.to_string()));
        }
    }

    fn drop_current(&mut self) {
        let Some(s) = self.current.take() else { return };
        if let Some(seq) = &s.seq {
            seq.cancelled.store(true, Ordering::Relaxed);
        }
        for p in self.procs.values_mut() {
            if matches!(&p.owner, Owner::Scrub { id, .. } if *id == s.id) && p.kill() {
                self.killed_total += 1;
            }
        }
    }

    fn on_scrub(&mut self, req: ScrubRequest, path: Option<PathBuf>, emit: Emitter) {
        self.drop_current();
        let media = MediaKey { path: path.clone().unwrap_or_default(), modified: req.modified, size: req.size };
        let mut s = Scrub::new(req.id, emit, media, req.max_side.clamp(16, 1024), req.indices);
        if let Some(path) = path {
            match req.kind {
                ScrubKind::Video => self.start_video(&mut s),
                ScrubKind::Sequence => self.start_sequence(&mut s, path, req.frames),
            }
        }
        self.keep_or_finish(s);
    }

    fn keep_or_finish(&mut self, mut s: Scrub) {
        if s.finished() {
            s.done();
        } else {
            self.current = Some(s);
        }
    }

    // --- video ---

    fn start_video(&mut self, s: &mut Scrub) {
        if self.tools.is_none() {
            return;
        }
        let probe = self.probes.get(&s.media).cloned();
        if let Some(probe) = probe {
            s.apply_probe(probe.clone());
            s.queue.push_back(slot0_task(s));
            match &probe.keys {
                Some(keys) => {
                    let keys = keys.clone();
                    self.plan_tasks(s, &keys);
                }
                None if s.count > 1 => s.queue.push_back(keys_task(s, &probe)),
                None => {}
            }
            return;
        }
        s.queue.push_back(slot0_task(s));
        if self.failures.contains(&FailureKey::Probe(s.media.clone())) {
            s.count = 1;
        } else {
            s.queue.push_back(probe_task(&s.media.path));
        }
    }

    fn on_probe(&mut self, s: &mut Scrub, probe: Option<Probe>, cache: bool) {
        match probe {
            Some(probe) => {
                let probe = Arc::new(probe);
                if cache {
                    self.probes.insert(s.media.clone(), probe.clone());
                }
                s.apply_probe(probe.clone());
                if s.count > 1 {
                    s.queue.push_back(keys_task(s, &probe));
                }
            }
            None => {
                if cache {
                    self.failures.insert(FailureKey::Probe(s.media.clone()), ());
                }
                s.count = 1;
            }
        }
    }

    fn on_keys(&mut self, s: &mut Scrub, keys: Option<Vec<Option<f64>>>) {
        let Some(probe) = s.probe.clone() else { return };
        let keys = match keys {
            Some(keys) => {
                let updated = Arc::new(Probe { keys: Some(keys.clone()), ..(*probe).clone() });
                self.probes.insert(s.media.clone(), updated.clone());
                s.probe = Some(updated);
                keys
            }
            None => vec![None; s.count as usize],
        };
        self.plan_tasks(s, &keys);
    }

    /// Queue the frame processes for the slots (slot 0 is already on its way)
    fn plan_tasks(&mut self, s: &mut Scrub, keys: &[Option<f64>]) {
        let Some(probe) = s.probe.clone() else { return };
        let Some(duration) = probe.duration else { return };
        let (w, h) = s.out.unwrap_or_else(|| fit_even(probe.width, probe.height, s.max_side));
        let vf = exact_vf(w, h);
        let mb = proc_mb(probe.coded.0, probe.coded.1, &probe.pix_fmt);
        let fps = probe.fps.unwrap_or(25.0);
        let last = s.count.saturating_sub(1);
        let path = s.media.path.clone();
        let tail = |at: f64, retry_at: Option<f64>, threads: u32| -> Task {
            let retry = retry_at.map(|r| Box::new(tail_task(&path, &vf, r, None, threads, mb, last, duration, fps)));
            tail_task(&path, &vf, at, retry, threads, mb, last, duration, fps)
        };
        match plan_video(s.count, keys, duration, probe.fps, probe.frames, probe.coded, self.limits.select_max_px) {
            VideoPlan::Select { picks } => {
                if !picks.iter().any(|&(slot, _)| s.wanted(slot)) {
                    return;
                }
                let mut picks = picks;
                picks.sort_by_key(|&(_, n)| n);
                let select = picks.iter().map(|(_, n)| format!("eq(n\\,{})", n)).collect::<Vec<_>>().join("+");
                let outputs = picks
                    .iter()
                    .map(|&(slot, n)| OutSpec { slots: vec![slot], time_ms: secs_ms(n as f64 / fps), frame: None })
                    .collect::<Vec<_>>();
                // The last pick is the last frame; if the frame count was an overestimate it never comes
                let retry = picks.iter().any(|&(slot, _)| slot == last).then(|| {
                    let fd = 1.0 / fps;
                    Box::new(tail((duration - 1.5 * fd).max(0.0), Some((duration - 3.0 * fd).max(0.0)), 1))
                });
                s.queue.push_back(Task {
                    exe: Exe::Ffmpeg,
                    args: ffmpeg_args(&[], &s.media.path, &format!("select={},{}", select, vf), picks.len(), 4, Codec::Jpeg),
                    cost: Cost { mb: mb * 3, slots: 4 },
                    read: ReadMode::Jpeg { header: None },
                    timeout: PROC_TIMEOUT,
                    work: Work::Frames { outputs, retry },
                });
            }
            VideoPlan::Keys { slot0_aliases, groups, tail: tail_plan } => {
                for slot in slot0_aliases {
                    s.set_alias(slot, 0);
                }
                let tail_job = tail_plan.filter(|t| s.wanted(t.slot)).map(|t| (t.long, tail(t.at, Some(t.retry), if t.long { 4 } else { 1 })));
                let mut long_tail = None;
                if let Some((long, task)) = tail_job {
                    if long {
                        long_tail = Some(task);
                    } else {
                        s.queue.push_back(task);
                    }
                }
                for g in groups {
                    if !g.slots.iter().any(|&slot| s.wanted(slot)) {
                        continue;
                    }
                    let pre = ["-noaccurate_seek", "-skip_frame", "nokey", "-ss", &ss(g.seek)].map(String::from);
                    let time_ms = secs_ms(g.key.unwrap_or(g.seek));
                    s.queue.push_back(Task {
                        exe: Exe::Ffmpeg,
                        args: ffmpeg_args(&pre, &s.media.path, &vf, 1, 1, Codec::Jpeg),
                        cost: Cost { mb, slots: 1 },
                        read: ReadMode::Jpeg { header: None },
                        timeout: PROC_TIMEOUT,
                        work: Work::Frames { outputs: vec![OutSpec { slots: g.slots, time_ms, frame: None }], retry: None },
                    });
                }
                if let Some(task) = long_tail {
                    s.queue.push_back(task);
                }
            }
        }
    }

    // --- sequences ---

    fn start_sequence(&mut self, s: &mut Scrub, folder: PathBuf, frames: Vec<SequenceFrame>) {
        let frames: Vec<SequenceFrame> = frames.into_iter().take(SLOTS).collect();
        s.count = frames.len() as u32;
        let Some(first) = frames.first() else { return };
        let ext = Path::new(&first.name).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
        let mode = if SEQ_IN_PROCESS.contains(&ext.as_str()) {
            SeqMode::InProcess
        } else if SEQ_FFMPEG.contains(&ext.as_str()) && self.tools.is_some() {
            SeqMode::Ffmpeg
        } else {
            return;
        };
        s.seq = Some(Seq { folder, frames, mode, cancelled: Arc::new(AtomicBool::new(false)), rest_started: false });
        // The first frame alone: its size is the letterbox of the others
        self.dispatch_frame(s, 0, None);
        if s.finished() {
            self.start_rest(s);
        }
    }

    fn dispatch_frame(&mut self, s: &mut Scrub, slot: u32, fit_box: Option<(u32, u32)>) {
        let Some(seq) = s.seq.as_ref() else { return };
        let Some(frame) = seq.frames.get(slot as usize) else { return };
        let Some(path) = frame_path(&seq.folder, &frame.name) else { return };
        let (mode, cancelled, number) = (seq.mode, seq.cancelled.clone(), frame.frame);
        match mode {
            SeqMode::InProcess => {
                s.busy += 1;
                let (tx, id) = (self.tx.clone(), s.id.clone());
                crate::image_thumbnail::submit_scrub(ScrubJob {
                    path,
                    max_side: s.max_side,
                    fit_box,
                    cancelled,
                    done: Box::new(move |image| {
                        let _ = tx.send(Cmd::Decoded { id, slot, image });
                    }),
                });
            }
            SeqMode::Ffmpeg => {
                let vf = image_vf(s.max_side, fit_box);
                s.queue.push_back(Task {
                    exe: Exe::Ffmpeg,
                    args: ffmpeg_args(&["-f", "image2", "-pattern_type", "none"].map(String::from), &path, &vf, 1, 1, Codec::Jpeg),
                    cost: Cost { mb: UNKNOWN_PROC_MB, slots: 1 },
                    read: ReadMode::Jpeg { header: (slot == 0).then(|| path.clone()) },
                    timeout: PROC_TIMEOUT,
                    work: Work::Frames { outputs: vec![OutSpec { slots: vec![slot], time_ms: None, frame: Some(number) }], retry: None },
                });
            }
        }
    }

    fn start_rest(&mut self, s: &mut Scrub) {
        match s.seq.as_mut() {
            Some(seq) if !seq.rest_started => seq.rest_started = true,
            _ => return,
        }
        let fit_box = s.box0;
        for slot in slot_order(s.count) {
            if slot != 0 && s.wanted(slot) {
                self.dispatch_frame(s, slot, fit_box);
            }
        }
    }

    fn on_decoded(&mut self, id: String, slot: u32, image: Option<ScrubImage>) {
        let Some(mut s) = self.current.take() else { return };
        if s.id != id {
            self.current = Some(s);
            return;
        }
        s.busy = s.busy.saturating_sub(1);
        if let Some(image) = image {
            s.src_dims.get_or_insert((image.src_width, image.src_height));
            let frame = s.seq.as_ref().and_then(|q| q.frames.get(slot as usize)).map(|f| f.frame);
            let out = OutSpec { slots: vec![slot], time_ms: None, frame };
            s.deliver(&out, image.data_url, Some((image.width, image.height)));
        }
        if slot == 0 {
            self.start_rest(&mut s);
        }
        self.keep_or_finish(s);
    }

    // --- process events ---

    fn on_frame(&mut self, id: u64, jpeg: Vec<u8>) {
        let Some(p) = self.procs.get_mut(&id) else { return };
        let Owner::Scrub { id: sid, work: Work::Frames { outputs, .. }, received, .. } = &mut p.owner else { return };
        let Some(out) = outputs.get(*received).cloned() else { return };
        *received += 1;
        let sid = sid.clone();
        if let Some(s) = self.current.as_mut().filter(|s| s.id == sid) {
            s.deliver(&out, jpeg_data_url(&jpeg), jpeg_size(&jpeg));
        }
    }

    fn on_end(&mut self, id: u64, ok: bool) {
        let Some(p) = self.procs.get_mut(&id) else { return };
        if p.ended.is_some() {
            return;
        }
        p.ended = Some(Instant::now());
        let killed = p.killed;
        let owner = std::mem::replace(&mut p.owner, Owner::Done);
        self.try_reap(id);
        match owner {
            Owner::Still { key, waiters, output } => {
                let result = if killed {
                    Err(BUSY.to_string())
                } else if ok && !output.is_empty() {
                    Ok(Some(output))
                } else {
                    self.failures.insert(FailureKey::Still(key), ());
                    Ok(None)
                };
                for reply in waiters {
                    reply(result.clone());
                }
            }
            Owner::Scrub { id: sid, work, received, output } => {
                let output = if ok && !killed { output } else { Vec::new() };
                self.finish_scrub_work(&sid, work, received, output, killed, true);
            }
            Owner::Done => {}
        }
    }

    /// A process of the scrub ended (or couldn't start: `spawned` false)
    fn finish_scrub_work(&mut self, sid: &str, work: Work, received: usize, output: Vec<u8>, killed: bool, spawned: bool) {
        let Some(mut s) = self.current.take() else { return };
        if s.id != sid {
            self.current = Some(s);
            return;
        }
        if spawned {
            s.busy = s.busy.saturating_sub(1);
        }
        let cache = spawned && !killed;
        match work {
            Work::Probe => {
                let probe = if cache { parse_probe(&output) } else { None };
                self.on_probe(&mut s, probe, cache);
            }
            Work::Keys => {
                let keys = s.probe.as_ref().and_then(|p| parse_keys(&output, s.count as usize, p.start));
                self.on_keys(&mut s, keys);
            }
            Work::Frames { outputs, retry } => {
                if received < outputs.len() && spawned && !killed {
                    if let Some(retry) = retry {
                        s.queue.push_front(*retry);
                    }
                }
                if outputs.iter().any(|o| o.slots.contains(&0)) {
                    self.start_rest(&mut s);
                }
            }
        }
        self.keep_or_finish(s);
    }
}

// ---------------------------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Copy)]
enum Codec {
    Jpeg,
    Png,
}

fn input_arg(path: &Path) -> OsString {
    let mut arg = OsString::from("file:");
    arg.push(path.as_os_str());
    arg
}

/// `-ss` and other times: Rust formatting, never the locale
fn ss(seconds: f64) -> String {
    format!("{:.3}", if seconds.is_finite() && seconds > 0.0 { seconds } else { 0.0 })
}

fn secs_ms(seconds: f64) -> Option<u64> {
    Duration::try_from_secs_f64(seconds).ok().map(|d| d.as_millis() as u64)
}

fn ffmpeg_args(pre: &[String], path: &Path, vf: &str, frames: usize, threads: u32, codec: Codec) -> Vec<OsString> {
    let threads = threads.to_string();
    let mut args: Vec<OsString> = ["-threads", &threads, "-nostdin", "-hide_banner", "-v", "error", "-nostats"]
        .iter().map(OsString::from).collect();
    args.extend(pre.iter().map(OsString::from));
    args.push("-i".into());
    args.push(input_arg(path));
    let frames = frames.max(1).to_string();
    let output = ["-map", "0:V:0", "-threads", &threads, "-filter_threads", "1", "-vf", vf, "-fps_mode", "passthrough", "-frames:v", &frames];
    args.extend(output.iter().map(OsString::from));
    let codec: &[&str] = match codec {
        Codec::Jpeg => &["-c:v", "mjpeg", "-q:v", "5"],
        Codec::Png => &["-c:v", "png"],
    };
    args.extend(codec.iter().map(OsString::from));
    args.extend(["-flags", "+bitexact", "-f", "image2pipe", "-"].iter().map(OsString::from));
    args
}

fn still_args(key: &StillKey) -> Vec<OsString> {
    match key.kind {
        StillKind::VideoThumb => ffmpeg_args(&["-ss", "0"].map(String::from), &key.media.path, THUMB_VF, 1, 1, Codec::Jpeg),
        StillKind::Png(side) => {
            let vf = format!("scale='min({s},iw)':'min({s},ih)':force_original_aspect_ratio=decrease,format=rgba", s = side.clamp(16, 1024));
            ffmpeg_args(&[], &key.media.path, &vf, 1, 1, Codec::Png)
        }
    }
}

/// Scrub frame of a known size
fn exact_vf(width: u32, height: u32) -> String {
    format!("scale={}:{}:flags=bilinear:out_range=full,setsar=1,format=yuvj420p", width, height)
}

/// Scrub frame before the size is known: SAR fixed, fit into `max_side`, never enlarged
fn fit_vf(max_side: u32) -> String {
    format!(
        "scale=iw*sar:ih,scale='min({m},iw)':'min({m},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=bilinear:out_range=full,setsar=1,format=yuvj420p",
        m = max_side
    )
}

/// Image (sequence frame) over #0f0f0f: fit `max_side`, or letterboxed into `fit_box`
fn image_vf(max_side: u32, fit_box: Option<(u32, u32)>) -> String {
    let size = match fit_box {
        Some((w, h)) => format!(
            "scale={w}:{h}:force_original_aspect_ratio=decrease:flags=bilinear,format=rgba,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black@0"
        ),
        None => format!(
            "scale='min({m},iw)':'min({m},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=bilinear,format=rgba",
            m = max_side
        ),
    };
    format!("{size},split[fg][s];[s]drawbox=c=0x0f0f0f@1:replace=1:t=fill[bg];[bg][fg]overlay=format=auto,scale=out_range=full,setsar=1,format=yuvj420p")
}

fn slot0_task(s: &Scrub) -> Task {
    let (vf, mb) = match (&s.probe, s.out) {
        (Some(p), Some((w, h))) => (exact_vf(w, h), proc_mb(p.coded.0, p.coded.1, &p.pix_fmt)),
        _ => (fit_vf(s.max_side), UNKNOWN_PROC_MB),
    };
    Task {
        exe: Exe::Ffmpeg,
        args: ffmpeg_args(&["-ss", "0"].map(String::from), &s.media.path, &vf, 1, 1, Codec::Jpeg),
        cost: Cost { mb, slots: 1 },
        read: ReadMode::Jpeg { header: None },
        timeout: PROC_TIMEOUT,
        work: Work::Frames { outputs: vec![OutSpec { slots: vec![0], time_ms: Some(0), frame: None }], retry: None },
    }
}

const PROBE_ENTRIES: &str = "stream=index,codec_name,width,height,sample_aspect_ratio,avg_frame_rate,r_frame_rate,duration,nb_frames,start_time,pix_fmt:stream_disposition=attached_pic:stream_side_data=rotation:stream_tags=rotate:format=duration,start_time";

fn ffprobe_args(extra: &[&str], path: &Path) -> Vec<OsString> {
    let mut args: Vec<OsString> = ["-v", "error", "-hide_banner", "-threads", "1", "-select_streams", "V:0"]
        .iter().map(OsString::from).collect();
    args.extend(extra.iter().map(OsString::from));
    args.extend(["-of", "json"].iter().map(OsString::from));
    args.push(input_arg(path));
    args
}

fn probe_task(path: &Path) -> Task {
    Task {
        exe: Exe::Ffprobe,
        args: ffprobe_args(&["-show_entries", PROBE_ENTRIES], path),
        cost: Cost { mb: MIN_PROC_MB, slots: 1 },
        read: ReadMode::Collect,
        timeout: PROBE_TIMEOUT,
        work: Work::Probe,
    }
}

/// One packet at each slot time: the keyframe that slot would land on
fn keys_task(s: &Scrub, probe: &Probe) -> Task {
    let duration = probe.duration.unwrap_or(0.0);
    let intervals = slot_times(duration, s.count)
        .iter()
        .map(|t| format!("{}%+#1", ss(probe.start + t)))
        .collect::<Vec<_>>()
        .join(",");
    Task {
        exe: Exe::Ffprobe,
        args: ffprobe_args(&["-read_intervals", &intervals, "-show_entries", "packet=pts_time,flags"], &s.media.path),
        cost: Cost { mb: MIN_PROC_MB, slots: 1 },
        read: ReadMode::Collect,
        timeout: PROBE_TIMEOUT,
        work: Work::Keys,
    }
}

/// Exact last frame: accurate seek a frame and a half before the end
#[allow(clippy::too_many_arguments)]
fn tail_task(path: &Path, vf: &str, at: f64, retry: Option<Box<Task>>, threads: u32, mb: u64, slot: u32, duration: f64, fps: f64) -> Task {
    let pre = ["-ss".to_string(), ss(at)];
    let threads = if threads >= 4 { 4 } else { 1 };
    Task {
        exe: Exe::Ffmpeg,
        args: ffmpeg_args(&pre, path, vf, 1, threads, Codec::Jpeg),
        cost: if threads == 4 { Cost { mb: mb * 3, slots: 4 } } else { Cost { mb, slots: 1 } },
        read: ReadMode::Jpeg { header: None },
        timeout: PROC_TIMEOUT,
        work: Work::Frames {
            outputs: vec![OutSpec { slots: vec![slot], time_ms: secs_ms(duration - 1.0 / fps), frame: None }],
            retry,
        },
    }
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn spawn_process(program: &Path, args: &[OsString], read: ReadMode, id: u64, tx: mpsc::Sender<Cmd>) -> std::io::Result<(Child, Option<job::Job>)> {
    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn()?;
    let job = job::Job::for_child(&child);
    let started = child.stdout.take().ok_or_else(|| std::io::Error::other("no stdout")).and_then(|stdout| {
        std::thread::Builder::new()
            .name("media-preview-read".into())
            .stack_size(READER_STACK)
            .spawn(move || read_output(stdout, read, id, tx))
    });
    if let Err(e) = started {
        drop(job);
        let _ = child.kill();
        let _ = child.wait();
        return Err(e);
    }
    Ok((child, job))
}

/// Reader thread: stdout → scheduler messages, then End
fn read_output(mut stdout: ChildStdout, read: ReadMode, id: u64, tx: mpsc::Sender<Cmd>) {
    let mut ok = true;
    let mut buf = vec![0u8; 32 * 1024];
    match read {
        ReadMode::Collect => {
            let mut all = Vec::new();
            loop {
                match stdout.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) if all.len() + n > MAX_PROC_BYTES => {
                        ok = false;
                        break;
                    }
                    Ok(n) => all.extend_from_slice(&buf[..n]),
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
                    Err(_) => {
                        ok = false;
                        break;
                    }
                }
            }
            let _ = tx.send(Cmd::Proc(id, ProcMsg::Output(all)));
        }
        ReadMode::Jpeg { header } => {
            if let Some((w, h)) = header.and_then(|p| crate::image_thumbnail::header_dimensions(&p)) {
                let _ = tx.send(Cmd::Proc(id, ProcMsg::Dims(w, h)));
            }
            let mut splitter = JpegSplitter::default();
            let mut frames = Vec::new();
            loop {
                match stdout.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let result = splitter.push(&buf[..n], &mut frames);
                        for frame in frames.drain(..) {
                            let _ = tx.send(Cmd::Proc(id, ProcMsg::Frame(frame)));
                        }
                        if result.is_err() {
                            ok = false;
                            break;
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
                    Err(_) => {
                        ok = false;
                        break;
                    }
                }
            }
        }
    }
    // Closing stdout makes a process still writing exit (broken pipe)
    drop(stdout);
    let _ = tx.send(Cmd::Proc(id, ProcMsg::End { ok }));
}

#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// Job object with KILL_ON_JOB_CLOSE: dropping it kills the process and everything it started
    pub struct Job(HANDLE);

    impl Job {
        pub fn for_child(child: &std::process::Child) -> Option<Job> {
            // SAFETY: plain Win32 calls on a handle we own; the struct outlives the call
            unsafe {
                let job = Job(CreateJobObjectW(None, PCWSTR::null()).ok()?);
                let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                SetInformationJobObject(
                    job.0,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const core::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
                .ok()?;
                AssignProcessToJobObject(job.0, HANDLE(child.as_raw_handle() as isize)).ok()?;
                Some(job)
            }
        }

        /// Peak private memory of any process in the job, bytes (timing tests)
        #[cfg(test)]
        pub fn peak_memory(&self) -> Option<u64> {
            use windows::Win32::System::JobObjects::QueryInformationJobObject;
            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            // SAFETY: the buffer is the struct the class asks for
            unsafe {
                QueryInformationJobObject(
                    self.0,
                    JobObjectExtendedLimitInformation,
                    &mut info as *mut _ as *mut core::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                    None,
                )
                .ok()?;
            }
            Some(info.PeakProcessMemoryUsed as u64)
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: the handle came from CreateJobObjectW and is closed once
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }

    // SAFETY: a job handle can be used and closed from any thread
    unsafe impl Send for Job {}
}

#[cfg(not(windows))]
mod job {
    pub struct Job;

    impl Job {
        pub fn for_child(_child: &std::process::Child) -> Option<Job> {
            None
        }
    }
}

// ---------------------------------------------------------------------------------------------
// JPEG stream
// ---------------------------------------------------------------------------------------------

/// Splits ffmpeg's image2pipe MJPEG output into frames: marker segments up to SOS, then
/// entropy-coded data until EOI (FF00 stuffing, FFD0–D7 restarts and FFFF fill skipped)
#[derive(Default)]
struct JpegSplitter {
    buf: Vec<u8>,
    pos: usize,
    started: bool,
    in_scan: bool,
    total: usize,
}

impl JpegSplitter {
    fn push(&mut self, data: &[u8], out: &mut Vec<Vec<u8>>) -> Result<(), &'static str> {
        self.total += data.len();
        if self.total > MAX_PROC_BYTES {
            return Err("output too large");
        }
        self.buf.extend_from_slice(data);
        loop {
            if self.buf.len() > MAX_FRAME_BYTES {
                return Err("frame too large");
            }
            if !self.started {
                if self.buf.len() < 2 {
                    return Ok(());
                }
                if self.buf[0] != 0xFF || self.buf[1] != 0xD8 {
                    return Err("not a JPEG stream");
                }
                self.started = true;
                self.in_scan = false;
                self.pos = 2;
            }
            if self.in_scan {
                let mut i = self.pos;
                let mut marker = None;
                while i + 1 < self.buf.len() {
                    if self.buf[i] != 0xFF {
                        i += 1;
                        continue;
                    }
                    match self.buf[i + 1] {
                        0x00 | 0xD0..=0xD7 => i += 2,
                        0xFF => i += 1,
                        _ => {
                            marker = Some(i);
                            break;
                        }
                    }
                }
                let Some(m) = marker else {
                    // Keep a trailing FF for the next read
                    self.pos = i;
                    return Ok(());
                };
                if self.buf[m + 1] == 0xD9 {
                    out.push(self.buf.drain(..m + 2).collect());
                    self.started = false;
                    self.pos = 0;
                    continue;
                }
                // Another segment (progressive JPEG): back to markers
                self.in_scan = false;
                self.pos = m;
                continue;
            }
            let p = self.pos;
            if p + 2 > self.buf.len() {
                return Ok(());
            }
            if self.buf[p] != 0xFF {
                return Err("bad JPEG marker");
            }
            match self.buf[p + 1] {
                0xFF => self.pos += 1,
                0x01 | 0xD0..=0xD7 => self.pos += 2,
                0xD8 => return Err("unexpected SOI"),
                0xD9 => {
                    out.push(self.buf.drain(..p + 2).collect());
                    self.started = false;
                    self.pos = 0;
                }
                marker => {
                    if p + 4 > self.buf.len() {
                        return Ok(());
                    }
                    let len = u16::from_be_bytes([self.buf[p + 2], self.buf[p + 3]]) as usize;
                    if len < 2 {
                        return Err("bad JPEG segment");
                    }
                    self.pos = p + 2 + len;
                    self.in_scan = marker == 0xDA;
                    if self.pos > self.buf.len() {
                        if self.in_scan {
                            // Scan header incomplete: resume in marker mode at the same SOS
                            self.in_scan = false;
                            self.pos = p;
                        }
                        return Ok(());
                    }
                }
            }
        }
    }
}

/// Width and height from a JPEG's SOF segment
fn jpeg_size(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 4 || b[0] != 0xFF || b[1] != 0xD8 {
        return None;
    }
    let mut p = 2;
    while p + 4 <= b.len() {
        if b[p] != 0xFF {
            return None;
        }
        let m = b[p + 1];
        if m == 0xFF {
            p += 1;
            continue;
        }
        if m == 0x01 || (0xD0..=0xD7).contains(&m) {
            p += 2;
            continue;
        }
        if m == 0xD9 || m == 0xDA {
            return None;
        }
        if (0xC0..=0xCF).contains(&m) && !matches!(m, 0xC4 | 0xC8 | 0xCC) {
            if p + 9 > b.len() {
                return None;
            }
            let h = u16::from_be_bytes([b[p + 5], b[p + 6]]) as u32;
            let w = u16::from_be_bytes([b[p + 7], b[p + 8]]) as u32;
            return (w > 0 && h > 0).then_some((w, h));
        }
        p += 2 + u16::from_be_bytes([b[p + 2], b[p + 3]]) as usize;
    }
    None
}

fn jpeg_data_url(jpeg: &[u8]) -> String {
    format!("data:image/jpeg;base64,{}", STANDARD.encode(jpeg))
}

// ---------------------------------------------------------------------------------------------
// Probe and planning (pure)
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
struct Probe {
    /// Display size: SAR and rotation applied
    width: u32,
    height: u32,
    coded: (u32, u32),
    pix_fmt: String,
    /// Stream start, s (read_intervals takes absolute times, -ss relative ones)
    start: f64,
    /// Length of the video stream, s
    duration: Option<f64>,
    fps: Option<f64>,
    frames: Option<u64>,
    /// Keyframe (relative, s) each slot lands on, once sampled
    keys: Option<Vec<Option<f64>>>,
}

impl Probe {
    /// Slots: 1 without a duration, the frame count when below 16
    fn count(&self) -> u32 {
        if self.duration.is_none() {
            return 1;
        }
        self.frames.map_or(SLOTS as u32, |n| n.clamp(1, SLOTS as u64) as u32)
    }
}

/// A field as text: ffprobe writes numbers or strings depending on the field and version
fn field(v: &Value, key: &str) -> Option<String> {
    match v.get(key)? {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Finite number; "N/A" and garbage give None
fn number(v: &Value, key: &str) -> Option<f64> {
    let value: f64 = field(v, key)?.trim().parse().ok()?;
    value.is_finite().then_some(value)
}

/// "num/den" or "num:den" with both parts positive
fn ratio(text: &str) -> Option<(f64, f64)> {
    let (n, d) = text.trim().split_once(['/', ':'])?;
    let (n, d): (f64, f64) = (n.trim().parse().ok()?, d.trim().parse().ok()?);
    (n.is_finite() && d.is_finite() && n > 0.0 && d > 0.0).then_some((n, d))
}

fn fps_of(text: &str) -> Option<f64> {
    let (n, d) = ratio(text)?;
    Some(n / d).filter(|f| (1.0..=240.0).contains(f))
}

/// Display size: SAR stretches the width, a quarter turn swaps the sides
fn display_size(width: u32, height: u32, sar: Option<(f64, f64)>, rotation: i64) -> (u32, u32) {
    let width = match sar {
        Some((n, d)) => ((width as f64 * n / d).round().clamp(1.0, 65_536.0)) as u32,
        None => width,
    };
    if rotation.rem_euclid(180) == 90 {
        (height, width)
    } else {
        (width, height)
    }
}

fn parse_probe(json: &[u8]) -> Option<Probe> {
    let root: Value = serde_json::from_slice(json).ok()?;
    let stream = root.get("streams")?.as_array()?.iter().find(|s| {
        s.get("disposition").and_then(|d| field(d, "attached_pic")).is_none_or(|a| a.trim() != "1")
    })?;
    let width = number(stream, "width").filter(|w| *w >= 1.0 && *w <= 65_536.0)? as u32;
    let height = number(stream, "height").filter(|h| *h >= 1.0 && *h <= 65_536.0)? as u32;
    let sar = field(stream, "sample_aspect_ratio").and_then(|s| ratio(&s));
    let rotation = stream
        .get("side_data_list")
        .and_then(|l| l.as_array())
        .and_then(|l| l.iter().find_map(|sd| number(sd, "rotation")))
        .or_else(|| stream.get("tags").and_then(|t| number(t, "rotate")))
        .map_or(0, |r| r.round() as i64);
    let (dw, dh) = display_size(width, height, sar, rotation);
    let fps = field(stream, "avg_frame_rate").and_then(|f| fps_of(&f))
        .or_else(|| field(stream, "r_frame_rate").and_then(|f| fps_of(&f)));
    let nb_frames = number(stream, "nb_frames").filter(|n| *n >= 1.0 && *n < 1e9).map(|n| n as u64);
    let positive = |d: f64| (d > 0.0 && d < 1e7).then_some(d);
    let format = root.get("format");
    let stream_start = number(stream, "start_time").unwrap_or(0.0);
    let duration = number(stream, "duration").and_then(positive)
        .or_else(|| Some(nb_frames? as f64 / fps?).and_then(positive))
        .or_else(|| {
            let format = format?;
            let format_start = number(format, "start_time").unwrap_or(stream_start);
            positive(number(format, "duration")? - (stream_start - format_start).max(0.0))
        });
    let frames = nb_frames.or_else(|| Some((duration? * fps?).round() as u64).filter(|n| *n >= 1));
    Some(Probe {
        width: dw,
        height: dh,
        coded: (width, height),
        pix_fmt: field(stream, "pix_fmt").unwrap_or_default(),
        start: stream_start,
        duration,
        fps,
        frames,
        keys: None,
    })
}

/// Keyframe per slot from `-read_intervals t%+#1` packets: one packet per interval, in order
fn parse_keys(json: &[u8], count: usize, start: f64) -> Option<Vec<Option<f64>>> {
    let root: Value = serde_json::from_slice(json).ok()?;
    let packets = root.get("packets")?.as_array()?;
    if packets.len() != count {
        return None;
    }
    Some(
        packets
            .iter()
            .map(|p| {
                let key = field(p, "flags").is_some_and(|f| f.starts_with('K'));
                key.then(|| number(p, "pts_time")).flatten().map(|t| (t - start).max(0.0))
            })
            .collect(),
    )
}

/// Slot times (relative, s): evenly from 0 to the end
fn slot_times(duration: f64, count: u32) -> Vec<f64> {
    if count <= 1 {
        return vec![0.0];
    }
    (0..count).map(|i| duration * i as f64 / (count - 1) as f64).collect()
}

/// Slots in coarse-to-fine order
fn slot_order(count: u32) -> Vec<u32> {
    let mut order: Vec<u32> = ORDER.iter().copied().filter(|&s| s < count).collect();
    let rest: Vec<u32> = (0..count.min(SLOTS as u32)).filter(|s| !order.contains(s)).collect();
    order.extend(rest);
    order
}

/// Slots that land on one keyframe: one process seeks to `seek` and feeds all of them
#[derive(Clone, Debug, PartialEq)]
struct Group {
    seek: f64,
    key: Option<f64>,
    /// Coarse-to-fine; the first owns the frame
    slots: Vec<u32>,
}

#[derive(Clone, Debug, PartialEq)]
struct Tail {
    slot: u32,
    at: f64,
    retry: f64,
    /// Last GOP longer than SHORT_TAIL_S: runs last, with 4 threads
    long: bool,
}

#[derive(Clone, Debug, PartialEq)]
enum VideoPlan {
    /// One process decodes everything and picks frames by number: (slot, frame number), slot 0 excluded
    Select { picks: Vec<(u32, u64)> },
    /// One process per unique keyframe, plus the exact last frame
    Keys { slot0_aliases: Vec<u32>, groups: Vec<Group>, tail: Option<Tail> },
}

fn plan_video(count: u32, keys: &[Option<f64>], duration: f64, fps: Option<f64>, frames: Option<u64>, coded: (u32, u32), select_max_px: f64) -> VideoPlan {
    let count = count.min(SLOTS as u32);
    if count <= 1 {
        return VideoPlan::Keys { slot0_aliases: Vec::new(), groups: Vec::new(), tail: None };
    }
    let key_of = |slot: u32| keys.get(slot as usize).copied().flatten();
    let same = |a: f64, b: f64| (a - b).abs() < 1e-3;
    let mut unique: Vec<f64> = Vec::new();
    let mut unknown = 0;
    for slot in 0..count {
        match key_of(slot) {
            Some(k) if unique.iter().any(|&u| same(u, k)) => {}
            Some(k) => unique.push(k),
            None => unknown += 1,
        }
    }
    if let Some(n) = frames.filter(|&n| n >= 1) {
        let decoded_px = n as f64 * coded.0 as f64 * coded.1 as f64;
        if count < SLOTS as u32 || (unique.len() + unknown < SELECT_MAX_UNIQUE && decoded_px <= select_max_px) {
            let picks = (1..count)
                .map(|i| {
                    let frame = if (count as u64) >= n { i as u64 } else { ((i as f64 * (n - 1) as f64) / (count - 1) as f64).round() as u64 };
                    (i, frame)
                })
                .collect();
            return VideoPlan::Select { picks };
        }
    }

    let times = slot_times(duration, count);
    let frame_s = 1.0 / fps.unwrap_or(25.0);
    let last = count - 1;
    let end = (duration - frame_s).max(0.0);
    let gap = key_of(last).map_or(f64::INFINITY, |k| end - k);
    let long = gap > SHORT_TAIL_S;
    let tail = Tail { slot: last, at: (duration - 1.5 * frame_s).max(0.0), retry: (duration - 3.0 * frame_s).max(0.0), long };

    let mut groups: Vec<Group> = Vec::new();
    for slot in slot_order(count) {
        if slot == last && !long {
            continue;
        }
        let key = key_of(slot);
        match key.and_then(|k| groups.iter_mut().find(|g| g.key.is_some_and(|gk| same(gk, k)))) {
            Some(group) => group.slots.push(slot),
            // Seek a hair past the keyframe: "{:.3}" never rounds below it
            None => groups.push(Group { seek: key.map_or(times[slot as usize], |k| k + 0.001), key, slots: vec![slot] }),
        }
    }
    // The exact last frame replaces slot 15 later: it must not own a frame others alias
    for group in groups.iter_mut() {
        if let Some(i) = group.slots.iter().position(|&s| s == last).filter(|_| group.slots.len() > 1) {
            let slot = group.slots.remove(i);
            group.slots.push(slot);
        }
    }
    let mut slot0_aliases = Vec::new();
    if let Some(i) = groups.iter().position(|g| g.slots.first() == Some(&0)) {
        slot0_aliases = groups.remove(i).slots.into_iter().skip(1).collect();
    }
    VideoPlan::Keys { slot0_aliases, groups, tail: Some(tail) }
}

/// A sequence frame's path: only a plain relative name inside the folder
fn frame_path(folder: &Path, name: &str) -> Option<PathBuf> {
    let rel = Path::new(name);
    if name.is_empty() || !rel.components().all(|c| matches!(c, Component::Normal(_))) {
        return None;
    }
    Some(folder.join(rel))
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::media_tools::ToolSource;

    // --- pure helpers ---

    fn test_jpeg(w: u32, h: u32, seed: u8) -> Vec<u8> {
        let img = image::RgbImage::from_fn(w, h, |x, y| image::Rgb([(x as u8).wrapping_mul(seed), (y as u8) ^ seed, 255]));
        let mut out = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 90).encode_image(&img).unwrap();
        out
    }

    #[test]
    fn jpeg_stream_splits_at_any_boundary() {
        let frames = [test_jpeg(64, 48, 3), test_jpeg(33, 17, 7), test_jpeg(128, 72, 255)];
        // Entropy data with stuffed FF00 bytes, so a split can land between FF and 00
        assert!(frames.iter().any(|f| f.windows(2).any(|w| w == [0xFF, 0x00])));
        let stream: Vec<u8> = frames.concat();
        for chunk in [1usize, 2, 3, 5, 7, 64, 1000, stream.len()] {
            let mut splitter = JpegSplitter::default();
            let mut out = Vec::new();
            for part in stream.chunks(chunk) {
                splitter.push(part, &mut out).unwrap();
            }
            assert_eq!(out, frames.to_vec(), "chunk {}", chunk);
        }
        // Every two-way split
        for cut in 0..stream.len() {
            let mut splitter = JpegSplitter::default();
            let mut out = Vec::new();
            splitter.push(&stream[..cut], &mut out).unwrap();
            splitter.push(&stream[cut..], &mut out).unwrap();
            assert_eq!(out.len(), 3, "cut {}", cut);
        }
        assert_eq!(jpeg_size(&frames[1]), Some((33, 17)));
        assert_eq!(jpeg_size(b"nope"), None);
    }

    #[test]
    fn jpeg_stream_trailing_ff_and_limits() {
        let frame = test_jpeg(40, 30, 9);
        // A truncated frame ending in FF: nothing emitted, no error, completes with the rest
        let cut = frame[..frame.len() - 2].iter().rposition(|&b| b == 0xFF).unwrap();
        let mut splitter = JpegSplitter::default();
        let mut out = Vec::new();
        splitter.push(&frame[..cut + 1], &mut out).unwrap();
        assert!(out.is_empty());
        splitter.push(&frame[cut + 1..], &mut out).unwrap();
        assert_eq!(out, vec![frame.clone()]);
        // Not a JPEG
        assert!(JpegSplitter::default().push(b"\x89PNG....", &mut out).is_err());
        // One frame over 512 KB (a chain of APP segments never reaching EOI)
        let mut huge = vec![0xFF, 0xD8];
        for _ in 0..10 {
            huge.extend_from_slice(&[0xFF, 0xE1, 0xFF, 0xFF]);
            huge.extend(std::iter::repeat_n(0u8, 0xFFFD));
        }
        assert!(JpegSplitter::default().push(&huge, &mut Vec::new()).is_err());
        // Process total over 8 MB
        let mut splitter = JpegSplitter::default();
        let mut total = Vec::new();
        let mut result = Ok(());
        for _ in 0..(MAX_PROC_BYTES / frame.len() + 2) {
            result = splitter.push(&frame, &mut total);
            if result.is_err() {
                break;
            }
        }
        assert!(result.is_err());
    }

    #[test]
    fn frame_size_math() {
        assert_eq!(fit_even(1920, 1080, 384), (384, 216));
        assert_eq!(fit_even(3840, 2160, 280), (280, 158));
        assert_eq!(fit_even(1080, 1920, 384), (216, 384));
        // Never enlarged; odd sources rounded to even
        assert_eq!(fit_even(101, 51, 384), (102, 52));
        assert_eq!(fit_even(1, 1, 384), (2, 2));
        assert_eq!(fit_even(0, 10, 384), (2, 2));
        // Anamorphic 1440x1080 with SAR 4:3 shows as 1920x1080
        assert_eq!(display_size(1440, 1080, Some((4.0, 3.0)), 0), (1920, 1080));
        assert_eq!(display_size(1920, 1080, None, -90), (1080, 1920));
        assert_eq!(display_size(1920, 1080, None, 270), (1080, 1920));
        assert_eq!(display_size(1920, 1080, None, 180), (1920, 1080));
    }

    #[test]
    fn times_and_order() {
        assert_eq!(slot_times(15.0, 16).iter().map(|t| t.round() as u32).collect::<Vec<_>>(), (0..16).collect::<Vec<_>>());
        assert_eq!(slot_times(3.0, 1), vec![0.0]);
        assert_eq!(slot_order(16), ORDER.to_vec());
        assert_eq!(slot_order(5), vec![0, 4, 2, 1, 3]);
        assert_eq!(ss(1.23456), "1.235");
        assert_eq!(ss(f64::NAN), "0.000");
        assert_eq!(ss(-3.0), "0.000");
        assert_eq!(secs_ms(1.5), Some(1500));
        assert_eq!(secs_ms(-1.0), None);
        assert_eq!(secs_ms(f64::INFINITY), None);
    }

    #[test]
    fn budget_and_costs() {
        assert_eq!(max_procs(32), 8);
        assert_eq!(max_procs(8), 4);
        assert_eq!(max_procs(2), 2);
        assert_eq!(proc_mb(1920, 1080, "yuv420p"), 60);
        assert_eq!(proc_mb(3840, 2160, "yuv420p"), 79);
        assert_eq!(proc_mb(3840, 2160, "yuva444p12le"), 316);
        assert_eq!(proc_mb(1920, 1080, "yuv420p10le"), 79);
        assert!(!heavy_pix_fmt("yuvj420p") && !heavy_pix_fmt("nv12") && heavy_pix_fmt("rgba") && heavy_pix_fmt("gbrap10le"));
        let limits = Limits { budget_mb: 768, max_procs: 8, thumb_slots: 2, select_max_px: SELECT_MAX_PX };
        let used = |procs, slots, mb| Usage { procs, slots, mb, thumb_slots: 0 };
        // 4K H.264: 8 processes fit; ProRes 4444 4K: 2
        let h264 = Cost { mb: proc_mb(3840, 2160, "yuv420p"), slots: 1 };
        assert!(fits(used(7, 7, h264.mb * 7), h264, &limits));
        assert!(!fits(used(8, 8, h264.mb * 8), h264, &limits));
        let prores = Cost { mb: proc_mb(3840, 2160, "yuva444p12le"), slots: 1 };
        assert!(fits(used(1, 1, prores.mb), prores, &limits));
        assert!(!fits(used(2, 2, prores.mb * 2), prores, &limits));
        // Over budget alone still runs; a 4-thread process counts 4 slots
        assert!(fits(Usage::default(), Cost { mb: 5000, slots: 4 }, &limits));
        assert!(!fits(used(5, 5, 300), Cost { mb: 180, slots: 4 }, &limits));
    }

    #[test]
    fn probe_json() {
        let json = br#"{"streams":[
            {"index":1,"codec_name":"png","width":600,"height":600,"disposition":{"attached_pic":1}},
            {"index":0,"codec_name":"h264","width":1440,"height":1080,"sample_aspect_ratio":"4:3","pix_fmt":"yuv420p",
             "avg_frame_rate":"0/0","r_frame_rate":"25/1","start_time":"0.040000","duration":"N/A","nb_frames":"N/A",
             "side_data_list":[{"side_data_type":"Display Matrix","rotation":-90}]}],
            "format":{"start_time":"0.000000","duration":"10.040000"}}"#;
        let p = parse_probe(json).unwrap();
        assert_eq!((p.width, p.height), (1080, 1920));
        assert_eq!(p.coded, (1440, 1080));
        assert_eq!(p.fps, Some(25.0));
        assert!((p.duration.unwrap() - 10.0).abs() < 1e-9);
        assert_eq!(p.frames, Some(250));
        assert_eq!(p.count(), 16);
        assert!((p.start - 0.04).abs() < 1e-9);

        // Numbers as strings or numbers, VFR average rate, rotate tag, few frames
        let json = br#"{"streams":[{"width":"640","height":360,"sample_aspect_ratio":"0:1","pix_fmt":"yuva444p12le",
            "avg_frame_rate":"30000/1001","r_frame_rate":"60/1","duration":0.3,"nb_frames":"9","tags":{"rotate":"90"}}],"format":{}}"#;
        let p = parse_probe(json).unwrap();
        assert_eq!((p.width, p.height), (360, 640));
        assert!((p.fps.unwrap() - 29.97).abs() < 0.01);
        assert_eq!(p.frames, Some(9));
        assert_eq!(p.count(), 9);

        // No duration anywhere: thumbnail only
        let json = br#"{"streams":[{"width":320,"height":240,"avg_frame_rate":"0/0","r_frame_rate":"0/0"}],"format":{"duration":"N/A"}}"#;
        let p = parse_probe(json).unwrap();
        assert_eq!((p.duration, p.fps, p.count()), (None, None, 1));

        // Only a cover, garbage, empty, zero size
        assert_eq!(parse_probe(br#"{"streams":[{"width":600,"height":600,"disposition":{"attached_pic":1}}]}"#), None);
        assert_eq!(parse_probe(b"not json"), None);
        assert_eq!(parse_probe(br#"{"streams":[]}"#), None);
        assert_eq!(parse_probe(br#"{"streams":[{"width":0,"height":240}]}"#), None);
    }

    #[test]
    fn keyframe_packets() {
        let json = br#"{"packets":[{"pts_time":"1.000000","flags":"K__"},{"pts_time":"N/A","flags":"K__"},{"pts_time":"3.5","flags":"___"}]}"#;
        assert_eq!(parse_keys(json, 3, 1.0), Some(vec![Some(0.0), None, None]));
        assert_eq!(parse_keys(json, 4, 0.0), None);
        assert_eq!(parse_keys(b"{}", 1, 0.0), None);
    }

    fn keys_every(gop: f64, duration: f64) -> Vec<Option<f64>> {
        slot_times(duration, 16).iter().map(|t| Some((t / gop).floor() * gop)).collect()
    }

    #[test]
    fn plan_selection() {
        // GOP 1 s, 5 s, 25 fps, 640x360: 5 keyframes and cheap → one select process with exact frames
        let keys = keys_every(1.0, 5.0);
        match plan_video(16, &keys, 5.0, Some(25.0), Some(125), (640, 360), SELECT_MAX_PX) {
            VideoPlan::Select { picks } => {
                assert_eq!(picks.len(), 15);
                assert_eq!(picks.first(), Some(&(1, 8)));
                assert_eq!(picks.last(), Some(&(15, 124)));
            }
            other => panic!("{:?}", other),
        }
        // Same with select disabled: groups per keyframe, slot 0's group aliased, short tail
        match plan_video(16, &keys, 5.0, Some(25.0), Some(125), (640, 360), 0.0) {
            VideoPlan::Keys { slot0_aliases, groups, tail } => {
                assert_eq!(slot0_aliases, vec![2, 1]);
                assert_eq!(groups.len(), 4);
                assert!(groups.iter().all(|g| !g.slots.contains(&15)));
                // Coarse to fine: slot 8's group (t=2.67 → key 2) before slot 4's (t=1.33 → key 1)
                assert_eq!(groups[0].slots[0], 8);
                assert_eq!(groups[0].key, Some(2.0));
                assert!((groups[0].seek - 2.001).abs() < 1e-9);
                let tail = tail.unwrap();
                assert!(!tail.long);
                assert!((tail.at - (5.0 - 1.5 / 25.0)).abs() < 1e-9);
                assert!((tail.retry - (5.0 - 3.0 / 25.0)).abs() < 1e-9);
            }
            other => panic!("{:?}", other),
        }
        // One keyframe per 10 s: 300 4K frames are under 2.5 Gpx → select
        let keys = keys_every(10.0, 12.0);
        assert!(matches!(plan_video(16, &keys, 12.0, Some(25.0), Some(300), (3840, 2160), SELECT_MAX_PX), VideoPlan::Select { .. }));
        // Too expensive to decode everything: two keyframes → one group besides slot 0's; long tail,
        // slot 15 last in its group (the exact frame replaces it later)
        match plan_video(16, &keys, 12.0, Some(25.0), Some(300), (3840, 2160), 1.0) {
            VideoPlan::Keys { slot0_aliases, groups, tail } => {
                assert_eq!(groups.len(), 1);
                assert_eq!(groups[0].key, Some(10.0));
                assert_eq!(groups[0].slots, vec![14, 13, 15]);
                assert_eq!(slot0_aliases.len(), 12);
                assert!(tail.unwrap().long);
            }
            other => panic!("{:?}", other),
        }
        // Many keyframes: never select
        let keys = keys_every(1.0, 60.0);
        assert!(matches!(plan_video(16, &keys, 60.0, Some(25.0), Some(1500), (640, 360), SELECT_MAX_PX), VideoPlan::Keys { .. }));
        // Keyframes unknown: one process per slot; slot 15 without a known key counts as a long tail
        let unknown = vec![None; 16];
        match plan_video(16, &unknown, 12.0, Some(25.0), None, (1920, 1080), SELECT_MAX_PX) {
            VideoPlan::Keys { slot0_aliases, groups, tail } => {
                assert!(slot0_aliases.is_empty());
                assert_eq!(groups.len(), 15);
                assert!(tail.unwrap().long);
            }
            other => panic!("{:?}", other),
        }
        // Fewer than 16 frames: every frame, by number
        assert_eq!(
            plan_video(5, &[None; 5], 0.2, Some(25.0), Some(5), (64, 64), SELECT_MAX_PX),
            VideoPlan::Select { picks: vec![(1, 1), (2, 2), (3, 3), (4, 4)] }
        );
        // One slot: nothing to plan
        assert_eq!(plan_video(1, &[], 0.0, None, None, (64, 64), SELECT_MAX_PX), VideoPlan::Keys { slot0_aliases: vec![], groups: vec![], tail: None });
    }

    #[test]
    fn thumbnail_stack_is_lifo_bounded_and_merged() {
        let key = |i: u64| StillKey { media: MediaKey { path: PathBuf::from(format!("C:\\v{}.mp4", i)), modified: 1, size: 0 }, kind: StillKind::VideoThumb };
        let (tx, rx) = mpsc::channel::<(u64, Result<Option<Vec<u8>>, String>)>();
        let reply = |i: u64| -> StillReply {
            let tx = tx.clone();
            Box::new(move |r| { let _ = tx.send((i, r)); })
        };
        let mut stack = StillStack::default();
        for i in 0..THUMB_STACK as u64 {
            assert!(stack.push(key(i), reply(i)).is_empty());
        }
        // Same file again: merged and moved to the top
        assert!(stack.push(key(0), reply(100)).is_empty());
        // One more: the oldest (1) is dropped
        let dropped = stack.push(key(999), reply(999));
        assert_eq!(dropped.len(), 1);
        for d in dropped {
            d(Err(BUSY.to_string()));
        }
        assert_eq!(rx.try_recv().unwrap(), (1, Err(BUSY.to_string())));
        let (top, _) = stack.pop().unwrap();
        assert_eq!(top, key(999));
        let (next, waiters) = stack.pop().unwrap();
        assert_eq!((next, waiters.len()), (key(0), 2));
    }

    #[test]
    fn lru_evicts_least_recent() {
        let mut lru = Lru::new(2);
        lru.insert(1, "a");
        lru.insert(2, "b");
        assert_eq!(lru.get(&1), Some(&"a"));
        lru.insert(3, "c");
        assert!(lru.contains(&1) && !lru.contains(&2) && lru.contains(&3));
        lru.clear();
        assert!(!lru.contains(&1));
    }

    #[cfg(windows)]
    #[test]
    fn media_paths() {
        assert_eq!(normalize_media_path("C:/Renders/shot.mp4/").unwrap(), PathBuf::from(r"C:\Renders\shot.mp4"));
        assert_eq!(normalize_media_path(r"\\?\C:\a\b.mov").unwrap(), PathBuf::from(r"C:\a\b.mov"));
        assert_eq!(normalize_media_path(r"\\?\UNC\srv\share\b.mov").unwrap(), PathBuf::from(r"\\srv\share\b.mov"));
        assert_eq!(normalize_media_path("C:/").unwrap(), PathBuf::from(r"C:\"));
        let long = format!(r"C:\{}\clip.mp4", "d".repeat(300));
        assert_eq!(normalize_media_path(&long).unwrap(), PathBuf::from(&long));
        assert!(normalize_media_path("relative/clip.mp4").is_err());
        assert!(normalize_media_path("").is_err());
        assert!(normalize_media_path(r"\\.\pipe\x").is_err());
        assert!(frame_path(Path::new(r"C:\seq"), "f_0001.png").is_some());
        assert!(frame_path(Path::new(r"C:\seq"), r"..\x.png").is_none());
        assert!(frame_path(Path::new(r"C:\seq"), r"C:\x.png").is_none());
    }

    // --- scheduler logic (no processes) ---

    fn collector() -> (Emitter, mpsc::Receiver<ScrubEvent>) {
        let (tx, rx) = mpsc::channel();
        (Arc::new(move |e| { let _ = tx.send(e); }), rx)
    }

    fn fake_tools() -> Tools {
        Tools { ffmpeg: PathBuf::from(r"Z:\missing\ffmpeg.exe"), ffprobe: PathBuf::from(r"Z:\missing\ffprobe.exe"), version: String::new(), source: ToolSource::Path }
    }

    fn test_limits() -> Limits {
        Limits { budget_mb: 768, max_procs: 8, thumb_slots: 2, select_max_px: SELECT_MAX_PX }
    }

    fn fake_proc(cost: Cost, thumb: bool) -> Proc {
        Proc { child: None, job: None, cost, thumb, owner: Owner::Done, deadline: Instant::now() + Duration::from_secs(60), ended: None, killed: false }
    }

    fn request(id: &str, kind: ScrubKind, path: &Path, frames: Vec<SequenceFrame>) -> ScrubRequest {
        ScrubRequest { id: id.into(), kind, path: path.to_string_lossy().into(), modified: 1, size: 1, frames, indices: None, max_side: 128 }
    }

    fn still_key(name: &str) -> StillKey {
        StillKey { media: MediaKey { path: PathBuf::from(name), modified: 1, size: 0 }, kind: StillKind::VideoThumb }
    }

    #[test]
    fn slot_is_freed_on_eof_and_unknown_ids_ignored() {
        let (tx, _rx) = mpsc::channel();
        let mut s = Scheduler::new(tx, None, test_limits());
        s.procs.insert(7, fake_proc(Cost { mb: 100, slots: 1 }, false));
        assert_eq!(s.usage(), Usage { procs: 1, slots: 1, mb: 100, thumb_slots: 0 });
        s.handle(Cmd::Proc(99, ProcMsg::Frame(vec![1, 2, 3])));
        s.handle(Cmd::Proc(99, ProcMsg::End { ok: true }));
        assert_eq!(s.usage().procs, 1);
        s.handle(Cmd::Proc(7, ProcMsg::End { ok: true }));
        assert_eq!(s.usage(), Usage::default());
    }

    #[test]
    fn budget_gates_the_queue() {
        let (tx, _rx) = mpsc::channel();
        let mut s = Scheduler::new(tx, Some(fake_tools()), test_limits());
        let (emit, events) = collector();
        let mut scrub = Scrub::new("a".into(), emit, MediaKey { path: PathBuf::from(r"C:\x.mp4"), modified: 1, size: 1 }, 128, None);
        scrub.queue.push_back(probe_task(Path::new(r"C:\x.mp4")));
        s.current = Some(scrub);
        // 768 MB taken: the probe waits, and so do thumbnails
        s.procs.insert(1, fake_proc(Cost { mb: 768, slots: 1 }, false));
        s.on_still(still_key(r"C:\t.mp4"), Box::new(|_| {}));
        s.pump();
        assert_eq!(s.current.as_ref().unwrap().queue.len(), 1);
        assert!(!s.stills.is_empty());
        // Freed: the probe starts (here it fails: the exe doesn't exist), the scrub ends with done
        s.handle(Cmd::Proc(1, ProcMsg::End { ok: true }));
        s.pump();
        assert!(s.current.is_none());
        assert!(s.stills.is_empty());
        let done = events.try_iter().find_map(|e| match e { ScrubEvent::Done(d) => Some(d), _ => None }).unwrap();
        assert_eq!(done.failed, vec![0]);
        // Thumbnails cap at 2 slots even with room left
        for i in 0..3 {
            s.procs.insert(10 + i, fake_proc(Cost { mb: 60, slots: 1 }, i < 2));
        }
        s.on_still(still_key(r"C:\u.mp4"), Box::new(|_| {}));
        s.pump();
        assert!(!s.stills.is_empty());
    }

    #[test]
    fn without_ffmpeg_thumbnails_and_scrubs_fail_fast() {
        let (tx, _rx) = mpsc::channel();
        let mut s = Scheduler::new(tx, None, test_limits());
        let (rtx, rrx) = mpsc::channel();
        s.handle(Cmd::Still { key: still_key(r"C:\v.mp4"), reply: Box::new(move |r| { let _ = rtx.send(r); }) });
        assert_eq!(rrx.try_recv().unwrap(), Err(NO_FFMPEG.to_string()));
        let (emit, events) = collector();
        s.handle(Cmd::Scrub { req: request("v", ScrubKind::Video, Path::new(r"C:\v.mp4"), vec![]), path: Some(PathBuf::from(r"C:\v.mp4")), emit });
        assert!(s.current.is_none());
        assert!(matches!(events.try_recv().unwrap(), ScrubEvent::Done(d) if d.id == "v" && d.failed.len() == 16));
        // Invalid path: done too
        let (emit, events) = collector();
        s.handle(Cmd::Scrub { req: request("p", ScrubKind::Video, Path::new("rel"), vec![]), path: None, emit });
        assert!(matches!(events.try_recv().unwrap(), ScrubEvent::Done(d) if d.id == "p"));
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nullspace_media_test_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn png_sequence(dir: &Path, n: u32) -> Vec<SequenceFrame> {
        (1..=n)
            .map(|i| {
                let name = format!("shot_{:04}.png", i);
                let (w, h) = if i == 6 { (200, 200) } else { (320, 180) };
                let img = image::RgbaImage::from_fn(w, h, |x, _| image::Rgba([(i * 10) as u8, x as u8, 0, if x < 20 { 0 } else { 255 }]));
                img.save(dir.join(&name)).unwrap();
                SequenceFrame { name, frame: i, modified: 0 }
            })
            .collect()
    }

    #[test]
    fn current_is_replaced_and_cancel_acts_on_current_only() {
        let dir = temp_dir("current");
        let frames = png_sequence(&dir, 3);
        let (tx, rx) = mpsc::channel();
        let mut s = Scheduler::new(tx, None, test_limits());
        let (emit_a, events_a) = collector();
        s.handle(Cmd::Scrub { req: request("a", ScrubKind::Sequence, &dir, frames.clone()), path: Some(dir.clone()), emit: emit_a });
        assert_eq!(s.current.as_ref().map(|c| c.id.as_str()), Some("a"));
        let cancelled_a = s.current.as_ref().unwrap().seq.as_ref().unwrap().cancelled.clone();
        // Cancel of another id: ignored
        s.handle(Cmd::Cancel("b".into()));
        assert_eq!(s.current.as_ref().map(|c| c.id.as_str()), Some("a"));
        // A new scrub replaces the old one, which is cancelled without events
        let (emit_b, events_b) = collector();
        s.handle(Cmd::Scrub { req: request("b", ScrubKind::Sequence, &dir, frames.clone()), path: Some(dir.clone()), emit: emit_b });
        assert_eq!(s.current.as_ref().map(|c| c.id.as_str()), Some("b"));
        assert!(cancelled_a.load(Ordering::Relaxed));
        // Late decode results of "a" are ignored; "b" completes
        let deadline = Instant::now() + Duration::from_secs(20);
        while s.current.is_some() && Instant::now() < deadline {
            if let Ok(cmd) = rx.recv_timeout(Duration::from_millis(100)) {
                s.handle(cmd);
            }
        }
        assert!(events_a.try_recv().is_err());
        let events: Vec<ScrubEvent> = events_b.try_iter().collect();
        let meta = events.iter().find_map(|e| match e { ScrubEvent::Meta(m) => Some(m.clone()), _ => None }).unwrap();
        assert_eq!((meta.width, meta.height, meta.count), (320, 180, 3));
        let frames_b: Vec<&ScrubFrame> = events.iter().filter_map(|e| match e { ScrubEvent::Frame(f) => Some(f), _ => None }).collect();
        assert_eq!(frames_b.len(), 3);
        assert!(frames_b.iter().all(|f| f.frame == Some(f.slot + 1) && f.data_url.starts_with("data:image/jpeg;base64,")));
        assert!(matches!(events.last(), Some(ScrubEvent::Done(d)) if d.failed.is_empty()));
        // Cancel of the current one
        let (emit_c, events_c) = collector();
        s.handle(Cmd::Scrub { req: request("c", ScrubKind::Sequence, &dir, frames), path: Some(dir.clone()), emit: emit_c });
        s.handle(Cmd::Cancel("c".into()));
        assert!(s.current.is_none());
        std::thread::sleep(Duration::from_millis(300));
        while let Ok(cmd) = rx.try_recv() {
            s.handle(cmd);
        }
        assert!(events_c.try_recv().is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    // --- with ffmpeg (skipped when not found) ---

    fn find_tools() -> Option<Tools> {
        let mut dirs = Vec::new();
        if let Some(dir) = std::env::var_os("NULLSPACE_TEST_FFMPEG_DIR") {
            dirs.push(PathBuf::from(dir));
        }
        if let Some(appdata) = std::env::var_os("APPDATA") {
            dirs.push(PathBuf::from(appdata).join("nullconvert.app").join("ffmpeg"));
        }
        if let Some(path) = std::env::var_os("PATH") {
            dirs.extend(std::env::split_paths(&path));
        }
        dirs.into_iter().find_map(|d| {
            let (ffmpeg, ffprobe) = (d.join("ffmpeg.exe"), d.join("ffprobe.exe"));
            (ffmpeg.is_file() && ffprobe.is_file()).then(|| Tools { ffmpeg, ffprobe, version: String::new(), source: ToolSource::Path })
        })
    }

    fn ffmpeg(tools: &Tools, args: &[&str]) -> bool {
        Command::new(&tools.ffmpeg)
            .args(["-v", "error", "-y", "-nostdin"])
            .args(args)
            .stdin(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    }

    /// testsrc clip: H.264 if the build has libx264, else MPEG-4 part 2
    fn make_clip(tools: &Tools, out: &Path, size: &str, seconds: u32, gop: u32) {
        let src = format!("testsrc=size={}:rate=25:duration={}", size, seconds);
        let out = out.to_str().unwrap();
        let gop = gop.to_string();
        let ok = ffmpeg(tools, &["-f", "lavfi", "-i", &src, "-c:v", "libx264", "-preset", "ultrafast", "-g", &gop, "-pix_fmt", "yuv420p", out])
            || ffmpeg(tools, &["-f", "lavfi", "-i", &src, "-c:v", "mpeg4", "-g", &gop, "-q:v", "5", out]);
        assert!(ok, "could not generate {}", out);
    }

    struct Harness {
        tx: mpsc::Sender<Cmd>,
    }

    impl Harness {
        fn new(tools: Tools, limits: Limits) -> Self {
            Harness { tx: spawn_scheduler(Some(tools), limits, false) }
        }

        fn thumb(&self, path: &Path) -> Result<Option<Vec<u8>>, String> {
            let (tx, rx) = mpsc::channel();
            let key = StillKey { media: MediaKey { path: path.to_path_buf(), modified: 1, size: 0 }, kind: StillKind::VideoThumb };
            self.tx.send(Cmd::Still { key, reply: Box::new(move |r| { let _ = tx.send(r); }) }).unwrap();
            rx.recv_timeout(Duration::from_secs(30)).unwrap()
        }

        /// Events until scrub-done, the time to the first frame and to done
        fn scrub(&self, req: ScrubRequest) -> (Vec<ScrubEvent>, Option<Duration>, Duration) {
            let (emit, rx) = collector();
            let path = normalize_media_path(&req.path).ok();
            let started = Instant::now();
            self.tx.send(Cmd::Scrub { req, path, emit }).unwrap();
            let mut events = Vec::new();
            let mut first = None;
            loop {
                let event = rx.recv_timeout(Duration::from_secs(60)).expect("no scrub-done");
                if first.is_none() && matches!(event, ScrubEvent::Frame(_)) {
                    first = Some(started.elapsed());
                }
                let done = matches!(event, ScrubEvent::Done(_));
                events.push(event);
                if done {
                    return (events, first, started.elapsed());
                }
            }
        }

        fn inspect<T: Send + 'static>(&self, f: impl FnOnce(&Scheduler) -> T + Send + 'static) -> T {
            let (tx, rx) = mpsc::channel();
            self.tx.send(Cmd::Inspect(Box::new(move |s| { let _ = tx.send(f(s)); }))).unwrap();
            rx.recv_timeout(Duration::from_secs(10)).unwrap()
        }
    }

    fn video_request(id: &str, path: &Path, max_side: u32) -> ScrubRequest {
        ScrubRequest { id: id.into(), kind: ScrubKind::Video, path: path.to_string_lossy().into(), modified: 1, size: 1, frames: vec![], indices: None, max_side }
    }

    struct Summary {
        meta: Option<ScrubMeta>,
        /// Last frame per slot
        slots: HashMap<u32, ScrubFrame>,
        done: ScrubDone,
    }

    fn summarize(events: &[ScrubEvent]) -> Summary {
        let mut meta = None;
        let mut slots = HashMap::new();
        let mut done = None;
        for e in events {
            match e {
                ScrubEvent::Meta(m) => meta = Some(m.clone()),
                ScrubEvent::Frame(f) => {
                    slots.insert(f.slot, f.clone());
                }
                ScrubEvent::Done(d) => done = Some(d.clone()),
            }
        }
        Summary { meta, slots, done: done.unwrap() }
    }

    fn frame_dims(f: &ScrubFrame) -> (u32, u32) {
        let b64 = f.data_url.split(',').nth(1).unwrap();
        jpeg_size(&STANDARD.decode(b64).unwrap()).unwrap()
    }

    #[test]
    fn with_ffmpeg_videos() {
        let Some(tools) = find_tools() else {
            println!("ffmpeg not found: skipped");
            return;
        };
        let dir = temp_dir("videos");
        let s = |p: &Path| p.to_str().unwrap().to_string();
        let gop1 = dir.join("gop1.mp4");
        make_clip(&tools, &gop1, "640x360", 5, 25);
        let gop10 = dir.join("gop10.mp4");
        make_clip(&tools, &gop10, "640x360", 12, 250);
        let prores = dir.join("prores4444.mov");
        assert!(ffmpeg(&tools, &["-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=2", "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", &s(&prores)]));
        let cover_png = dir.join("cover.png");
        assert!(ffmpeg(&tools, &["-f", "lavfi", "-i", "color=c=red:size=300x300", "-frames:v", "1", &s(&cover_png)]));
        let cover = dir.join("cover.mp4");
        assert!(ffmpeg(&tools, &["-i", &s(&gop1), "-i", &s(&cover_png), "-map", "0", "-map", "1", "-c", "copy", "-c:v:1", "png", "-disposition:v:1", "attached_pic", &s(&cover)]));
        let rotated = dir.join("rotated.mp4");
        assert!(ffmpeg(&tools, &["-display_rotation", "90", "-i", &s(&gop1), "-c", "copy", &s(&rotated)])
            || ffmpeg(&tools, &["-i", &s(&gop1), "-c", "copy", "-metadata:s:v:0", "rotate=90", &s(&rotated)]));
        // moov at the end: the first third has no index
        let truncated = dir.join("truncated.mp4");
        let bytes = std::fs::read(&gop10).unwrap();
        std::fs::write(&truncated, &bytes[..bytes.len() / 3]).unwrap();

        let h = Harness::new(tools.clone(), Limits::for_machine());

        // Row thumbnails
        let size_of = |r: Result<Option<Vec<u8>>, String>| r.unwrap().map(|b| jpeg_size(&b).unwrap());
        assert_eq!(size_of(h.thumb(&gop1)), Some((64, 36)));
        assert_eq!(size_of(h.thumb(&cover)), Some((64, 36)), "the cover must be skipped");
        assert_eq!(size_of(h.thumb(&rotated)), Some((36, 64)));
        assert_eq!(size_of(h.thumb(&prores)), Some((64, 48)));
        assert_eq!(h.thumb(&truncated), Ok(None));
        assert_eq!(h.thumb(&dir.join("missing.mp4")), Ok(None));

        // GOP 1 s: one select process (exact frames by number)
        let (events, _, _) = h.scrub(video_request("g1", &gop1, 256));
        let sum = summarize(&events);
        let meta = sum.meta.unwrap();
        assert_eq!((meta.width, meta.height, meta.count, meta.duration_ms), (640, 360, 16, Some(5000)));
        assert!(sum.done.failed.is_empty(), "{:?}", sum.done);
        assert_eq!(sum.slots.len(), 16);
        assert_eq!(frame_dims(&sum.slots[&3]), (256, 144));
        assert_eq!(sum.slots[&15].time_ms, Some(4960));

        // GOP 10 s, select disabled: keyframe groups, aliases, exact last frame with a long tail
        let keyed = Harness::new(tools.clone(), Limits { select_max_px: 0.0, ..Limits::for_machine() });
        let (events, _, _) = keyed.scrub(video_request("g10", &gop10, 200));
        let sum = summarize(&events);
        assert!(sum.done.failed.is_empty(), "{:?}", sum.done);
        assert_eq!(sum.slots.len(), 16);
        assert!(sum.done.aliases.contains(&(1, 0)), "{:?}", sum.done.aliases);
        assert!(!sum.done.aliases.iter().any(|&(slot, _)| slot == 15), "slot 15 got the exact frame: {:?}", sum.done.aliases);
        assert_eq!(sum.slots[&15].time_ms, Some(11960));
        assert_eq!(sum.slots[&14].time_ms, Some(10000));
        // Slot 15 came twice: the keyframe first, the exact frame last
        let slot15: Vec<Option<u64>> = events.iter().filter_map(|e| match e { ScrubEvent::Frame(f) if f.slot == 15 => Some(f.time_ms), _ => None }).collect();
        assert_eq!(slot15, vec![Some(10000), Some(11960)]);

        // GOP 1 s with select disabled: short tail, one process per keyframe
        let (events, _, _) = keyed.scrub(video_request("g1k", &gop1, 200));
        let sum = summarize(&events);
        assert!(sum.done.failed.is_empty(), "{:?}", sum.done);
        assert_eq!(sum.slots[&15].time_ms, Some(4960));
        assert_eq!(sum.slots[&4].time_ms, Some(1000));

        // Again: probe and keyframes come from the cache
        let (events, _, _) = keyed.scrub(video_request("g1k2", &gop1, 200));
        assert!(summarize(&events).done.failed.is_empty());
        assert!(keyed.inspect(|s| s.probes.map.values().any(|(p, _)| p.keys.is_some())));

        // ProRes 4444 with alpha, rotated, with a cover
        let (events, _, _) = h.scrub(video_request("pr", &prores, 256));
        let sum = summarize(&events);
        assert!(sum.done.failed.is_empty(), "{:?}", sum.done);
        assert_eq!(frame_dims(&sum.slots[&15]), (256, 192));
        let (events, _, _) = h.scrub(video_request("rot", &rotated, 128));
        let sum = summarize(&events);
        let meta = sum.meta.unwrap();
        assert_eq!((meta.width, meta.height), (360, 640));
        assert_eq!(frame_dims(&sum.slots[&8]), (72, 128));
        assert_eq!(frame_dims(&sum.slots[&0]), (72, 128));
        let (events, _, _) = h.scrub(video_request("cov", &cover, 128));
        assert!(summarize(&events).done.failed.is_empty());

        // Only the missing slots
        let mut req = video_request("part", &gop1, 256);
        req.indices = Some(vec![3, 9]);
        let (events, _, _) = h.scrub(req);
        let sum = summarize(&events);
        assert_eq!(sum.slots.keys().copied().collect::<std::collections::BTreeSet<_>>(), [3, 9].into_iter().collect());
        assert!(sum.done.failed.is_empty());

        // Truncated: no frames, but a done
        let (events, _, _) = h.scrub(video_request("cut", &truncated, 256));
        let sum = summarize(&events);
        assert!(sum.slots.is_empty());
        assert_eq!(sum.done.failed, vec![0]);

        // Cancel kills the processes; no done for a cancelled request
        let killed_before = h.inspect(|s| s.killed_total);
        let (emit, rx) = collector();
        h.tx.send(Cmd::Scrub { req: video_request("x", &gop10, 256), path: Some(gop10.clone()), emit }).unwrap();
        h.tx.send(Cmd::Cancel("x".into())).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while h.inspect(|s| s.procs.len()) > 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(h.inspect(|s| s.procs.len()), 0);
        assert!(h.inspect(|s| s.killed_total) > killed_before);
        std::thread::sleep(Duration::from_millis(200));
        assert!(!rx.try_iter().any(|e| matches!(e, ScrubEvent::Done(_))));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn with_ffmpeg_sequences_and_webp() {
        let Some(tools) = find_tools() else {
            println!("ffmpeg not found: skipped");
            return;
        };
        let dir = temp_dir("seq");
        let h = Harness::new(tools.clone(), Limits::for_machine());

        // PNG with alpha, one frame of another size: in process, letterboxed into the first frame's box
        let png_dir = dir.join("png");
        std::fs::create_dir_all(&png_dir).unwrap();
        let all = png_sequence(&png_dir, 20);
        let picked: Vec<SequenceFrame> = (0..16).map(|i| all[i * 19 / 15].clone()).collect();
        assert!(picked.iter().any(|f| f.frame == 6));
        let mut req = request("png", ScrubKind::Sequence, &png_dir, picked);
        req.max_side = 160;
        let (events, _, _) = h.scrub(req);
        let sum = summarize(&events);
        assert!(sum.done.failed.is_empty(), "{:?}", sum.done);
        assert_eq!(sum.slots.len(), 16);
        assert!(sum.slots.values().all(|f| frame_dims(f) == (160, 90)));
        assert_eq!(sum.slots[&15].frame, Some(20));
        let meta = sum.meta.unwrap();
        assert_eq!((meta.width, meta.height, meta.count), (320, 180, 16));

        // DPX through ffmpeg, source size from the header
        let dpx_dir = dir.join("dpx");
        std::fs::create_dir_all(&dpx_dir).unwrap();
        let pattern = dpx_dir.join("plate_%04d.dpx");
        assert!(ffmpeg(&tools, &["-f", "lavfi", "-i", "testsrc=size=400x300:rate=25:duration=1", "-frames:v", "4", "-start_number", "1", pattern.to_str().unwrap()]));
        let frames: Vec<SequenceFrame> = (1..=4).map(|i| SequenceFrame { name: format!("plate_{:04}.dpx", i), frame: i, modified: 0 }).collect();
        let (events, _, _) = h.scrub(request("dpx", ScrubKind::Sequence, &dpx_dir, frames));
        let sum = summarize(&events);
        assert!(sum.done.failed.is_empty(), "{:?}", sum.done);
        assert_eq!(sum.slots.len(), 4);
        let meta = sum.meta.unwrap();
        assert_eq!((meta.width, meta.height, meta.count), (400, 300, 4));
        assert!(sum.slots.values().all(|f| frame_dims(f) == (128, 96)));

        // WebP thumbnail through ffmpeg (global scheduler)
        let webp = dir.join("still.webp");
        assert!(ffmpeg(&tools, &["-f", "lavfi", "-i", "testsrc=size=600x400", "-frames:v", "1", webp.to_str().unwrap()]));
        tools_changed(Some(tools.clone()));
        let thumb = crate::image_thumbnail::thumbnail_for(&webp).unwrap().unwrap();
        assert_eq!((thumb.width, thumb.height), (600, 400));
        assert!(!thumb.data_url.starts_with("data:image/webp"), "{}", &thumb.data_url[..30]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Timing on real project files (read-only). Run:
    /// `cargo test --release timing_real_files -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn timing_real_files() {
        let Some(tools) = find_tools() else { return };
        println!("ffmpeg: {}", tools.ffmpeg.display());
        let files = [
            r"E:\Projects\nullSpace\Commercial\MTCGolubi\_GlobalReferences\optimus_boardmatic_v04.mp4",
            r"E:\Projects\nullSpace\Commercial\GDN\_GlobalReferences\BUS REFs\NIGHT SHOT.mp4",
            r"E:\Projects\nullSpace\Commercial\GDN\_GlobalReferences\BUS REFs\TRAIN REFERENCE.MOV",
            r"E:\Projects\nullSpace\Commercial\SHOPAnimatic\Blender\SCENE001\Tex\Plates\track\ozn_0130_undistort_v001.mov",
        ];
        for (i, file) in files.iter().enumerate() {
            let path = Path::new(file);
            if !path.is_file() {
                println!("missing: {}", file);
                continue;
            }
            // A fresh scheduler per file: cold caches, own peaks
            let h = Harness::new(tools.clone(), Limits::for_machine());
            let started = Instant::now();
            let thumb = h.thumb(path);
            let thumb_ms = started.elapsed().as_millis();
            let (events, first, total) = h.scrub(video_request(&format!("t{}", i), path, 384));
            let sum = summarize(&events);
            let (peak_procs, peak_mb) = h.inspect(|s| (s.peak_procs, s.peak_proc_bytes >> 20));
            let (_, _, warm) = h.scrub(video_request(&format!("w{}", i), path, 384));
            println!(
                "{}: thumb {} ms ({}), first frame {:?} ms, all {} ms (warm {} ms), failed {:?}, aliases {}, peak {} procs, peak process {} MB, meta {:?}",
                path.file_name().unwrap().to_string_lossy(),
                thumb_ms,
                if matches!(thumb, Ok(Some(_))) { "ok" } else { "none" },
                first.map(|d| d.as_millis()),
                total.as_millis(),
                warm.as_millis(),
                sum.done.failed,
                sum.done.aliases.len(),
                peak_procs,
                peak_mb,
                sum.meta.map(|m| (m.width, m.height, m.duration_ms, m.fps, m.count)),
            );
        }
        let seq_dir = Path::new(r"E:\Projects\nullSpace\Commercial\GDN\Blender\TEMPLE\Tex\Plates\RL_08_SHT_0030\v001");
        if let Ok(read) = std::fs::read_dir(seq_dir) {
            let mut names: Vec<String> = read
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|n| n.to_ascii_lowercase().ends_with(".jpg"))
                .collect();
            names.sort();
            if names.len() >= 16 {
                let frames: Vec<SequenceFrame> = (0..16)
                    .map(|i| SequenceFrame { name: names[i * (names.len() - 1) / 15].clone(), frame: i as u32, modified: 0 })
                    .collect();
                let h = Harness::new(tools.clone(), Limits::for_machine());
                let mut req = request("jpg", ScrubKind::Sequence, seq_dir, frames);
                req.max_side = 384;
                let (events, first, total) = h.scrub(req);
                let sum = summarize(&events);
                println!(
                    "JPG sequence ({} files): first frame {:?} ms, 16 frames {} ms, failed {:?}",
                    names.len(),
                    first.map(|d| d.as_millis()),
                    total.as_millis(),
                    sum.done.failed
                );
            }
        }
    }
}
