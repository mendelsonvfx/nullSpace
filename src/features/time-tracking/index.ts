// src/features/time-tracking/index.ts
// PUBLIC API for time-tracking feature module

// ============================================================================
// STORES
// ============================================================================
export { useTimeTrackingStore } from './stores/timeTrackingStore';
export { useTimeStatsStore } from './stores/timeStatsStore';

// ============================================================================
// HOOKS (React Integration)
// ============================================================================
export { useTimeTracking } from './hooks/useTimeTracking';
export { useTimerSeconds } from './hooks/useTimerSeconds';

// ============================================================================
// COMPONENTS
// ============================================================================
export { InlineTimer } from './components/InlineTimer';
export { TimeInfoBar } from './components/TimeInfoBar';
export { TimeAnalytics } from './components/TimeAnalytics';
export { ManualTimeEntryModal } from './components/ManualTimeEntry';

// ============================================================================
// SERVICES (Advanced usage)
// ============================================================================
export { SessionService } from './services/SessionService';
export { TimerService } from './services/TimerService';
export { StatsService } from './services/StatsService';

// ============================================================================
// UTILITIES
// ============================================================================
// Time formatters
export {
  formatTime,
  formatTimeDetailed,
  parseTimeInput
} from './utils/timeFormatters';

// Week utilities
export {
  getWeekStart,
  getWeekEnd,
  getLastNWeeks,
  getWeekNumber
} from './utils/weekUtils';

// Software utilities
export {
  normalizeSoftwareName,
  formatSoftwareName,
  getSoftwareColor
} from './utils/softwareUtils';

// Time calculations
export {
  groupTimeEntriesByWeek,
  groupTimeEntriesBySoftware,
  getEntriesForWeek,
  getTotalMinutesForWeek,
  getMostProductiveDay,
  calculateHourlyRate,
  calculateProjectedRevenue,
  calculateWeekOverWeekChange
} from './utils/timeCalculations';

// ============================================================================
// TYPES
// ============================================================================
export type {
  TimeEntry,
  CreateTimeEntryParams,
  ManualTimeEntryParams
} from './types/timeEntry';

export type {
  ActiveSession,
  StartSessionParams,
  SessionStats
} from './types/session';

export type {
  SoftwareStats,
  WeeklyTimeData,
  SoftwareBreakdown,
  ProductiveDayStats,
  TimeAnalyticsSummary
} from './types/stats';
