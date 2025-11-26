/**
 * File Naming Utility
 * Handles project file naming conventions
 * Format: PROJECT_SCENE_SHOT_v001.ext or PROJECT_SCENE_SHOT_CONTEXT_v001.ext
 * Example: LION_RUNB_010_v010.blend or LION_RUNB_010_ASSET_v001.blend
 */

// Constants
export const SHOT_DIGITS = 3;
export const VERSION_DIGITS = 3;

// Interface for file name components
export interface FileNameComponents {
  projectName: string;
  sceneName: string;
  shotNumber: number;
  specialContext?: string;
  version: number;
  extension?: string;
}

/**
 * Normalize string for file name (remove spaces, uppercase)
 */
function normalize(str: string): string {
  return str.replace(/\s+/g, '').toUpperCase();
}

/**
 * Build full file name from components
 * @returns File name like: PROJECT_SCENE_SHOT_v001.ext or PROJECT_SCENE_SHOT_CONTEXT_v001.ext
 */
export function buildFileName(components: FileNameComponents): string {
  const base = getBaseName(components);
  const versionStr = `v${components.version.toString().padStart(VERSION_DIGITS, '0')}`;

  if (!components.extension) {
    return `${base}_${versionStr}`;
  }

  const ext = components.extension.startsWith('.')
    ? components.extension.substring(1)
    : components.extension;

  return `${base}_${versionStr}.${ext}`;
}

/**
 * Get base name without version and extension
 * @returns Base name like: PROJECT_SCENE_SHOT or PROJECT_SCENE_SHOT_CONTEXT
 */
export function getBaseName(components: FileNameComponents): string {
  const projectName = normalize(components.projectName);
  const sceneName = normalize(components.sceneName);
  const shotStr = `SH${components.shotNumber.toString().padStart(SHOT_DIGITS, '0')}`;

  if (components.specialContext) {
    const context = normalize(components.specialContext);
    return `${projectName}_${sceneName}_${shotStr}_${context}`;
  }

  return `${projectName}_${sceneName}_${shotStr}`;
}

/**
 * Parse file name into components
 * @returns Components or null if parsing fails
 */
export function parseFileName(filename: string): FileNameComponents | null {
  try {
    // Remove extension
    const lastDotIndex = filename.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
    const extension = lastDotIndex > 0 ? filename.substring(lastDotIndex + 1) : undefined;

    // Extract version: _v001, _v010, etc
    const versionMatch = nameWithoutExt.match(/_v(\d+)$/);
    if (!versionMatch) return null;

    const version = parseInt(versionMatch[1], 10);

    // Remove version part to get base
    const base = nameWithoutExt.substring(0, versionMatch.index);

    // Split by underscore
    const parts = base.split('_');

    // Special case: OLD format for special contexts (PROJECT_CONTEXT)
    // Example: POND_COMP, POND_ASSET, PROJECT_RENDER, etc.
    // Check if it's a 2-part name where second part is all uppercase (likely a context)
    if (parts.length === 2 && parts[1] === parts[1].toUpperCase() && parts[1].length >= 2) {
      // Check if second part is likely a context (not a number)
      if (isNaN(parseInt(parts[1], 10))) {
        return {
          projectName: parts[0],
          sceneName: 'MAIN', // Use MAIN as default scene for old format
          shotNumber: 1, // Virtual shot number
          specialContext: parts[1],
          version,
          extension,
        };
      }
    }

    // Need at least PROJECT_SCENE_SHOT (3 parts)
    if (parts.length < 3) return null;

    // Last part before optional context is shot number (SH + 3 digits or just 3 digits for backward compatibility)
    const shotPartIndex = parts.length > 3 ? parts.length - 2 : parts.length - 1;
    const shotPart = parts[shotPartIndex];

    // Remove "SH" prefix if present (new format), otherwise parse directly (old format)
    const shotNumber = shotPart.startsWith('SH')
      ? parseInt(shotPart.substring(2), 10)
      : parseInt(shotPart, 10);

    if (isNaN(shotNumber)) return null;

    // Special context is the last part if exists
    const specialContext = parts.length > 3 ? parts[parts.length - 1] : undefined;

    // Scene is everything between project and shot
    const sceneEndIndex = parts.length > 3 ? parts.length - 2 : parts.length - 1;
    const sceneName = parts.slice(1, sceneEndIndex).join('_');
    const projectName = parts[0];

    return {
      projectName,
      sceneName,
      shotNumber,
      specialContext,
      version,
      extension,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get project pattern for filtering: PROJECT_
 */
export function getProjectPattern(projectName: string): string {
  return `${normalize(projectName)}_`;
}

/**
 * Get scene pattern for filtering: PROJECT_SCENE_
 */
export function getScenePattern(projectName: string, sceneName: string): string {
  return `${normalize(projectName)}_${normalize(sceneName)}_`;
}

/**
 * Get shot pattern for filtering: PROJECT_SCENE_SHOT_
 */
export function getShotPattern(
  projectName: string,
  sceneName: string,
  shotNumber: number
): string {
  const shotStr = `SH${shotNumber.toString().padStart(SHOT_DIGITS, '0')}`;
  return `${normalize(projectName)}_${normalize(sceneName)}_${shotStr}_`;
}

/**
 * Check if filename is versioned (contains _v followed by digits)
 */
export function isVersioned(filename: string): boolean {
  return /_v\d+/.test(filename);
}

/**
 * Extract version number from filename
 * @returns Version number or null if not found
 */
export function extractVersion(filename: string): number | null {
  const match = filename.match(/_v(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract shot number from filename
 * @returns Shot number or null if not found
 */
export function extractShotNumber(filename: string): number | null {
  const components = parseFileName(filename);
  return components ? components.shotNumber : null;
}

/**
 * Extract scene name from filename
 * @returns Scene name or null if not found
 */
export function extractSceneName(filename: string): string | null {
  const components = parseFileName(filename);
  return components ? components.sceneName : null;
}

/**
 * Extract project name from filename
 * @returns Project name or null if not found
 */
export function extractProjectName(filename: string): string | null {
  const components = parseFileName(filename);
  return components ? components.projectName : null;
}
