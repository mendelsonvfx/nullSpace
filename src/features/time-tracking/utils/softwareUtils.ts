// src/features/time-tracking/utils/softwareUtils.ts
import type { SoftwareName } from '../../../types/project';

/**
 * Normalize software name to canonical form
 * Handles legacy/variant names
 */
export const normalizeSoftwareName = (software: string): SoftwareName => {
  const normalized = software.toLowerCase().replace(/\s+/g, '-');

  // Map variants to canonical names
  if (normalized === 'after-effects' || normalized === 'aftereffects' || normalized === 'after effects') {
    return 'after-effects';
  }
  // 'Unreal Engine' (display name), 'UnrealEngine' (folder name / output label), 'UE'
  if (normalized === 'unreal-engine' || normalized === 'unrealengine' || normalized === 'ue') {
    return 'unreal';
  }
  // Display names that don't collapse to their key on their own
  if (normalized === 'cinema-4d') return 'cinema4d';
  if (normalized === 'substance-painter' || normalized === 'substance-designer') return 'substance';
  if (normalized === 'marmoset-toolbag') return 'marmoset';
  if (normalized === 'davinci-resolve' || normalized === 'davinciresolve') return 'davinci';

  return normalized as SoftwareName;
};

/**
 * Software without file versioning (one project file, opened as is) — Versions Overview has nothing to show.
 * DaVinci Resolve isn't here: its project lives in Resolve's database, but .drp snapshots are versions.
 */
export const NON_VERSIONED_SOFTWARE: ReadonlySet<SoftwareName> = new Set<SoftwareName>(['unreal']);

/** True if at least one of the project's software saves versioned files */
export const hasVersionedSoftware = (software: { name: string }[]): boolean =>
  software.some(sw => !NON_VERSIONED_SOFTWARE.has(normalizeSoftwareName(sw.name)));

/**
 * Format software name for display (capitalize first letter)
 */
export const formatSoftwareName = (software: SoftwareName | string): string => {
  // Normalize software name first to handle any variants
  const normalized = normalizeSoftwareName(software);

  const displayNames: Record<SoftwareName, string> = {
    'blender': 'Blender',
    'houdini': 'Houdini',
    'after-effects': 'After Effects',
    'photoshop': 'Photoshop',
    'maya': 'Maya',
    'cinema4d': 'Cinema 4D',
    'substance': 'Substance Painter',
    'unreal': 'Unreal Engine',
    'unity': 'Unity',
    'zbrush': 'ZBrush',
    'marmoset': 'Marmoset Toolbag',
    'davinci': 'DaVinci Resolve'
  };

  return displayNames[normalized] || normalized;
};

/**
 * Get color for software (for charts)
 */
export const getSoftwareColor = (software: SoftwareName | string): string => {
  // Normalize like formatSoftwareName: entries may store display names ('after effects')
  const normalized = normalizeSoftwareName(software);

  const colors: Record<SoftwareName, string> = {
    'blender': '#E87D0D',
    'houdini': '#FF4713',
    'after-effects': '#9999FF',
    'photoshop': '#31A8FF',
    'maya': '#0FADED',
    'cinema4d': '#5C6BE0',
    'substance': '#99E83F',
    'unreal': '#C8CDD6',
    'unity': '#000000',
    'zbrush': '#F37021',
    'marmoset': '#FF6B00',
    'davinci': '#13D4F2'
  };

  return colors[normalized] || '#6366f1';
};
