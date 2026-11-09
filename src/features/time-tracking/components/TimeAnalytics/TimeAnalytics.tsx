// src/features/time-tracking/components/TimeAnalytics/TimeAnalytics.tsx
import React, { useMemo } from 'react';
import { useTimeStatsStore } from '../../stores/timeStatsStore';
import { StatsCards } from './StatsCards';
import { SoftwareBreakdown } from './SoftwareBreakdown';
import { WeeklyTimeline } from './WeeklyTimeline';
import { StatsGrid } from './StatsGrid';
import { TopProjectsByTime } from './TopProjectsByTime';
import {
  getLastNWeeks,
  getTotalMinutesForWeek,
  getMostProductiveDay,
  calculateWeekOverWeekChange
} from '../../utils';
import { normalizeSoftwareName } from '../../utils/softwareUtils';
import type { Project, SoftwareName } from '../../../../types/project';
import type { TimeEntry } from '../../types/timeEntry';
import { Clock } from 'lucide-react';

interface TimeAnalyticsProps {
  projects: Project[];
  baseCurrency?: string;
  totalRevenue?: number;
}

/**
 * Time Analytics Dashboard
 * Shows comprehensive time tracking statistics and visualizations
 */
export const TimeAnalytics: React.FC<TimeAnalyticsProps> = ({
  projects,
  baseCurrency = 'USD',
  totalRevenue = 0
}) => {
  // Get global software statistics (persisted)
  const softwareMinutes = useTimeStatsStore(state => state.softwareMinutes);

  // Collect all time entries from all projects, with deduplication. Every figure here is built from
  // durationMinutes/softwareMinutes, which change once a minute through `projects`; the live seconds of
  // the timer store aren't read, so this doesn't subscribe to it (it changes every second)
  const allTimeEntries = useMemo(() => {
    const entriesMap = new Map<string, TimeEntry>();

    projects.forEach(p => {
      (p.timeEntries || []).forEach(entry => {
        // Only add if not already present (deduplication)
        if (!entriesMap.has(entry.id)) {
          entriesMap.set(entry.id, entry);
        }
      });
    });

    return Array.from(entriesMap.values());
  }, [projects]);

  // Calculate total time from GLOBAL statistics (focused time only - persists after project deletion)
  const totalFocusedMinutes = useMemo(() => {
    return Object.values(softwareMinutes).reduce((sum, minutes) => sum + minutes, 0);
  }, [softwareMinutes]);

  // Calculate total time from ALL projects (all time spent, focused + unfocused)
  const totalMinutesAllProjects = useMemo(() => {
    return projects.reduce((sum, p) => {
      // totalMinutesSpent now includes current WorkSession time (no need to add elapsedMinutes)
      return sum + (p.totalMinutesSpent || 0);
    }, 0);
  }, [projects]);

  // Use focused minutes for software breakdown and stats (backward compatible)
  const totalMinutes = totalFocusedMinutes;

  // Sort software by time (descending) - use GLOBAL statistics
  // Normalize software names to merge duplicates (e.g., "aftereffects" + "after-effects")
  const sortedSoftware = useMemo(() => {
    // Normalize and merge duplicate keys
    const normalized = new Map<SoftwareName, number>();

    Object.entries(softwareMinutes).forEach(([software, minutes]) => {
      const normalizedName = normalizeSoftwareName(software);
      normalized.set(
        normalizedName,
        (normalized.get(normalizedName) || 0) + minutes
      );
    });

    return Array.from(normalized.entries())
      .filter(([_, minutes]) => minutes > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [softwareMinutes]);

  // Calculate weekly data (last 12 weeks)
  const weeklyData = useMemo(() => {
    const weeks = getLastNWeeks(12);

    return weeks.map((weekStart, index) => {
      const weekMinutes = getTotalMinutesForWeek(allTimeEntries, weekStart);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7); // weekEnd is exclusive (start of next week)

      // Generate relative week label
      const weeksAgo = weeks.length - 1 - index;
      let label: string;
      if (weeksAgo === 0) {
        label = 'This Week';
      } else if (weeksAgo === 1) {
        label = 'Last Week';
      } else {
        label = `${weeksAgo}w ago`;
      }

      return {
        weekStart,
        weekEnd,
        minutes: weekMinutes,
        hours: weekMinutes / 60,
        label
      };
    });
  }, [allTimeEntries]);

  // Calculate this week vs last week
  const thisWeekMinutes = weeklyData[weeklyData.length - 1]?.minutes || 0;
  const lastWeekMinutes = weeklyData[weeklyData.length - 2]?.minutes || 0;
  const weekOverWeekChange = calculateWeekOverWeekChange(thisWeekMinutes, lastWeekMinutes);

  // Calculate average hours per day (based on days with activity)
  const averageHoursPerDay = useMemo(() => {
    const daysWithActivity = new Set<string>();
    let totalMinutesFromEntries = 0;

    allTimeEntries.forEach(entry => {
      const date = new Date(entry.startTime);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      daysWithActivity.add(dateKey);
      totalMinutesFromEntries += entry.durationMinutes;
    });

    if (daysWithActivity.size === 0) return 0;
    return totalMinutesFromEntries / 60 / daysWithActivity.size;
  }, [allTimeEntries]);

  // Get most productive day
  const mostProductiveDay = useMemo(() => {
    if (allTimeEntries.length === 0) {
      return { dayName: 'N/A', averageHours: 0 };
    }
    return getMostProductiveDay(allTimeEntries);
  }, [allTimeEntries]);

  // Calculate Top 3 projects by time spent
  const topProjectsByTime = useMemo(() => {
    return projects
      .map(p => ({
        id: p.id,
        name: p.name,
        // totalMinutesSpent now includes current WorkSession time (no need to add elapsedMinutes)
        totalMinutes: p.totalMinutesSpent || 0,
        color: p.color
      }))
      .filter(p => p.totalMinutes > 0)
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 3);
  }, [projects]);

  // Calculate global hourly rate: Total Revenue / Total Time
  // Simple and accurate - includes all revenue (paid, prepaid, manual transactions)
  // divided by all time tracked across all projects
  const globalHourlyRate = useMemo(() => {
    if (totalMinutesAllProjects === 0) return 0;
    return totalRevenue / (totalMinutesAllProjects / 60);
  }, [totalRevenue, totalMinutesAllProjects]);

  // Same revenue over the focused time of these same projects (the global softwareMinutes span all
  // categories and deleted projects). Below an hour the rate isn't meaningful, so it isn't shown
  const focusedHourlyRate = useMemo(() => {
    const focusedMinutes = allTimeEntries.reduce((sum, entry) => sum + (entry.softwareMinutes || 0), 0);
    return focusedMinutes >= 60 && totalRevenue > 0 ? totalRevenue / (focusedMinutes / 60) : undefined;
  }, [allTimeEntries, totalRevenue]);

  // Empty state
  if (totalMinutes === 0) {
    return (
      <div className="mt-12">
        <h2 className="text-2xl font-medium text-zinc-400 mb-6">Time Analytics</h2>
        <div data-time-analytics className="bg-card-bg rounded-xl p-12 border border-border-primary text-center">
          <Clock className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500 text-lg">No time tracked yet</p>
          <p className="text-zinc-600 text-sm mt-2">
            Launch software from your projects to start tracking time automatically
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-medium text-zinc-400 mb-6">Time Analytics</h2>

      {/* Stats Cards */}
      <StatsCards
        totalMinutesAllProjects={totalMinutesAllProjects}
        totalFocusedMinutes={totalFocusedMinutes}
        globalHourlyRate={globalHourlyRate}
        focusedHourlyRate={focusedHourlyRate}
        baseCurrency={baseCurrency}
      />

      {/* Software Breakdown */}
      <SoftwareBreakdown
        sortedSoftware={sortedSoftware}
        totalMinutes={totalMinutes}
      />

      {/* Weekly Timeline */}
      <WeeklyTimeline weeklyData={weeklyData} />

      {/* Stats Grid */}
      <StatsGrid
        thisWeekMinutes={thisWeekMinutes}
        lastWeekMinutes={lastWeekMinutes}
        twoWeeksAgoMinutes={weeklyData[weeklyData.length - 3]?.minutes || 0}
        threeWeeksAgoMinutes={weeklyData[weeklyData.length - 4]?.minutes || 0}
        weekOverWeekChange={weekOverWeekChange}
        averageHoursPerDay={averageHoursPerDay}
        mostProductiveDay={mostProductiveDay}
      />

      {/* Top 3 Projects by Time Spent */}
      <TopProjectsByTime topProjectsByTime={topProjectsByTime} />
    </div>
  );
};
