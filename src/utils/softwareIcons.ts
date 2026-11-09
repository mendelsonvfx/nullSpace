import { useEffect, useSyncExternalStore } from 'react';
import { getExeIcon } from './launcherUtils';

// Software icons come from the user's own installed executables (nullSpace ships no third-party logos).
// One module-level store: every SoftwareIcon in the tree shares one listener and one extraction per exe.

const CACHE_KEY = 'softwareIconCache';

function readJson<T>(key: string, fallback: T): T {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function usableExePath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const trimmed = path.trim();
  return trimmed && trimmed.toLowerCase().endsWith('.exe') ? trimmed : undefined;
}

// Exe path -> PNG data URL. Read synchronously on load so icons show without a flicker after restart
let icons: Record<string, string> = readJson<Record<string, string>>(CACHE_KEY, {});
let paths: Record<string, string> = readJson<Record<string, string>>('softwarePaths', {});
// Failed this session (missing exe, drive offline): not retried until restart or a new path, never persisted
const failed = new Set<string>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

function persist() {
  // Keep only icons of currently configured paths, so old versions' exes don't pile up
  const configured = new Set(Object.values(paths).map(usableExePath).filter(Boolean) as string[]);
  const kept: Record<string, string> = {};
  for (const [p, url] of Object.entries(icons)) {
    if (configured.has(p)) kept[p] = url;
  }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(kept)); } catch { /* storage full or blocked */ }
}

function reloadPaths() {
  const next = readJson<Record<string, string>>('softwarePaths', {});
  if (JSON.stringify(next) === JSON.stringify(paths)) return;
  paths = next;
  emit();
}

function requestIcon(path: string) {
  if (icons[path] || failed.has(path) || inFlight.has(path)) return;
  inFlight.add(path);
  getExeIcon(path).then(url => {
    inFlight.delete(path);
    if (url) {
      icons = { ...icons, [path]: url };
      persist();
    } else {
      failed.add(path);
    }
    emit();
  });
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.addEventListener('softwarePaths:updated', reloadPaths);
    window.addEventListener('storage', reloadPaths);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('softwarePaths:updated', reloadPaths);
      window.removeEventListener('storage', reloadPaths);
    }
  };
}

/**
 * Icon of a built-in software, taken from its configured exe (Settings → Software paths).
 * `pathOverride` uses a path that isn't saved yet (Welcome setup). undefined → show the abbreviation badge.
 */
export function useSoftwareIcon(softwareKey: string, pathOverride?: string): string | undefined {
  const path = useSyncExternalStore(subscribe, () =>
    usableExePath(pathOverride !== undefined ? pathOverride : paths[softwareKey])
  );
  const icon = useSyncExternalStore(subscribe, () => (path ? icons[path] : undefined));

  useEffect(() => {
    if (path) requestIcon(path);
  }, [path]);

  return icon;
}
