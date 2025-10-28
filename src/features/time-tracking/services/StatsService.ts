// src/features/time-tracking/services/StatsService.ts
import { useTimeStatsStore } from '../stores/timeStatsStore';
import type { SoftwareName } from '../../../types/project';
import type { TimeEntry } from '../types/timeEntry';
import { normalizeSoftwareName } from '../utils/softwareUtils';

/**
 * Service for managing global time tracking statistics
 * Provides abstraction layer over timeStatsStore
 */
export class StatsService {
  /**
   * Add minutes to software's total time
   * @param software - Software name
   * @param minutes - Minutes to add
   */
  static addSoftwareTime(software: SoftwareName | string, minutes: number): void {
    const { addSoftwareTime } = useTimeStatsStore.getState();
    const normalized = normalizeSoftwareName(software);
    addSoftwareTime(normalized, minutes);
    console.log(`[StatsService] Added ${minutes}m to ${normalized}`);
  }

  /**
   * Get total minutes for a software
   * @param software - Software name
   * @returns Total minutes tracked for this software
   */
  static getSoftwareTime(software: SoftwareName): number {
    const { getSoftwareTime } = useTimeStatsStore.getState();
    return getSoftwareTime(software);
  }

  /**
   * Get all software statistics
   * @returns Record of software name to minutes
   */
  static getAllStats(): Record<SoftwareName, number> {
    const { softwareMinutes } = useTimeStatsStore.getState();
    return { ...softwareMinutes };
  }

  /**
   * Clear all statistics (for testing/debugging)
   */
  static clearStats(): void {
    const { resetStats } = useTimeStatsStore.getState();
    resetStats();
    console.log('[StatsService] ✅ All statistics cleared');
  }

  /**
   * Synchronize statistics from project time entries
   * Rebuilds global stats from all project time entries
   * @param allTimeEntries - Array of all time entries from all projects
   */
  static syncFromTimeEntries(allTimeEntries: TimeEntry[]): void {
    console.log('[StatsService] Synchronizing statistics from time entries...');

    // Reset stats first
    this.clearStats();

    const softwareTotals = new Map<SoftwareName, number>();
    let totalEntries = 0;

    // Aggregate time from all entries that should be counted
    for (const entry of allTimeEntries) {
      // Only count:
      // - Completed entries (not active)
      // - Entries with softwareMinutes > 0 (focused time)
      // - Entries marked to be counted in stats
      const focusedMinutes = entry.softwareMinutes || 0;
      if (!entry.isActive && focusedMinutes > 0 && entry.countedInStats !== false) {
        const software = normalizeSoftwareName(entry.software);
        const current = softwareTotals.get(software) || 0;
        // Use softwareMinutes (focused time) instead of durationMinutes (total time)
        softwareTotals.set(software, current + focusedMinutes);
        totalEntries++;
      }
    }

    // Update global statistics
    softwareTotals.forEach((minutes, software) => {
      this.addSoftwareTime(software, minutes);
      console.log(`[StatsService] ${software}: ${minutes}m (focused time)`);
    });

    console.log(`[StatsService] ✅ Synchronized ${totalEntries} entries`);
  }

  /**
   * Get total time across all software
   * @returns Total minutes tracked
   */
  static getTotalTime(): number {
    const stats = this.getAllStats();
    return Object.values(stats).reduce((sum, minutes) => sum + minutes, 0);
  }

  /**
   * Get software breakdown with percentages
   * @returns Array of software stats sorted by time (descending)
   */
  static getSoftwareBreakdown(): Array<{
    software: SoftwareName;
    minutes: number;
    percentage: number;
  }> {
    const stats = this.getAllStats();
    const total = this.getTotalTime();

    if (total === 0) return [];

    return Object.entries(stats)
      .filter(([_, minutes]) => minutes > 0)
      .map(([software, minutes]) => ({
        software: software as SoftwareName,
        minutes,
        percentage: (minutes / total) * 100
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }
}
