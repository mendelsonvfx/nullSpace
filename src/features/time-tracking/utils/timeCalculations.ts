// src/features/time-tracking/utils/timeCalculations.ts
import type { TimeEntry } from '../types/timeEntry';
import type { SoftwareName } from '../../../types/project';
import type { ProductiveDayStats } from '../types/stats';
import { getWeekStart, getWeekEnd } from './weekUtils';

/**
 * Get local date string (YYYY-MM-DD) for timezone-safe comparisons
 */
const getLocalDateString = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * Get minutes from entry - handles both active and completed entries
 * For active: uses elapsedSeconds, for completed: uses durationMinutes
 */
const getEntryMinutes = (entry: TimeEntry): number => {
  return entry.durationMinutes;
};

/**
 * Group time entries by week
 * Returns a map of week start date (local YYYY-MM-DD) to total minutes
 * Uses local dates to avoid timezone issues
 */
export const groupTimeEntriesByWeek = (entries: TimeEntry[]): Map<string, number> => {
  const byWeek = new Map<string, number>();

  entries.forEach(entry => {
    const weekStart = getWeekStart(new Date(entry.startTime));
    // Use local date string instead of UTC ISO string
    const weekKey = getLocalDateString(weekStart);
    const minutes = getEntryMinutes(entry);
    byWeek.set(weekKey, (byWeek.get(weekKey) || 0) + minutes);
  });

  return byWeek;
};

/**
 * Group time entries by software
 * Returns a map of software name to total minutes
 */
export const groupTimeEntriesBySoftware = (entries: TimeEntry[]): Map<SoftwareName, number> => {
  const bySoftware = new Map<SoftwareName, number>();

  entries.forEach(entry => {
    // Include both completed and active entries
    const normalizedSoftware = entry.software.toLowerCase() as SoftwareName;
    const minutes = getEntryMinutes(entry);
    bySoftware.set(normalizedSoftware, (bySoftware.get(normalizedSoftware) || 0) + minutes);
  });

  return bySoftware;
};

/**
 * Get time entries for a specific week (includes both active and completed)
 * Uses local date comparison to avoid timezone issues
 */
export const getEntriesForWeek = (entries: TimeEntry[], weekStart: Date): TimeEntry[] => {
  const weekEnd = getWeekEnd(weekStart);
  // Use local date strings for comparison to avoid UTC timezone shifts
  const weekStartStr = getLocalDateString(weekStart);
  const weekEndStr = getLocalDateString(weekEnd);

  return entries.filter(entry => {
    const entryDate = new Date(entry.startTime);
    const entryStr = getLocalDateString(entryDate);
    return entryStr >= weekStartStr && entryStr < weekEndStr;
  });
};

/**
 * Calculate total minutes for a specific week (includes active sessions)
 */
export const getTotalMinutesForWeek = (entries: TimeEntry[], weekStart: Date): number => {
  const weekEntries = getEntriesForWeek(entries, weekStart);
  return weekEntries.reduce((sum, entry) => sum + getEntryMinutes(entry), 0);
};

/**
 * Get the most productive day of the week (0 = Sunday, 1 = Monday, etc.)
 * Includes both active and completed sessions
 */
export const getMostProductiveDay = (entries: TimeEntry[]): ProductiveDayStats => {
  const dayTotals = new Map<number, { totalMinutes: number; distinctDays: Set<string> }>();

  entries.forEach(entry => {
    const date = new Date(entry.startTime);
    const day = date.getDay();
    const dateKey = getLocalDateString(date);
    const current = dayTotals.get(day) || { totalMinutes: 0, distinctDays: new Set<string>() };
    const minutes = getEntryMinutes(entry);

    current.totalMinutes += minutes;
    current.distinctDays.add(dateKey);
    dayTotals.set(day, current);
  });

  let maxDay = 0;
  let maxAverage = 0;

  dayTotals.forEach((data, day) => {
    const average = data.totalMinutes / data.distinctDays.size;
    if (average > maxAverage) {
      maxAverage = average;
      maxDay = day;
    }
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    day: maxDay,
    dayName: dayNames[maxDay],
    averageHours: maxAverage / 60
  };
};

/**
 * Calculate hourly rate from total cost and minutes worked
 */
export const calculateHourlyRate = (cost: number, minutes: number): number => {
  if (minutes === 0) return 0;
  return cost / (minutes / 60);
};

/**
 * Calculate projected revenue based on target hourly rate and actual minutes worked
 */
export const calculateProjectedRevenue = (targetRate: number, actualMinutes: number): number => {
  return targetRate * (actualMinutes / 60);
};

/**
 * Calculate week-over-week percentage change
 */
export const calculateWeekOverWeekChange = (currentWeekMinutes: number, lastWeekMinutes: number): number => {
  if (lastWeekMinutes === 0) return currentWeekMinutes > 0 ? 100 : 0;
  return ((currentWeekMinutes - lastWeekMinutes) / lastWeekMinutes) * 100;
};
