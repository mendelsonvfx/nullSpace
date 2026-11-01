// src/features/time-tracking/utils/softwareUtils.ts
import type { SoftwareName } from '../../../types/project';
import { SOFTWARE_META, getSoftwareMeta } from '../../../utils/softwareMeta';

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
 * Display name of a software key or name (from SOFTWARE_META)
 */
export const formatSoftwareName = (software: SoftwareName | string): string => {
  // Normalize software name first to handle any variants
  const normalized = normalizeSoftwareName(software);
  return SOFTWARE_META[normalized]?.display ?? normalized;
};

/**
 * Brand color of a software (charts, launch cards) — from SOFTWARE_META
 */
export const getSoftwareColor = (software: SoftwareName | string): string =>
  // Normalize like formatSoftwareName: entries may store display names ('after effects')
  getSoftwareMeta(normalizeSoftwareName(software)).brandColor;
