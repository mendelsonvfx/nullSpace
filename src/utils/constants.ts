export type ProjectStatus = 'active' | 'archived' | 'completed' | 'paused';

export const STATUS_COLORS = {
  active: 'bg-green-500',
  paused: 'bg-yellow-500',
  completed: 'bg-blue-500',
  archived: 'bg-gray-500'
} as const;

export const STATUS_LABELS = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived'
} as const;

export const STATUS_CYCLE: ProjectStatus[] = ['active', 'paused', 'completed'];

export const SOFTWARE_OPTIONS = [
  'Blender', 'Houdini', 'After Effects', 'Photoshop', 'Unreal Engine', 'Cinema 4D', 'Substance Painter',
  'DaVinci Resolve', // projects without shots only — see isComposeOnlySoftware
  // 'Maya',
  // 'Unity', 'ZBrush', 'Marmoset'
] as const;

// Selecting one in ComposeSoftwareModal auto-enables it in the project (except COMPOSE_ONLY_SOFTWARE).
// If the key can't be derived from the name, add it to nameToKey in ComposeSoftwareModal.
export const COMPOSE_SOFTWARE_OPTIONS = ['After Effects', 'DaVinci Resolve'] as const;

// Keys of software that shot-based projects use only in Global Compose: never added to the project's
// software list, own flat folder (no scenes) created when chosen in Compose, launch button only in Compose.
// Projects without shots have no Compose and treat it as regular software
export const COMPOSE_ONLY_SOFTWARE: ReadonlySet<string> = new Set(['davinci']);

export const isComposeOnlySoftware = (key: string, shotBased: boolean): boolean =>
  shotBased && COMPOSE_ONLY_SOFTWARE.has(key);
