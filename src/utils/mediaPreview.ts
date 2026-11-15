/**
 * Media previews (images, videos, image sequences) for Project Structure and Render Output:
 * row thumbnails, hover scrubbing (0% = first frame, 100% = last), the hover popup.
 * Memory only — nothing on disk.
 *
 * CONTRACT: the exported names/signatures below are used by OutputOverview, TreeView and Settings.
 * Keep them stable; the implementation lives here (Rust side: src-tauri/src/media_preview.rs,
 * media_tools.rs, image_thumbnail.rs).
 *
 * Shape:
 * - Stores are module-level; hooks read them through useSyncExternalStore with primitive snapshots
 *   (a version number), so a frame arriving re-renders only the popup, never the rows.
 * - One hover session at a time (the row under the pointer). Rows start it on real mouse movement,
 *   move the playback bar themselves (style through a ref) and only tell the store when the slot changes.
 * - Events from Rust are listened to once per page; frames of earlier requests of this page are kept
 *   (they're correct, the next hover over that row starts with them).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type React from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useContextMenuStore } from '../store/contextMenuStore';
import { indexedDBThumbnailCache } from './indexedDBCache';

export type MediaKind = 'image' | 'video' | 'sequence';

/** One frame of a sequence (name relative to the sequence folder), from OutputFile.preview_frames */
export interface PreviewFrame {
  name: string;
  frame: number;
  modified: number;
}

export interface MediaItem {
  kind: MediaKind;
  /** image / video: file path; sequence: folder path */
  path: string;
  /** Caption name (file name, or the sequence display name) */
  name: string;
  /** ms */
  modified?: number;
  /** bytes */
  size?: number;
  /** sequence: up to 16 frames in timeline order (first = row thumbnail) */
  frames?: PreviewFrame[];
  /** sequence: total frame count for the caption */
  frameCount?: number;
}

export interface MediaThumb {
  dataUrl: string;
  /** Thumbnail pixel size (its aspect = the media's display aspect) */
  width: number;
  height: number;
  /** Source size and file size when known (images) */
  srcWidth?: number;
  srcHeight?: number;
  size?: number;
}

/** Mirror of media_tools::MediaToolsStatus */
export interface MediaToolsStatus {
  seq: number;
  checked: boolean;
  tools: { ffmpeg: string; ffprobe: string; version: string; source: 'nullspace' | 'nullconverter' | 'path' } | null;
  phase: 'idle' | 'downloading' | 'verifying' | 'installing' | 'cancelling' | 'error';
  downloaded: number;
  total: number;
  last_error: string | null;
}

export interface ScrubRowBinding {
  /** Spread on the row element (it must be `relative overflow-hidden` and contain <ScrubBar barRef={barRef} />) */
  rowHandlers: {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
    onMouseMove: (e: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => void;
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => void;
  };
  barRef: React.RefObject<HTMLDivElement>;
  /** True when this row scrubs (video with ffmpeg, sequence of 2+ frames); false: popup only or nothing */
  scrubbable: boolean;
}

// ---------------------------------------------------------------------------------------------
// The one shared toggle (Settings → Appearance → File Previews), key kept from before
// ---------------------------------------------------------------------------------------------
const PREVIEWS_KEY = 'treeImagePreviews';

function readPreviewsEnabled(): boolean {
  try {
    const saved = localStorage.getItem(PREVIEWS_KEY);
    return saved !== null ? JSON.parse(saved) : true;
  } catch {
    return true;
  }
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

export function useFilePreviewsEnabled(): boolean {
  return useSyncExternalStore(subscribeStorage, readPreviewsEnabled);
}

// ---------------------------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------------------------
const FRAME_BUDGET = 4 * 1024 * 1024;
const THUMB_BUDGET = 6 * 1024 * 1024;
const THUMB_ENTRY_MAX = 512 * 1024;
/** Thumbnail requests to Rust at a time (Rust has its own limits behind them) */
const MAX_IN_FLIGHT = 4;
/** A file written less than this long ago may still be in progress: asked later */
const YOUNG_MS = 3000;
const BUSY_RETRY_MS = 1500;
/** Pointer must be on the row this long before a move starts scrubbing */
const ENTER_SETTLE_MS = 70;
const SHOW_DELAY_MS = 200;
/** Moving from one row to the next within this time shows the next popup at once */
const REOPEN_WINDOW_MS = 500;
const DEFAULT_SLOTS = 16;
/** Remembered per-file probe results (count, size, duration) and failed slots */
const META_MAX = 200;
/** Requests whose late events are still mapped to cache keys */
const REQUESTS_MAX = 64;

const normPath = (p: string) => p.replace(/\\/g, '/').toLowerCase();
const joinPath = (folder: string, name: string) =>
  folder.replace(/[\\/]+$/, '') + (folder.includes('\\') ? '\\' : '/') + name;

// ---------------------------------------------------------------------------------------------
// Change notification: one version number per concern
// ---------------------------------------------------------------------------------------------
function createSignal() {
  let version = 0;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => version,
    bump() {
      version++;
      listeners.forEach(l => l());
    },
  };
}

/** Thumbnails must be asked again: Clear Cache, ffmpeg appeared/changed */
const generation = createSignal();
/** Popup / hover session changed (frame arrived, slot changed, shown/hidden) */
const popupSignal = createSignal();
/** ffmpeg status snapshot replaced */
const toolsSignal = createSignal();

// ---------------------------------------------------------------------------------------------
// Byte-limited LRU (Map insertion order = recency)
// ---------------------------------------------------------------------------------------------
class ByteLru<V> {
  private map = new Map<string, { value: V; bytes: number }>();
  private total = 0;
  constructor(private budget: number, private pinned: (key: string) => boolean = () => false) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  has(key: string) {
    return this.map.has(key);
  }

