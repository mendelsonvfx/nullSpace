// src/utils/clearAllData.ts
import { useProjectStore } from '../store/projectStore';
import { useTimeStatsStore, StatsService } from '../features/time-tracking';

/**
 * Clear all time tracking data from the application
 * This includes:
 * - All timeEntries from all projects
 * - totalMinutesSpent and currentProjectTime reset to 0
 * - All global software statistics
 */
export async function clearAllTimeTrackingData() {
  console.log('[ClearAllData] Starting full time data cleanup...');

  // 1. Clear all project time entries
  const { projects, updateProject } = useProjectStore.getState();

  for (const project of projects) {
    if (project.timeEntries && project.timeEntries.length > 0) {
      console.log(`[ClearAllData] Clearing ${project.timeEntries.length} time entries from "${project.name}"`);

      const updatedProject = {
        ...project,
        timeEntries: [],
        totalMinutesSpent: 0,
        currentProjectTime: 0,
        hourlyRate: undefined,
        updatedAt: new Date().toISOString()
      };

      await updateProject(updatedProject);
    }
  }

  // 2. Clear global software statistics
  useTimeStatsStore.getState().resetStats();

  console.log('[ClearAllData] ✅ All time tracking data has been cleared');
}
