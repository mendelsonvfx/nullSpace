/**
 * File Naming Utility
 * Handles project file naming conventions
 * Format: PROJECT_SCENE_SHOT_v001.ext or PROJECT_SCENE_SHOT_CONTEXT_v001.ext
 * Example: LION_RUNB_010_v010.blend or LION_RUNB_010_ASSET_v001.blend
 */

// Constants
export const SHOT_DIGITS = 3;
export const VERSION_DIGITS = 3;

// Project name goes into every file name (PROJECT_SCENE_SHOT_v001). Allow only what the Rust sanitizer keeps
// (minus '_', the field separator) so TS patterns and Rust-built names always match and the folder is valid on Windows.
// Must match validate_project_name in src-tauri/src/main.rs
const PROJECT_NAME_CHAR = /[A-Za-z0-9 -]/;
export const PROJECT_NAME_HINT = 'Only Latin letters, digits, spaces and hyphens allowed';
export const isAllowedProjectNameChar = (ch: string) => PROJECT_NAME_CHAR.test(ch);
export const isValidProjectName = (name: string) => [...name].every(isAllowedProjectNameChar);
export const stripInvalidProjectNameChars = (name: string) => [...name].filter(isAllowedProjectNameChar).join('');

// Interface for file name components
export interface FileNameComponents {
  projectName: string;
  sceneName: string;
  shotNumber: number;
  specialContext?: string;
  assetName?: string; // Custom name for asset/compose contexts (e.g., "CAR", "01")
  version: number;
  extension?: string;
  suffix?: string; // Suffix after version (e.g., "TESTEXPORT" from "_v001_TESTEXPORT")
}

/**
 * Name as it appears in folder and file names: only [A-Za-z0-9_-], uppercase.
 * Must match file_naming::sanitize_folder_name in Rust, which builds every folder and file name
 */
export function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
}


interface SceneRef {
  id: string;
  name: string;
  number: number;
}

/** Scene number taken from the first digits of its name ("Scene 005" → 5), else `fallback` */
export function sceneNumberFromName(name: string, fallback: number): number {
  const match = name.match(/\d+/);
  return match ? parseInt(match[0], 10) : fallback;
}

/**
 * Why a scene name can't be used, or null if it can. The name becomes the scene folder in every software
 * folder, and the scene number (from its digits) keys delete_scene_files and `.thumbnails/sceneNNN`.
 * `sceneId` is the scene being renamed (excluded from the duplicate checks).
 */
export function validateSceneName(name: string, scenes: SceneRef[], sceneId?: string): string | null {
  const folder = sanitizeFolderName(name);
  if (!folder) return 'Scene name needs at least one Latin letter or digit';
  if (folder.startsWith('_')) return 'Scene name can\'t start with "_"';

  const others = scenes.filter(s => s.id !== sceneId);
  if (others.some(s => sanitizeFolderName(s.name) === folder)) {
    return `Another scene already uses the folder name ${folder}`;
  }
  const current = scenes.find(s => s.id === sceneId);
  const number = sceneNumberFromName(name, current?.number ?? 0);
  if (number > 0 && others.some(s => s.number === number)) {
    return `Scene number ${number} is already used by another scene`;
  }
  return null;
}

/** Number and default name for a new scene: max number + 1, skipping numbers and folders already taken */
export function nextSceneNumber(scenes: SceneRef[]): number {
  const numbers = new Set(scenes.map(s => s.number));
  const folders = new Set(scenes.map(s => sanitizeFolderName(s.name)));
  let n = Math.max(0, ...scenes.map(s => s.number)) + 1;
  while (numbers.has(n) || folders.has(sanitizeFolderName(defaultSceneName(n)))) n++;
  return n;
}

export const defaultSceneName = (n: number) => `Scene ${n.toString().padStart(3, '0')}`;

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
  const projectName = sanitizeFolderName(components.projectName);
  const sceneName = sanitizeFolderName(components.sceneName);
  const shotStr = `SH${components.shotNumber.toString().padStart(SHOT_DIGITS, '0')}`;

  if (components.specialContext) {
    const context = sanitizeFolderName(components.specialContext);
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

    // Extract version: _v001, _v010, etc (with optional suffix after)
    // Suffix can be separated by underscore or space: _v001_TESTEXPORT or _v001 TESTEXPORT
    const versionMatch = nameWithoutExt.match(/_v(\d+)(?:[\s_](.+))?$/);
    if (!versionMatch) return null;

    const suffix = versionMatch[2] || undefined;

    const version = parseInt(versionMatch[1], 10);

    // Remove version part to get base
    const base = nameWithoutExt.substring(0, versionMatch.index);

    // Check for _ASSET_NAME or _COMP_NAME pattern (asset/compose with custom name)
    // assetName never contains underscore (validated in UI), so this regex is reliable
    const assetMatch = base.match(/^(.+)_ASSET_([A-Z0-9]+)$/);
    if (assetMatch) {
      return {
        projectName: assetMatch[1],
        sceneName: 'MAIN',
        shotNumber: 1,
        specialContext: 'ASSET',
        assetName: assetMatch[2],
        version,
        extension,
      };
    }

    const compMatch = base.match(/^(.+)_COMP_([A-Z0-9]+)$/);
    if (compMatch) {
      return {
        projectName: compMatch[1],
        sceneName: 'MAIN',
        shotNumber: 1,
        specialContext: 'COMP',
        assetName: compMatch[2],
        version,
        extension,
      };
    }

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
      suffix,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get project pattern for filtering: PROJECT_
 */
export function getProjectPattern(projectName: string): string {
  return `${sanitizeFolderName(projectName)}_`;
}

/**
 * Get scene pattern for filtering: PROJECT_SCENE_
 */
export function getScenePattern(projectName: string, sceneName: string): string {
  return `${sanitizeFolderName(projectName)}_${sanitizeFolderName(sceneName)}_`;
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
  return `${sanitizeFolderName(projectName)}_${sanitizeFolderName(sceneName)}_${shotStr}_`;
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

/**
 * Check if filename has a suffix after version number
 * @returns true if suffix exists (e.g., "TESTEXPORT" in "_v001_TESTEXPORT")
 */
export function hasSuffix(filename: string): boolean {
  const components = parseFileName(filename);
  return components?.suffix != null && components.suffix.length > 0;
}
