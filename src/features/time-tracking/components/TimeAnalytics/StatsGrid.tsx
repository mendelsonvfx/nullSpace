// src/features/time-tracking/components/TimeAnalytics/StatsGrid.tsx
import React from 'react';
import { formatTime } from '../../utils/timeFormatters';
import { TrendingUp, TrendingDown, Clock, Calendar } from 'lucide-react';

interface StatsGridProps {
  thisWeekMinutes: number;
  lastWeekMinutes: number;
  twoWeeksAgoMinutes: number;
  threeWeeksAgoMinutes: number;
  weekOverWeekChange: number;
  averageHoursPerDay: number;
  mostProductiveDay: {
    dayName: string;
    averageHours: number;
  };
}

/**
 * Stats grid showing This Week, Avg per Day, Most Productive
 */
export const StatsGrid: React.FC<StatsGridProps> = ({
  thisWeekMinutes,
  lastWeekMinutes,
  twoWeeksAgoMinutes,
  threeWeeksAgoMinutes,
  weekOverWeekChange,
  averageHoursPerDay,
  mostProductiveDay
}) => {
  return (
    <div className="grid grid-cols-3 gap-6">
      {/* This Week */}
      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-zinc-500">This Week</p>
          {weekOverWeekChange !== 0 && (
            <div
              className={`flex items-center gap-1 text-xs ${
                weekOverWeekChange > 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {weekOverWeekChange > 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {Math.abs(weekOverWeekChange).toFixed(0)}%
            </div>
          )}
        </div>
        <p className="text-3xl font-bold text-white">{formatTime(thisWeekMinutes)}</p>
        {lastWeekMinutes > 0 && (
          <p className="text-xs text-zinc-600 mt-1">
            vs {formatTime(lastWeekMinutes)} last week
          </p>
        )}
        {(() => {
          const diff = thisWeekMinutes - lastWeekMinutes;
          const diffHours = Math.abs(diff / 60);

          // Break after activity (2-3 weeks ago had hours, last week was 0, this week has hours)
          if (
            lastWeekMinutes === 0 &&
            thisWeekMinutes > 0 &&
            (twoWeeksAgoMinutes > 0 || threeWeeksAgoMinutes > 0)
          ) {
            return (
              <p className="text-xs text-purple-400 mt-2">
                How was your break? 😊
              </p>
            );
          }

          // First week (last week was 0, this week has hours)
          if (lastWeekMinutes === 0 && thisWeekMinutes > 0) {
            return (
              <p className="text-xs text-blue-400 mt-2">
                Is this your first week? 🎉
              </p>
            );
          }

          // Worked more this week
          if (diff > 0) {
            return (
              <p className="text-xs text-green-400 mt-2">
                {diffHours >= 1
                  ? `${diffHours.toFixed(1)}h more! Great progress`
                  : `${Math.round(diff)}m more! Keep it up`
                }
              </p>
            );
          }

          // Worked less this week
          if (diff < 0) {
            return (
              <p className="text-xs text-orange-400 mt-2">
                {diffHours >= 1
                  ? `${diffHours.toFixed(1)}h less than last week`
                  : `${Math.abs(Math.round(diff))}m less than last week`
                }
              </p>
            );
          }

          return null;
        })()}
      </div>

      {/* Average per Day */}
      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-zinc-500" />
          <p className="text-sm text-zinc-500">Avg per Day</p>
        </div>
        <p className="text-3xl font-bold text-white">
          {averageHoursPerDay.toFixed(1)}h
        </p>
        <p className="text-xs text-zinc-600 mt-1">on active days</p>
      </div>

      {/* Most Productive Day */}
      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-zinc-500" />
          <p className="text-sm text-zinc-500">Most Productive</p>
        </div>
        <p className="text-2xl font-bold text-white mb-1">
          {mostProductiveDay.dayName}
        </p>
        <p className="text-sm text-zinc-400">
          {mostProductiveDay.averageHours.toFixed(1)}h avg
        </p>
      </div>
    </div>
  );
};
