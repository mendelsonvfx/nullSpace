import type { SoftwareName } from '../types/project';

export interface SoftwareMetaEntry {
  display: string;
  abbr: string;
  // The one software color: launch card glow, charts, tree folder tint (keep it light on the #141414 UI)
  brandColor: string;
}

// Single source of software display names and colors (Record over SoftwareName: a new key must be added here).
// No logos: icons come from the user's installed exe (utils/softwareIcons)
export const SOFTWARE_META: Record<SoftwareName, SoftwareMetaEntry> = {
  'blender':       { display: 'Blender',       abbr: 'B',  brandColor: '#E87D0D' },
  'houdini':       { display: 'Houdini',        abbr: 'H',  brandColor: '#FF4713' },
  'after-effects': { display: 'After Effects',  abbr: 'Ae', brandColor: '#9999FF' },
  'photoshop':     { display: 'Photoshop',      abbr: 'Ps', brandColor: '#31A8FF' },
  'cinema4d':      { display: 'Cinema 4D',      abbr: 'C4', brandColor: '#5C6BE0' },
  'maya':          { display: 'Maya',            abbr: 'Ma', brandColor: '#0FADED' },
  'substance':     { display: 'Substance Painter', abbr: 'Pt', brandColor: '#99E83F' },
  'unreal':        { display: 'Unreal Engine',   abbr: 'UE', brandColor: '#C8CDD6' },
  'unity':         { display: 'Unity',           abbr: 'Un', brandColor: '#B8BCC4' },
  'zbrush':        { display: 'ZBrush',          abbr: 'Zb', brandColor: '#F37021' },
  'marmoset':      { display: 'Marmoset Toolbag', abbr: 'Mt', brandColor: '#FF6B00' },
  'davinci':       { display: 'DaVinci Resolve', abbr: 'DR', brandColor: '#13D4F2' },
};

// Letter badge when there's no exe icon: one neutral look for every app. Brand gradients with brand-colored
// letters ("Ps" on blue, "Pt" in green) copy the vendors' own icons, so badges never use them
export const SOFTWARE_BADGE = {
  background: 'linear-gradient(160deg,#1e1e26,#13131a)',
  color: '#a1a1aa',
  shadow: 'rgba(0,0,0,.30)',
} as const;

export function getSoftwareMeta(key: string): SoftwareMetaEntry {
  const entry = (SOFTWARE_META as Record<string, SoftwareMetaEntry>)[key];
  if (entry) return entry;
  return {
    brandColor: '#6366f1',
    display: key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' '),
    abbr: key.slice(0, 2).toUpperCase(),
  };
}
