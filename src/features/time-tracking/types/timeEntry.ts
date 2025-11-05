// src/features/time-tracking/types/timeEntry.ts
import type { SoftwareName } from '../../../types/project';

/**
 * Time entry for a project
 * Represents a single tracking session (auto or manual)
 */
export interface TimeEntry {
  /** Unique identifier */
  id: string;

  /** Project this entry belongs to */
  projectId: string;

  /** Optional shot ID (for projects with shots) */
  shotId?: string;

  /** Software used during this session */
  software: SoftwareName;

  /** ISO timestamp when session started */
  startTime: string;

  /** ISO timestamp when session ended (undefined if active) */
  endTime?: string;

  /** Elapsed seconds for widget display (ticks every second) */
  elapsedSeconds: number;

  /** Total duration in minutes (all time, focused + unfocused) */
  durationMinutes: number;

  /** Minutes counted for software statistics (focused time only) */
  softwareMinutes?: number;

  /** WorkSession this entry belongs to (if active) */
  workSessionId?: string;

  /** Whether this session is currently active */
  isActive: boolean;

  /** Whether this was added manually (not auto-tracked) */
  isManual: boolean;

  /** Process ID (for auto-tracked sessions) */
  pid?: number;

  /** Whether to count this entry in software statistics */
  countedInStats?: boolean;

  /** Whether inline widget is visible (UI state) */
  widgetVisible?: boolean;

  /** Timeout ID for widget visibility (internal use) */
  _visibilityTimeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Parameters for creating a new time entry
 */
export interface CreateTimeEntryParams {
  projectId: string;
  shotId?: string;
  software: SoftwareName;
  durationMinutes?: number;
  isManual?: boolean;
  countedInStats?: boolean;
  startTime?: string;
}

/**
 * Parameters for manual time entry
 */
export interface ManualTimeEntryParams {
  projectId: string;
  software: SoftwareName;
  durationMinutes: number;
  date: string;
  shotId?: string;
  notes?: string;
  countInStats?: boolean;
}
