import type { SoftwareName } from '../types/project';

export interface SoftwareMetaEntry {
  display: string;
  abbr: string;
  gradient: string;
  shadow: string;
  textColor?: string;
  logoPath?: string;
  // The one software color: launch cards, charts, Settings abbreviations (keep it light on the #141414 UI)
  brandColor: string;
}

// Single source of software display names, colors and logos (Record over SoftwareName: a new key must be added here)
export const SOFTWARE_META: Record<SoftwareName, SoftwareMetaEntry> = {
  'blender':       { display: 'Blender',       abbr: 'B',  gradient: 'linear-gradient(160deg,#f08a1c,#e0700a)', shadow: 'rgba(232,125,13,.30)', logoPath: '/logos/blender.png',       brandColor: '#E87D0D' },
  'houdini':       { display: 'Houdini',        abbr: 'H',  gradient: 'linear-gradient(160deg,#ff5e2e,#f23d0c)', shadow: 'rgba(255,71,19,.28)',  logoPath: '/logos/houdini.png',       brandColor: '#FF4713' },
  'after-effects': { display: 'After Effects',  abbr: 'Ae', gradient: 'linear-gradient(160deg,#2a1a55,#160c34)', shadow: 'rgba(42,26,85,.40)',   logoPath: '/logos/after-effects.png', brandColor: '#9999FF', textColor: '#c9b6ff' },
  'photoshop':     { display: 'Photoshop',      abbr: 'Ps', gradient: 'linear-gradient(160deg,#1577d6,#0d5cae)', shadow: 'rgba(13,92,174,.32)',  logoPath: '/logos/photoshop.png',     brandColor: '#31A8FF' },
  'cinema4d':      { display: 'Cinema 4D',      abbr: 'C4', gradient: 'linear-gradient(160deg,#4652be,#2e3aa2)', shadow: 'rgba(46,58,162,.32)',  logoPath: '/logos/cinema4d.png',      brandColor: '#5C6BE0' },
  'maya':          { display: 'Maya',            abbr: 'Ma', gradient: 'linear-gradient(160deg,#0faded,#0a8db8)', shadow: 'rgba(15,173,237,.28)',                                       brandColor: '#0FADED' },
  'substance':     { display: 'Substance Painter', abbr: 'Pt', gradient: 'linear-gradient(160deg,#2a4204,#1e3101)', shadow: 'rgba(153,232,63,.20)', logoPath: '/logos/substance.png',     brandColor: '#99E83F', textColor: '#99E83F' },
  'unreal':        { display: 'Unreal Engine',   abbr: 'UE', gradient: 'linear-gradient(160deg,#313131,#1a1a1a)', shadow: 'rgba(0,0,0,.40)',      logoPath: '/logos/unreal.png',        brandColor: '#C8CDD6' },
  'unity':         { display: 'Unity',           abbr: 'Un', gradient: 'linear-gradient(160deg,#2d2d2d,#111111)', shadow: 'rgba(0,0,0,.35)',                                            brandColor: '#B8BCC4' },
  'zbrush':        { display: 'ZBrush',          abbr: 'Zb', gradient: 'linear-gradient(160deg,#f37021,#c05510)', shadow: 'rgba(243,112,33,.28)',                                       brandColor: '#F37021' },
  'marmoset':      { display: 'Marmoset Toolbag', abbr: 'Mt', gradient: 'linear-gradient(160deg,#2d5a8e,#1e3d61)', shadow: 'rgba(45,90,142,.30)',                                       brandColor: '#FF6B00' },
  'davinci':       { display: 'DaVinci Resolve', abbr: 'DR', gradient: 'linear-gradient(160deg,#22384f,#1e3044)', shadow: 'rgba(19,212,242,.20)', logoPath: '/logos/davinci.png',       brandColor: '#13D4F2', textColor: '#13D4F2' },
};

export function getSoftwareMeta(key: string): SoftwareMetaEntry {
  const entry = (SOFTWARE_META as Record<string, SoftwareMetaEntry>)[key];
  if (entry) return entry;
  return {
    gradient: 'linear-gradient(160deg,#1e1e26,#13131a)',
    shadow: 'rgba(0,0,0,.30)',
    brandColor: '#6366f1',
    display: key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' '),
    abbr: key.slice(0, 2).toUpperCase(),
  };
}
