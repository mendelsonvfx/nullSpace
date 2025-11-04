// src/features/time-tracking/types/session.ts

/**
 * Active session from backend (Rust)
 * Matches the ActiveSession struct in time_tracking.rs
 */
export interface ActiveSession {
  /** Time entry ID */
  entry_id: string;

  /** Project ID */
  project_id: string;

  /** Project path on filesystem */
  project_path: string;

  /** Optional shot ID */
  shot_id: string | null;

  /** Software name */
  software: string;

  /** Process ID */
  pid: number;

  /** ISO timestamp when session started */
  start_time: string;

  /** ISO timestamp of last activity */
  last_activity_time: string;

  /** ISO timestamp of last CPU check */
  last_cpu_check: string;

  /** Minutes counted for software stats (focused only) */
  software_minutes: number;

  /** Whether process is still alive */
  process_alive: boolean;

  /** Last CPU usage percentage */
  last_cpu_usage: number;

  /** Last time user interacted with window */
  last_input_time: string;

  /** ISO timestamp when window disappeared (for adaptive grace period tracking) */
  window_disappeared_at: string | null;
}

/**
 * Parameters for starting a backend session
 */
export interface StartSessionParams {
  entryId: string;
  projectId: string;
  projectPath: string;
  sceneId?: string;
  shotId?: string;
  software: string;
  pid: number;
}

/**
 * Session statistics summary
 */
export interface SessionStats {
  /** Total active sessions */
  totalSessions: number;

  /** Sessions by software */
  bySoftware: Record<string, number>;

  /** Total minutes tracked */
  totalMinutes: number;

  /** Software minutes (focused only) */
  softwareMinutes: number;
}
