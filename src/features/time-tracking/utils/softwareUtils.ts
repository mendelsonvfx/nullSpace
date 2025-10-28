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

  return normalized as SoftwareName;
};

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
    'substance': 'Substance',
    'unreal': 'Unreal Engine',
    'unity': 'Unity',
    'zbrush': 'ZBrush',
    'marmoset': 'Marmoset Toolbag'
  };

  return displayNames[normalized] || normalized;
};

/**
 * Get color for software (for charts)
 */
export const getSoftwareColor = (software: SoftwareName): string => {
  const colors: Record<SoftwareName, string> = {
    'blender': '#E87D0D',
    'houdini': '#FF4713',
    'after-effects': '#9999FF',
    'photoshop': '#31A8FF',
    'maya': '#0FADED',
    'cinema4d': '#0099D8',
    'substance': '#F17A3A',
    'unreal': '#313131',
    'unity': '#000000',
    'zbrush': '#F37021',
    'marmoset': '#FF6B00'
  };

  return colors[software] || '#6366f1';
};