  set(key: string, value: V, bytes: number) {
    const old = this.map.get(key);
    if (old) {
      this.total -= old.bytes;
      this.map.delete(key);
    }
    this.map.set(key, { value, bytes });
    this.total += bytes;
    if (this.total <= this.budget) return;
    for (const [k, entry] of this.map) {
      if (this.total <= this.budget) break;
      if (k === key || this.pinned(k)) continue;
      this.map.delete(k);
      this.total -= entry.bytes;
    }
  }

  deleteWhere(test: (value: V) => boolean) {
    for (const [k, entry] of this.map) {
      if (test(entry.value)) {
        this.map.delete(k);
        this.total -= entry.bytes;
      }
    }
  }

  clear() {
    this.map.clear();
    this.total = 0;
  }

  get size() {
    return this.map.size;
  }
}

/** Small count-limited map (oldest dropped first) */
function boundedSet<K, V>(map: Map<K, V>, key: K, value: V, max: number) {
  map.delete(key);
  map.set(key, value);
  if (map.size > max) map.delete(map.keys().next().value as K);
}

// ---------------------------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------------------------
interface FrameEntry {
  dataUrl: string;
  timeMs: number | null;
  frame: number | null;
}

interface VideoMeta {
  width: number;
  height: number;
  durationMs: number | null;
  fps: number | null;
  count: number;
}

/** Thumbnails; null = the file has none (unsupported, unreadable) — not asked again this generation */
const thumbs = new ByteLru<MediaThumb | null>(THUMB_BUDGET);
/** Scrub frames: video `normPath|modified|slot`, sequence `normPath(folder/name)|modified` */
const frames = new ByteLru<FrameEntry>(FRAME_BUDGET, key => session?.slotKeysSet.has(key) ?? false);
/** Video probe results by `normPath|modified` */
const videoMeta = new Map<string, VideoMeta>();
/** Slots Rust reported as never coming, by media key (video) — not asked again on the next hover */
const failedSlots = new Map<string, Set<number>>();

/** Settings → Clear Cache: memory here and Rust's probe caches; rows ask for their thumbnails again */
export function clearMediaPreviewMemory(): void {
  invoke('clear_media_preview_cache').catch(() => {});
  thumbs.clear();
  frames.clear();
  videoMeta.clear();
  failedSlots.clear();
  generation.bump();
  popupSignal.bump();
}

/** Entries held in memory (for the Clear Cache button label/state) */
export function mediaPreviewMemoryEntries(): number {
  return thumbs.size + frames.size;
}

// ---------------------------------------------------------------------------------------------
// ffmpeg status
// ---------------------------------------------------------------------------------------------
let toolsStatus: MediaToolsStatus | null = null;

function applyToolsStatus(next: MediaToolsStatus | null | undefined): boolean {
  if (!next || typeof next.seq !== 'number') return false;
  if (toolsStatus && next.seq <= toolsStatus.seq) return false;
  const hadTools = toolsStatus?.tools?.ffmpeg ?? null;
  toolsStatus = next;
  toolsSignal.bump();
  return hadTools !== (next.tools?.ffmpeg ?? null);
}

type ToolsAvailability = 'unknown' | 'yes' | 'no';
function toolsAvailability(): ToolsAvailability {
  if (!toolsStatus || !toolsStatus.checked) return 'unknown';
  return toolsStatus.tools ? 'yes' : 'no';
}

/** ffmpeg status for Settings → Data and the "needs ffmpeg" hint; null until first snapshot */
export function useMediaToolsStatus(): MediaToolsStatus | null {
  useEffect(ensureInit, []);
  return useSyncExternalStore(toolsSignal.subscribe, () => toolsStatus);
}

// ---------------------------------------------------------------------------------------------
// One-time setup: event listeners, ffmpeg status, removal of the old on-disk tree thumbnails
// ---------------------------------------------------------------------------------------------
interface ScrubMetaEvent { id: string; width: number; height: number; duration_ms: number | null; fps: number | null; count: number }
interface ScrubFrameEvent { id: string; slot: number; data_url: string; time_ms: number | null; frame: number | null }
interface ScrubDoneEvent { id: string; failed: number[]; aliases: [number, number][] }

let initialized = false;
const IDB_CLEANUP_FLAG = 'mediaPreview.treeThumbIdbCleared';

function ensureInit() {
  if (initialized) return;
  initialized = true;

  void (async () => {
    try {
      const { appWindow } = await import('@tauri-apps/api/window');
      // Listeners first, then the snapshot: an update between the two is never lost (seq orders them)
      await Promise.all([
        appWindow.listen<ScrubMetaEvent>('scrub-meta', e => onScrubMeta(e.payload)),
        appWindow.listen<ScrubFrameEvent>('scrub-frame', e => onScrubFrame(e.payload)),
        appWindow.listen<ScrubDoneEvent>('scrub-done', e => onScrubDone(e.payload)),
        appWindow.listen<MediaToolsStatus>('media-tools:changed', e => {
          applyToolsStatus(e.payload);
          onToolsChanged();
        }),
        appWindow.listen<MediaToolsStatus>('ffmpeg:progress', e => {
          applyToolsStatus(e.payload);
        }),
        appWindow.listen<MediaToolsStatus>('ffmpeg:done', e => {
          if (applyToolsStatus(e.payload)) onToolsChanged();
        }),
      ]);
      applyToolsStatus(await invoke<MediaToolsStatus>('get_media_tools_status'));
    } catch (e) {
      console.error('Media previews: setup failed', e);
    }
  })();

  window.addEventListener('scroll', suspendActive, true);
  window.addEventListener('mousedown', suspendActive, true);
  window.addEventListener('blur', suspendActive);

  // Tree thumbnails used to be kept in IndexedDB; they live in memory now
  let flagged = false;
  try {
    flagged = localStorage.getItem(IDB_CLEANUP_FLAG) === '1';
  } catch {
    flagged = true;
  }
  if (!flagged) {
    const cleanup = () => {
      indexedDBThumbnailCache.clearType('tree_thumb')
        .then(() => {
          try {
            localStorage.setItem(IDB_CLEANUP_FLAG, '1');
          } catch {
            // Tried again next start
          }
        })
        .catch(() => {});
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(cleanup, { timeout: 10000 });
    else window.setTimeout(cleanup, 3000);
  }
}

function onToolsChanged() {
  // Videos that had no thumbnail may have one now; probe results may differ between builds
  thumbs.deleteWhere(v => v === null);
  videoMeta.clear();
  failedSlots.clear();
  noFfmpegGeneration = -1;
  generation.bump();
  popupSignal.bump();
}

// ---------------------------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------------------------
interface ThumbSpec {
  /** Cache key */
  key: string;
  /** Same file across versions: the previous picture stays while a newer one loads */
  fileKey: string;
  kind: MediaKind;
  /** File the thumbnail is made from */
  path: string;
  modified: number;
  size: number;
}

function thumbSpecOf(item: MediaItem | null): ThumbSpec | null {
  if (!item || !item.path) return null;
  if (item.kind === 'sequence') {
    // The first frame: stable while the sequence is still rendering (its range keeps growing)
    const first = item.frames?.[0];
    if (!first) return null;
    const path = joinPath(item.path, first.name);
    return { key: `img|${normPath(path)}|${first.modified}`, fileKey: `seq|${normPath(item.path)}`, kind: 'image', path, modified: first.modified, size: 0 };
  }
  const modified = item.modified ?? 0;
  const prefix = item.kind === 'video' ? 'vid' : 'img';
  return {
    key: `${prefix}|${normPath(item.path)}|${modified}`,
    fileKey: `${prefix}|${normPath(item.path)}`,
    kind: item.kind,
    path: item.path,
    modified,
    size: item.size ?? 0,
  };
}

type ThumbResult = { ok: true; thumb: MediaThumb | null } | { ok: false; error: string };

interface ThumbJob {
  key: string;
  spec: ThumbSpec;
  waiters: Set<(r: ThumbResult) => void>;
  started: boolean;
}

const thumbJobs = new Map<string, ThumbJob>();
const thumbQueue: ThumbJob[] = [];
let thumbsInFlight = 0;
/** Generation at which Rust said "no_ffmpeg": video thumbnails wait for the next one */
let noFfmpegGeneration = -1;

interface RustImageThumb { data_url: string; width: number; height: number; size: number }
interface RustVideoThumb { data_url: string; width: number; height: number }

async function fetchThumb(spec: ThumbSpec): Promise<MediaThumb | null> {
  if (spec.kind === 'video') {
    const t = await invoke<RustVideoThumb | null>('get_video_thumbnail', { path: spec.path, modified: spec.modified, size: spec.size });
    return t ? { dataUrl: t.data_url, width: t.width, height: t.height, size: spec.size || undefined } : null;
  }
  const t = await invoke<RustImageThumb | null>('get_image_thumbnail', { path: spec.path });
  return t ? { dataUrl: t.data_url, width: t.width, height: t.height, srcWidth: t.width, srcHeight: t.height, size: t.size } : null;
}

function pumpThumbs() {
  while (thumbsInFlight < MAX_IN_FLIGHT && thumbQueue.length > 0) {
    const job = thumbQueue.shift()!;
    if (job.waiters.size === 0) {
      thumbJobs.delete(job.key);
      continue;
    }
    job.started = true;
    thumbsInFlight++;
    fetchThumb(job.spec)
      .then(
        (thumb): ThumbResult => {
          const bytes = thumb ? thumb.dataUrl.length + 64 : 64;
          if (bytes <= THUMB_ENTRY_MAX) thumbs.set(job.key, thumb, bytes);
          return { ok: true, thumb };
        },
        (e): ThumbResult => ({ ok: false, error: String(e) })
      )
      .then(result => {
        thumbsInFlight--;
        thumbJobs.delete(job.key);
        job.waiters.forEach(w => w(result));
        pumpThumbs();
      });
  }
}

function requestThumb(spec: ThumbSpec, onResult: (r: ThumbResult) => void): () => void {
  let job = thumbJobs.get(spec.key);
  if (!job) {
    job = { key: spec.key, spec, waiters: new Set(), started: false };
    thumbJobs.set(spec.key, job);
    thumbQueue.push(job);
  }
  job.waiters.add(onResult);
  pumpThumbs();
  const own = job;
  return () => {
    own.waiters.delete(onResult);
    if (own.waiters.size === 0 && !own.started) {
      const i = thumbQueue.indexOf(own);
      if (i >= 0) thumbQueue.splice(i, 1);
      thumbJobs.delete(own.key);
    }
  };
}

/** Row thumbnail (memory LRU). Loads only while `active` and on screen; cached result shows regardless */
export function useMediaThumbnail(item: MediaItem | null, active: boolean): MediaThumb | null {
  useEffect(ensureInit, []);
  const enabled = useFilePreviewsEnabled();
  const gen = useSyncExternalStore(generation.subscribe, generation.get);
  const tools = useSyncExternalStore(toolsSignal.subscribe, toolsAvailability);
  const spec = enabled ? thumbSpecOf(item) : null;
  const key = spec?.key ?? null;
  const fileKey = spec?.fileKey ?? null;
  const [state, setState] = useState<{ key: string | null; fileKey: string | null; thumb: MediaThumb | null }>(() => ({
    key,
    fileKey,
    thumb: key ? thumbs.get(key) ?? null : null,
  }));
  const [retry, setRetry] = useState(0);
  const specRef = useRef(spec);
  specRef.current = spec;

  useEffect(() => {
    const s = specRef.current;
    if (!s || !key) return;
    const hit = thumbs.get(key);
    if (hit !== undefined) {
      setState(prev => (prev.key === key && prev.thumb === hit ? prev : { key, fileKey: s.fileKey, thumb: hit }));
      return;
    }
    if (!active) return;
    if (s.kind === 'video' && (tools === 'no' || noFfmpegGeneration === gen)) return;

    let timer: number | undefined;
    const age = s.modified > 0 ? Date.now() - s.modified : Infinity;
    if (age >= 0 && age < YOUNG_MS) {
      // Possibly still being written: ask once it settled
      timer = window.setTimeout(() => setRetry(n => n + 1), YOUNG_MS - age + 50);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    const cancel = requestThumb(s, result => {
      if (cancelled) return;
      if (result.ok) {
        setState({ key, fileKey: s.fileKey, thumb: result.thumb });
      } else if (result.error.includes('no_ffmpeg')) {
        noFfmpegGeneration = gen;
      } else if (result.error.includes('busy')) {
        timer = window.setTimeout(() => setRetry(n => n + 1), BUSY_RETRY_MS);
      }
      // Other errors (file locked, gone): not cached, asked again on the next mount or generation
    });
    return () => {
      cancelled = true;
      cancel();
      window.clearTimeout(timer);
    };
  }, [key, active, gen, tools, retry]);

  if (!key) return null;
  if (state.key === key) return state.thumb;
  const cached = thumbs.get(key);
  if (cached !== undefined) return cached;
  // Same file, newer version still loading: the previous picture stays until the new one is ready
  return state.fileKey === fileKey ? state.thumb : null;
}

// ---------------------------------------------------------------------------------------------
// Visibility: one IntersectionObserver for every row thumbnail in the app
// ---------------------------------------------------------------------------------------------
const visibilityCallbacks = new Map<Element, (onScreen: boolean) => void>();
let visibilityObserver: IntersectionObserver | null = null;

function getVisibilityObserver(): IntersectionObserver | null {
  if (visibilityObserver || typeof IntersectionObserver === 'undefined') return visibilityObserver;
  // Root = the window; scrollMargin widens every nested scroller (SimpleBar, Output groups) by the same
  // margin, so rows just below a list's fold load before they scroll in
  const options = { rootMargin: '200px 0px', scrollMargin: '200px 0px' } as IntersectionObserverInit;
  visibilityObserver = new IntersectionObserver(entries => {
    for (const entry of entries) visibilityCallbacks.get(entry.target)?.(entry.isIntersecting);
  }, options);
  return visibilityObserver;
}

/** Callback ref + "on screen (with 200px margin)" from one module-level IntersectionObserver */
export function useThumbVisibility<T extends Element = HTMLElement>(): [(el: T | null) => void, boolean] {
  const [onScreen, setOnScreen] = useState(false);
  const current = useRef<T | null>(null);
  const ref = useCallback((el: T | null) => {
    if (current.current === el) return;
    const observer = getVisibilityObserver();
    if (current.current) {
      visibilityCallbacks.delete(current.current);
      observer?.unobserve(current.current);
    }
    current.current = el;
    if (el && observer) {
      visibilityCallbacks.set(el, setOnScreen);
      observer.observe(el);
    } else {
      setOnScreen(false);
    }
  }, []);
  return [ref, onScreen];
}

// ---------------------------------------------------------------------------------------------
// Scrub requests and their events
// ---------------------------------------------------------------------------------------------
interface RequestInfo {
  kind: 'video' | 'sequence';
  /** Video: `normPath|modified` */
  mediaKey: string;
  /** Sequence: cache key per slot */
  slotKeys: string[];
}

const requests = new Map<string, RequestInfo>();
let requestCounter = 0;

const videoFrameKey = (mediaKey: string, slot: number) => `${mediaKey}|${slot}`;

function frameKeyFor(req: RequestInfo, slot: number): string | null {
  return req.kind === 'video' ? videoFrameKey(req.mediaKey, slot) : req.slotKeys[slot] ?? null;
}

function isSessionRequest(id: string) {
  return session !== null && session.reqId === id;
}

function onScrubMeta(m: ScrubMetaEvent) {
  const req = requests.get(m.id);
  if (!req || req.kind !== 'video') {
    if (isSessionRequest(m.id) && session) {
      session.srcWidth = m.width;
      session.srcHeight = m.height;
      popupSignal.bump();
    }
    return;
  }
  const count = Math.max(1, Math.min(DEFAULT_SLOTS, m.count || DEFAULT_SLOTS));
  boundedSet(videoMeta, req.mediaKey, { width: m.width, height: m.height, durationMs: m.duration_ms ?? null, fps: m.fps ?? null, count }, META_MAX);
  if (isSessionRequest(m.id)) popupSignal.bump();
}

function onScrubFrame(f: ScrubFrameEvent) {
  const req = requests.get(f.id);
  if (!req || typeof f.data_url !== 'string') return;
  const key = frameKeyFor(req, f.slot);
  if (!key) return;
  frames.set(key, { dataUrl: f.data_url, timeMs: f.time_ms ?? null, frame: f.frame ?? null }, f.data_url.length + 64);
  if (session && session.slotKeysSet.has(key)) popupSignal.bump();
}

function onScrubDone(d: ScrubDoneEvent) {
  const req = requests.get(d.id);
  if (!req) return;
  for (const [slot, source] of d.aliases ?? []) {
    const from = frameKeyFor(req, source);
    const to = frameKeyFor(req, slot);
    const entry = from ? frames.get(from) : undefined;
    // Same string: the alias costs only its key
    if (entry && to) frames.set(to, entry, 64);
  }
  if (req.kind === 'video' && d.failed?.length) {
    const set = failedSlots.get(req.mediaKey) ?? new Set<number>();
    d.failed.forEach(s => set.add(s));
    boundedSet(failedSlots, req.mediaKey, set, META_MAX);
  }
  if (session && session.reqId === d.id) {
    session.reqDone = true;
    d.failed?.forEach(s => session!.failed.add(s));
    popupSignal.bump();
  }
  requests.delete(d.id);
}

function maxSide() {
  return Math.min(384, Math.ceil(224 * (window.devicePixelRatio || 1)));
}

// ---------------------------------------------------------------------------------------------
// The hover session (one at a time) — read by MediaPreviewHost
// ---------------------------------------------------------------------------------------------
type RowMode = 'none' | 'popup' | 'scrub' | 'hint';

export interface HoverAnchor {
  top: number;
  bottom: number;
  left: number;
}

interface Session {
  token: number;
  el: HTMLElement;
  bar: HTMLDivElement | null;
  /** Frozen at start: a list reload while hovered doesn't restart the scrub */
  item: MediaItem;
  thumb: MediaThumb | null;
  mode: Exclude<RowMode, 'none'>;
  /** Video: `normPath|modified` */
  mediaKey: string;
  /** Cache key per slot (video: grows with the probed count) */
  slotKeys: string[];
  slotKeysSet: Set<string>;
  slot: number;
  reqId: string | null;
  reqDone: boolean;
  failed: Set<number>;
  srcWidth: number | null;
  srcHeight: number | null;
  popup: 'hidden' | 'pending' | 'shown';
  visible: boolean;
  anchor: HoverAnchor | null;
  /** Width / height of the picture box, fixed when the popup appears so it never jumps */
  aspect: number;
  timer: number | undefined;
  raf: number | undefined;
}

let session: Session | null = null;
let tokenCounter = 0;
let lastHiddenAt = 0;

function slotCount(s: Session): number {
  if (s.item.kind === 'sequence') return s.item.frames?.length ?? 0;
  return videoMeta.get(s.mediaKey)?.count ?? DEFAULT_SLOTS;
}

function syncVideoSlotKeys(s: Session) {
  if (s.item.kind !== 'video') return;
  const n = slotCount(s);
  if (s.slotKeys.length === n) return;
  s.slotKeys = Array.from({ length: n }, (_, i) => videoFrameKey(s.mediaKey, i));
  s.slotKeysSet = new Set(s.slotKeys);
}

function startScrubRequest(s: Session) {
  const n = slotCount(s);
  const knownFailed = s.item.kind === 'video' ? failedSlots.get(s.mediaKey) : undefined;
  const missing: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!frames.has(s.slotKeys[i]) && !knownFailed?.has(i)) missing.push(i);
  }
  if (missing.length === 0) return;
  const id = `${Date.now()}-${++requestCounter}`;
  boundedSet(requests, id, { kind: s.item.kind === 'video' ? 'video' : 'sequence', mediaKey: s.mediaKey, slotKeys: s.slotKeys.slice() }, REQUESTS_MAX);
  s.reqId = id;
  s.reqDone = false;
  const request = {
    id,
    kind: s.item.kind === 'video' ? 'video' : 'sequence',
    path: s.item.path,
    modified: Math.max(0, Math.round(s.item.modified ?? 0)),
    size: Math.max(0, Math.round(s.item.size ?? 0)),
    frames:
      s.item.kind === 'sequence'
        ? (s.item.frames ?? []).map(f => ({ name: f.name, frame: Math.max(0, Math.round(f.frame)), modified: Math.max(0, Math.round(f.modified)) }))
        : [],
    // Video slot count is known only after a probe: ask for all of them until then
    indices: missing.length === n || (s.item.kind === 'video' && !videoMeta.has(s.mediaKey)) ? null : missing,
    max_side: maxSide(),
  };
  invoke('start_scrub', { request }).catch(e => console.error('start_scrub failed:', e));
}

function cancelRequest(s: Session) {
  if (s.reqId && !s.reqDone) invoke('cancel_scrub', { id: s.reqId }).catch(() => {});
  s.reqId = null;
}

function resetBar(bar: HTMLDivElement | null) {
  if (!bar) return;
  bar.style.opacity = '0';
  bar.style.transform = 'scaleX(0)';
}

function clearPopupTimers(s: Session) {
  window.clearTimeout(s.timer);
  if (s.raf !== undefined) cancelAnimationFrame(s.raf);
  s.timer = undefined;
  s.raf = undefined;
}

/** `moved`: the pointer went to another row (its popup may then open at once); a press/scroll isn't that */
function hidePopup(s: Session, moved: boolean) {
  clearPopupTimers(s);
  if (moved && s.popup === 'shown') lastHiddenAt = performance.now();
  s.popup = 'hidden';
  s.visible = false;
  s.anchor = null;
}

function popupAspect(s: Session): number {
  if (s.item.kind === 'video') {
    const meta = videoMeta.get(s.mediaKey);
    if (meta && meta.width > 0 && meta.height > 0) return meta.width / meta.height;
  }
  const t = s.thumb;
  if (t) {
    if (t.srcWidth && t.srcHeight) return t.srcWidth / t.srcHeight;
    if (t.width > 0 && t.height > 0) return t.width / t.height;
  }
  return 16 / 9;
}

function schedulePopup(s: Session) {
  if (s.popup !== 'hidden') return;
  s.popup = 'pending';
  const immediate = performance.now() - lastHiddenAt < REOPEN_WINDOW_MS;
  const reveal = () => {
    s.timer = undefined;
    if (session !== s || s.popup !== 'pending') return;
    // Measured when it appears: the row may have moved during the delay
    if (!s.el.isConnected) {
      s.popup = 'hidden';
      return;
    }
    const r = s.el.getBoundingClientRect();
    s.anchor = { top: r.top, bottom: r.bottom, left: r.left };
    s.aspect = popupAspect(s);
    s.popup = 'shown';
    if (immediate) {
      s.visible = true;
    } else {
      // Mounted transparent first, then faded in
      s.raf = requestAnimationFrame(() => {
        s.raf = undefined;
        if (session !== s || s.popup !== 'shown') return;
        s.visible = true;
        popupSignal.bump();
      });
    }
    popupSignal.bump();
  };
  if (immediate) reveal();
  else s.timer = window.setTimeout(reveal, SHOW_DELAY_MS);
}

function beginSession(el: HTMLElement, bar: HTMLDivElement | null, item: MediaItem, thumb: MediaThumb | null, mode: Exclude<RowMode, 'none'>): number {
  if (session) endSession(session.token);
  ensureInit();
  const mediaKey = `${normPath(item.path)}|${item.modified ?? 0}`;
  const frozen: MediaItem = { ...item, frames: item.frames ? item.frames.slice() : undefined };
  const slotKeys =
    item.kind === 'sequence'
      ? (frozen.frames ?? []).map(f => `${normPath(joinPath(item.path, f.name))}|${f.modified}`)
      : [];
  const s: Session = {
    token: ++tokenCounter,
    el,
    bar,
    item: frozen,
    thumb,
    mode,
    mediaKey,
    slotKeys,
    slotKeysSet: new Set(slotKeys),
    slot: 0,
    reqId: null,
    reqDone: false,
    failed: new Set(),
    srcWidth: null,
    srcHeight: null,
    popup: 'hidden',
    visible: false,
    anchor: null,
    aspect: 16 / 9,
    timer: undefined,
    raf: undefined,
  };
  session = s;
  if (mode === 'scrub') {
    syncVideoSlotKeys(s);
    startScrubRequest(s);
  }
  schedulePopup(s);
  popupSignal.bump();
  return s.token;
}

/** Pointer left the row or the row went away: the Rust job is cancelled */
function endSession(token: number) {
  const s = session;
  if (!s || s.token !== token) return;
  hidePopup(s, true);
  resetBar(s.bar);
  cancelRequest(s);
  session = null;
  popupSignal.bump();
}

/**
 * A row the pointer moved into whose session hasn't started yet: too early after entering (a timer runs),
 * or nothing to show yet (its thumbnail or ffmpeg arrives later — no timer, the row retries).
 * One for the whole app, like the session; a new one replaces the old.
 */
let pendingStart: { owner: object; timer: number | undefined } | null = null;

function setPendingStart(owner: object, timer: number | undefined) {
  if (pendingStart && pendingStart.owner !== owner) clearPendingStart();
  if (pendingStart?.timer !== undefined) window.clearTimeout(pendingStart.timer);
  pendingStart = { owner, timer };
}

function clearPendingStart(owner?: object) {
  if (!pendingStart || (owner && pendingStart.owner !== owner)) return;
  if (pendingStart.timer !== undefined) window.clearTimeout(pendingStart.timer);
  pendingStart = null;
}

/** Press, scroll, window blur: popup hidden, bar reset; the Rust job keeps going (its frames are useful) */
function suspendActive() {
  // A start that hasn't happened yet is dropped too: a press or a scroll means "not this row now"
  clearPendingStart();
  const s = session;
  if (!s || s.popup === 'hidden') {
    if (s) resetBar(s.bar);
    return;
  }
  hidePopup(s, false);
  resetBar(s.bar);
  popupSignal.bump();
}

function setSessionSlot(token: number, slot: number) {
  const s = session;
  if (!s || s.token !== token || s.slot === slot) return;
  s.slot = slot;
  if (s.popup === 'shown') popupSignal.bump();
}

function updateSessionThumb(token: number, thumb: MediaThumb | null) {
  const s = session;
  if (!s || s.token !== token || !thumb || s.thumb === thumb) return;
  s.thumb = thumb;
  if (s.popup === 'shown') popupSignal.bump();
}

// ---------------------------------------------------------------------------------------------
// Popup view (MediaPreviewHost)
// ---------------------------------------------------------------------------------------------
export interface MediaPopupView {
  mode: 'popup' | 'scrub' | 'hint';
  kind: MediaKind;
  name: string;
  anchor: HoverAnchor;
  visible: boolean;
  /** Width / height of the picture box (fixed for the session) */
  aspect: number;
  /** Picture to show: the current slot, else the nearest loaded one, else the thumbnail */
  src: string | null;
  /** Source pixel size when known */
  width: number | null;
  height: number | null;
  /** File size, bytes, when known */
  size: number | null;
  /** Video: time of the shown frame and the total */
  timeMs: number | null;
  durationMs: number | null;
  /** Sequence: frame number of the current slot and the total count */
  frameNumber: number | null;
  frameCount: number | null;
}

export function subscribeMediaPopup(listener: () => void) {
  return popupSignal.subscribe(listener);
}

export function getMediaPopupVersion() {
  return popupSignal.get();
}

/** Current popup content, or null when nothing is shown */
export function getMediaPopupView(): MediaPopupView | null {
  const s = session;
  if (!s || s.popup !== 'shown' || !s.anchor) return null;
  const item = s.item;
  const view: MediaPopupView = {
    mode: s.mode,
    kind: item.kind,
    name: item.name,
    anchor: s.anchor,
    visible: s.visible,
    aspect: s.aspect,
    src: s.thumb?.dataUrl ?? null,
    width: s.thumb?.srcWidth ?? null,
    height: s.thumb?.srcHeight ?? null,
    size: item.size ?? s.thumb?.size ?? null,
    timeMs: null,
    durationMs: null,
    frameNumber: null,
    frameCount: null,
  };
  if (s.mode !== 'scrub') return view;

  syncVideoSlotKeys(s);
  const n = s.slotKeys.length;
  const slot = Math.max(0, Math.min(n - 1, s.slot));
  let shown: FrameEntry | undefined;
  let shownSlot = slot;
  for (let d = 0; d < n && !shown; d++) {
    for (const i of d === 0 ? [slot] : [slot - d, slot + d]) {
      if (i < 0 || i >= n) continue;
      const entry = frames.get(s.slotKeys[i]);
      if (entry) {
        shown = entry;
        shownSlot = i;
        break;
      }
    }
  }
  if (shown) view.src = shown.dataUrl;

  if (item.kind === 'video') {
    const meta = videoMeta.get(s.mediaKey);
    if (meta) {
      view.width = meta.width;
      view.height = meta.height;
      view.durationMs = meta.durationMs;
      if (shown?.timeMs != null) view.timeMs = shown.timeMs;
      else if (meta.durationMs != null) view.timeMs = n > 1 ? (meta.durationMs * shownSlot) / (n - 1) : 0;
    }
  } else {
    if (s.srcWidth && s.srcHeight) {
      view.width = s.srcWidth;
      view.height = s.srcHeight;
    }
    // The frame actually on screen (the nearest loaded one while the current slot is on its way)
    view.frameNumber = shown?.frame ?? item.frames?.[shown ? shownSlot : slot]?.frame ?? null;
    view.frameCount = item.frameCount ?? item.frames?.length ?? null;
  }
  return view;
}

// ---------------------------------------------------------------------------------------------
// Row wiring
// ---------------------------------------------------------------------------------------------
function rowModeOf(item: MediaItem | null, thumb: MediaThumb | null, tools: ToolsAvailability): RowMode {
  if (!item) return 'none';
  switch (item.kind) {
    case 'image':
      return thumb ? 'popup' : 'none';
    case 'sequence': {
      const count = item.frames?.length ?? 0;
      if (!thumb) return 'none';
      return count >= 2 ? 'scrub' : 'popup';
    }
    case 'video':
      if (tools === 'no') return 'hint';
      return thumb && tools === 'yes' ? 'scrub' : 'none';
  }
}

/** Identity of what a row previews: a different value ends a running session */
function itemIdentity(item: MediaItem | null): string {
  if (!item) return '';
  return `${item.kind}|${normPath(item.path)}`;
}

/** Scrub + hover popup wiring for one row. `item` null: nothing (row behaves as before) */
export function useScrubRow(item: MediaItem | null, thumb: MediaThumb | null): ScrubRowBinding {
  useEffect(ensureInit, []);
  const enabled = useFilePreviewsEnabled();
  const tools = useSyncExternalStore(toolsSignal.subscribe, toolsAvailability);
  const effectiveItem = enabled ? item : null;
  const mode = rowModeOf(effectiveItem, thumb, tools);
  const barRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;

  const live = useRef({ item: effectiveItem, thumb, mode });
  live.current = { item: effectiveItem, thumb, mode };
  // el / x: the row element and pointer position of the last real move, kept for a start that comes later
  // (a timer or a late thumbnail) — React clears event.currentTarget after the handler
  const row = useRef({ enteredAt: 0, token: 0, el: null as HTMLElement | null, x: 0 });

  const ctl = useMemo(() => {
    /** Scrub position from the pointer: playback bar and the slot shown in the popup */
    const applyScrub = (s: Session, el: HTMLElement, clientX: number) => {
      if (s.mode !== 'scrub') return;
      const r = el.getBoundingClientRect();
      const ratio = r.width > 0 ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0;
      const n = slotCount(s);
      const bar = barRef.current;
      if (bar) {
        bar.style.transform = `scaleX(${ratio})`;
        bar.style.opacity = '1';
      }
      setSessionSlot(s.token, Math.max(0, Math.min(n - 1, Math.floor(ratio * n))));
    };

    /** Starts this row's session if it can preview now and is still under the pointer. True: running */
    const tryStart = (): boolean => {
      const r = row.current;
      if (r.token && session?.token === r.token) return true;
      const { item: it, thumb: th, mode: m } = live.current;
      if (!it || m === 'none' || !r.el) return false;
      // A scroll while waiting may have moved another row under the pointer
      if (!r.el.isConnected || !r.el.matches(':hover')) return false;
      if (useContextMenuStore.getState().activeMenu !== null) return false;
      r.token = beginSession(r.el, barRef.current, it, th, m);
      if (session) applyScrub(session, r.el, r.x);
      return true;
    };

    const rowHandlers: ScrubRowBinding['rowHandlers'] = {
      onMouseEnter: () => {
        row.current.enteredAt = performance.now();
      },
      onMouseMove: (e) => {
        if (!live.current.item) return;
        // Moves with a button held (a drag, a selection) never scrub
        if (e.buttons !== 0) return;
        const r = row.current;
        let s = session;
        if (!s || s.token !== r.token) {
          // A list that moved under a resting pointer starts nothing: only real movement does
          if (!(e.movementX || e.movementY)) return;
          const now = performance.now();
          if (!r.enteredAt) r.enteredAt = now; // entered without a mouseenter (row mounted under the pointer)
          r.el = e.currentTarget;
          r.x = e.clientX;
          const wait = ENTER_SETTLE_MS - (now - r.enteredAt);
          if (wait > 0) {
            // Too early — and the pointer may stop right here, with no further move: finish on a timer
            if (pendingStart?.owner !== r || pendingStart.timer === undefined) {
              setPendingStart(r, window.setTimeout(() => {
                if (pendingStart?.owner !== r) return;
                pendingStart.timer = undefined; // still waiting (no timer) if there is nothing to show yet
                if (tryStart()) clearPendingStart(r);
              }, wait));
            }
            return;
          }
          if (!tryStart()) {
            // Nothing to show yet (thumbnail / ffmpeg still coming): start when it arrives
            if (pendingStart?.owner !== r) setPendingStart(r, undefined);
            return;
          }
          clearPendingStart(r);
          s = session;
          if (!s) return;
        } else if (s.popup === 'hidden') {
          // After a press / scroll / blur: real movement brings the popup back
          if (!(e.movementX || e.movementY)) return;
          if (useContextMenuStore.getState().activeMenu !== null) return;
          schedulePopup(s);
        }
        applyScrub(s, e.currentTarget, e.clientX);
      },
      onMouseLeave: () => {
        const r = row.current;
        clearPendingStart(r);
        r.enteredAt = 0;
        r.el = null;
        if (r.token) endSession(r.token);
        r.token = 0;
        resetBar(barRef.current);
      },
      onMouseDown: () => {
        clearPendingStart(row.current);
        if (row.current.token && session?.token === row.current.token) suspendActive();
        resetBar(barRef.current);
      },
    };
    return { tryStart, rowHandlers };
  }, []);

  const identity = itemIdentity(effectiveItem);
  // Another file in this row, or it can't preview any more: end its session
  useEffect(() => {
    const token = row.current.token;
    if (token && (mode === 'none' || session?.token !== token || itemIdentity(session.item) !== identity)) {
      endSession(token);
      row.current.token = 0;
    }
  }, [identity, mode]);

  // The thumbnail (or ffmpeg) arrived while the pointer rests on the row after moving in: start now
  useEffect(() => {
    const p = pendingStart;
    if (mode !== 'none' && p?.owner === row.current && p.timer === undefined && ctl.tryStart()) {
      clearPendingStart(row.current);
    }
  }, [mode, ctl]);

  useEffect(() => {
    if (row.current.token) updateSessionThumb(row.current.token, thumb);
  }, [thumb]);

  // Unmount (row removed or re-parented): end its session — a stale token does nothing
  useEffect(() => () => {
    clearPendingStart(row.current);
    if (row.current.token) endSession(row.current.token);
    row.current.token = 0;
  }, []);

  return { rowHandlers: ctl.rowHandlers, barRef, scrubbable: mode === 'scrub' };
}
