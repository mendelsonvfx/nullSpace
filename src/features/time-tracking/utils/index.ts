// src/features/time-tracking/utils/index.ts

// Time formatters
export {
  formatTime,
  formatTimeCompact,
  formatTimeDetailed,
  parseTimeInput
} from './timeFormatters';

// Week utilities
export {
  getWeekStart,
  getWeekEnd,
  getLastNWeeks,
  getWeekNumber
} from './weekUtils';

// Software utilities
export {
  normalizeSoftwareName,
  formatSoftwareName,
  getSoftwareColor
} from './softwareUtils';

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
} from './timeCalculations';
