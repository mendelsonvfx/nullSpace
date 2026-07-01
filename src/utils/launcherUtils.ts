import { invoke } from '@tauri-apps/api/tauri';
import type { CustomLauncherItem } from '../types/launcher';

// ---- Internal color helpers ----

function getHslSaturation(r: number, g: number, b: number): number {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hNorm = h / 360;
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, hNorm) * 255);
  const b = Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ---- Public API ----

export async function getExeIcon(path: string): Promise<string | undefined> {
  try {
    const raw = await invoke<string>('get_exe_icon', { path });
    return raw.startsWith('data:image/') ? raw : undefined;
  } catch {
    return undefined;
  }
}

export async function sampleColorFromDataUrl(dataUrl: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const SIZE = 32;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve('#6366f1'); return; }
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

      let wR = 0, wG = 0, wB = 0, totalW = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128) continue;
        const sat = getHslSaturation(r, g, b);
        if (sat < 0.15) continue;
        wR += r * sat;
        wG += g * sat;
        wB += b * sat;
        totalW += sat;
      }

      if (totalW === 0) { resolve('#6366f1'); return; }

      const avgR = wR / totalW, avgG = wG / totalW, avgB = wB / totalW;
      const [h, outS] = rgbToHsl(avgR, avgG, avgB);
      if (outS < 0.1) { resolve('#6366f1'); return; }
      resolve(hslToHex(h, 0.75, 0.55));
    };
    img.onerror = () => resolve('#6366f1');
    img.src = dataUrl;
  });
}

// ---- localStorage helpers ----

export function getCustomItems(): CustomLauncherItem[] {
  try {
    return JSON.parse(localStorage.getItem('launcherCustomItems') ?? '[]');
  } catch {
    return [];
  }
}

export function saveCustomItems(items: CustomLauncherItem[]): void {
  localStorage.setItem('launcherCustomItems', JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('launcherItems:updated'));
}

export function getSoftwareEnabled(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('launcherSoftwareEnabled') ?? '{}');
  } catch {
    return {};
  }
}

export function saveSoftwareEnabled(enabled: Record<string, boolean>): void {
  localStorage.setItem('launcherSoftwareEnabled', JSON.stringify(enabled));
  window.dispatchEvent(new CustomEvent('launcherItems:updated'));
}

export function extractNameFromPath(path: string): string {
  const raw = path.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') ?? 'App';
  return raw
    .replace(/[-_.]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
