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
  'Blender', 'Houdini', 'After Effects', 'Photoshop',
  // 'Maya',
  // 'Cinema 4D', 'Substance', 'Unreal', 'Unity', 'ZBrush', 'Marmoset'
] as const;

// Selecting one in ComposeSoftwareModal auto-enables it in the project.
// If the key can't be derived from the name, add it to nameToKey in ComposeSoftwareModal.
export const COMPOSE_SOFTWARE_OPTIONS = ['After Effects'] as const;
