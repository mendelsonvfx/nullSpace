// src/features/time-tracking/utils/timeFormatters.ts

/**
 * Format minutes to "Xh Ym" format
 * @example formatTime(125) => "2h 05m"
 * @example formatTime(30) => "0h 30m"
 * @example formatTime(120) => "2h 00m"
 */
export const formatTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
};

/**
 * Format minutes to compact format without leading zeros
 * @example formatTimeCompact(125) => "2h 5m"
 * @example formatTimeCompact(30) => "30m"
 * @example formatTimeCompact(120) => "2h"
 */
export const formatTimeCompact = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins}m`;
  }

  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
};

/**
 * Format minutes to detailed format "X hours Y minutes"
 * @example formatTimeDetailed(125) => "2 hours 5 minutes"
 * @example formatTimeDetailed(1) => "1 minute"
 * @example formatTimeDetailed(60) => "1 hour"
 */
export const formatTimeDetailed = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  const hoursPart = hours > 0 ? `${hours} hour${hours !== 1 ? 's' : ''}` : '';
  const minsPart = mins > 0 ? `${mins} minute${mins !== 1 ? 's' : ''}` : '';

  if (hoursPart && minsPart) {
    return `${hoursPart} ${minsPart}`;
  }

  return hoursPart || minsPart || '0 minutes';
};

/**
 * Parse time input (e.g., "2h 30m" or "150m") to minutes
 * @example parseTimeInput("2h 30m") => 150
 * @example parseTimeInput("90m") => 90
 * @example parseTimeInput("1h") => 60
 */
export const parseTimeInput = (input: string): number => {
  const hoursMatch = input.match(/(\d+)h/);
  const minutesMatch = input.match(/(\d+)m/);

  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;

  return (hours * 60) + minutes;
};
