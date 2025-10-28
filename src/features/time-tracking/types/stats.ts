// src/features/time-tracking/types/stats.ts
import type { SoftwareName } from '../../../types/project';

/**
 * Global software statistics (persisted)
 */
export interface SoftwareStats {
  /** Map of software name to total minutes (focused time only) */
  softwareMinutes: Record<SoftwareName, number>;
}

/**
 * Weekly time data for analytics
 */
export interface WeeklyTimeData {
  /** Start of the week */
  weekStart: Date;

  /** End of the week */
  weekEnd: Date;

  /** Total minutes for this week */
  minutes: number;

  /** Total hours for this week */
  hours: number;

  /** Label for display (e.g., "Jan 15") */
  label: string;
}

/**
 * Software breakdown for analytics
 */
export interface SoftwareBreakdown {
  /** Software name */
  software: SoftwareName;

  /** Total minutes */
  minutes: number;

  /** Percentage of total time */
  percentage: number;

  /** Color for charts */
  color: string;
}

/**
 * Most productive day statistics
 */
export interface ProductiveDayStats {
  /** Day of week (0 = Sunday, 1 = Monday, etc.) */
  day: number;

  /** Day name */
  dayName: string;

  /** Average hours on this day */
  averageHours: number;
}

/**
 * Time analytics summary
 */
export interface TimeAnalyticsSummary {
  /** Total minutes tracked across all time */
  totalMinutes: number;

  /** Total hours tracked */
  totalHours: number;

  /** This week's minutes */
  thisWeekMinutes: number;

  /** Last week's minutes */
  lastWeekMinutes: number;

  /** Week-over-week change percentage */
  weekOverWeekChange: number;

  /** Average hours per day (on active days) */
  averageHoursPerDay: number;

  /** Most productive day */
  mostProductiveDay: ProductiveDayStats;

  /** Global hourly rate (if applicable) */
  globalHourlyRate?: number;

  /** Software breakdown */
  softwareBreakdown: SoftwareBreakdown[];

  /** Weekly timeline data (last N weeks) */
  weeklyData: WeeklyTimeData[];
}
