import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { indexedDBThumbnailCache } from '../utils/indexedDBCache';

/** Thumbnail from the `get_image_thumbnail` command (src-tauri/src/image_thumbnail.rs) */
export interface ImageThumb {
  data_url: string;
  /** Size of the source image */
  width: number;
  height: number;
  /** File size, bytes */
  size: number;
}

/** Image formats that get a thumbnail in Project Structure */
const THUMB_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tga', 'tif', 'tiff', 'exr', 'hdr', 'psd', 'psb']);

export function isThumbnailImage(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot > 0 && THUMB_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

const CACHE_TYPE = 'tree_thumb';
/** Requests to Rust at a time; Rust itself decodes two at a time */
const MAX_IN_FLIGHT = 4;

/** One cache entry per file: Windows paths are case-insensitive and may mix separators */
const keyOf = (path: string) => path.replace(/\\/g, '/').toLowerCase();

interface Entry {
  /** File's last-modified time (ms) the thumbnail was made from: a newer file means a new thumbnail */
  modified: number;
  /** null: the file has no thumbnail (unsupported, unreadable); not asked again this session */
  thumb: ImageThumb | null;
}

const memory = new Map<string, Entry>();

/** Thumbnail already loaded for this file version, if any (hover preview reads it synchronously) */
export function getCachedThumbnail(path: string, modified: number | undefined): ImageThumb | null {
  const entry = memory.get(keyOf(path));
  return entry && entry.modified === (modified ?? 0) ? entry.thumb : null;
}

/** Settings > Clear Cache empties IndexedDB; this drops what's held in memory too */
export function clearTreeThumbMemory() {
  memory.clear();
}

// Request queue: rows that scroll out of view before their turn are dropped
interface Task {
  cancelled: boolean;
  run: () => Promise<void>;
}
let inFlight = 0;
const waiting: Task[] = [];

function pump() {
  while (inFlight < MAX_IN_FLIGHT && waiting.length > 0) {
    const task = waiting.shift()!;
    if (task.cancelled) continue;
    inFlight++;
    task.run().finally(() => {
      inFlight--;
      pump();
    });
  }
}

function enqueue(task: Task) {
  waiting.push(task);
  pump();
}

/**
 * Thumbnail of an image file for Project Structure, or null while loading / when there is none.
 * Memory first, then IndexedDB (both checked against the file's `modified`), then Rust.
 * Loads only while `active` (row on screen, all parent folders open); a cached one shows regardless.
 */
export function useImageThumbnail(path: string, modified: number | undefined, active: boolean): ImageThumb | null {
  const key = keyOf(path);
  const version = modified ?? 0;
  const [state, setState] = useState<{ key: string; version: number; thumb: ImageThumb | null }>(() => ({
    key,
    version,
    thumb: getCachedThumbnail(path, modified),
  }));

  useEffect(() => {
    const hit = memory.get(key);
    if (hit && hit.modified === version) {
      setState({ key, version, thumb: hit.thumb });
      return;
    }
    if (!active) return;

    let cancelled = false;
    let task: Task | null = null;
    const store = (thumb: ImageThumb | null) => {
      memory.set(key, { modified: version, thumb });
      if (!cancelled) setState({ key, version, thumb });
    };

    indexedDBThumbnailCache.get(key, CACHE_TYPE)
      .catch(() => undefined)
      .then((stored) => {
        if (stored) {
          try {
            const entry = JSON.parse(stored) as Entry;
            if (entry.modified === version && entry.thumb) {
              store(entry.thumb);
              return;
            }
          } catch {
            // Unreadable entry: make a new one
          }
        }
        if (cancelled) return;
        task = {
          cancelled: false,
          run: async () => {
            let thumb: ImageThumb | null = null;
            try {
              thumb = await invoke<ImageThumb | null>('get_image_thumbnail', { path });
            } catch {
              thumb = null;
            }
            store(thumb);
            // Only real thumbnails are kept across sessions: a file that failed (still being written,
            // locked) gets another try next time
            if (thumb) {
              indexedDBThumbnailCache.set(key, CACHE_TYPE, JSON.stringify({ modified: version, thumb }))
                .catch(() => {});
            }
          },
        };
        enqueue(task);
      });

    return () => {
      cancelled = true;
      if (task) task.cancelled = true;
    };
  }, [key, path, version, active]);

  // A different file than the one in state (row reused for another path): don't show the old picture
  if (state.key !== key) return getCachedThumbnail(path, modified);
  // Same file, newer version still loading: the previous picture stays until the new one is ready
  return state.thumb;
}
