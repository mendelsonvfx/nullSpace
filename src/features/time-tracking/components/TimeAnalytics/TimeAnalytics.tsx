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
import type { Project } from '../../../../types/project';
import type { TimeEntry } from '../../types/timeEntry';
import { Clock } from 'lucide-react';

interface TimeAnalyticsProps {
  projects: Project[];
  baseCurrency?: string;
  convertCurrency?: (amount: number, from: string, to: string) => number;
}

/**
 * Time Analytics Dashboard
 * Shows comprehensive time tracking statistics and visualizations
 */
export const TimeAnalytics: React.FC<TimeAnalyticsProps> = ({
  projects,
  baseCurrency = 'USD',
  convertCurrency
}) => {
  // Get global software statistics (persisted)
  const { softwareMinutes } = useTimeStatsStore();

  // Collect all time entries from all projects
  const allTimeEntries = useMemo(() => {
    return projects.flatMap(p => p.timeEntries || []) as TimeEntry[];
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
  const sortedSoftware = useMemo(() => {
    return Object.entries(softwareMinutes)
      .filter(([_, minutes]) => minutes > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [softwareMinutes]);

  // Calculate weekly data (last 12 weeks)
  const weeklyData = useMemo(() => {
    const weeks = getLastNWeeks(12);

    return weeks.map((weekStart, index) => {
      const weekMinutes = getTotalMinutesForWeek(allTimeEntries, weekStart);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

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

    allTimeEntries.forEach(entry => {
      const date = new Date(entry.startTime);
      const dateKey = date.toISOString().split('T')[0];
      daysWithActivity.add(dateKey);
    });

    if (daysWithActivity.size === 0) return 0;
    return totalMinutes / 60 / daysWithActivity.size;
  }, [allTimeEntries, totalMinutes]);

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

  // Calculate global hourly rate based on ALL time spent across ALL projects
  const globalHourlyRate = useMemo(() => {
    const paidProjects = projects.filter(p => p.paymentStatus === 'paid' && p.cost);

    // Convert all revenues to base currency if converter is provided
    const totalRevenue = paidProjects.reduce((sum, p) => {
      const projectCost = p.cost || 0;
      const projectCurrency = p.currency || 'USD';

      if (convertCurrency && projectCurrency !== baseCurrency) {
        return sum + convertCurrency(projectCost, projectCurrency, baseCurrency);
      }

      return sum + projectCost;
    }, 0);

    // Use total time from ALL projects (not just paid ones)
    if (totalMinutesAllProjects === 0) return 0;
    return totalRevenue / (totalMinutesAllProjects / 60);
  }, [projects, baseCurrency, convertCurrency, totalMinutesAllProjects]);

  // Empty state
  if (totalMinutes === 0) {
    return (
      <div className="mt-12">
        <h2 className="text-2xl font-medium text-zinc-400 mb-6">Time Analytics</h2>
        <div data-time-analytics className="bg-zinc-900 rounded-xl p-12 border border-zinc-800 text-center">
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
