// src/features/time-tracking/components/TimeAnalytics/WeeklyTimeline.tsx
import React, { useMemo, useState } from 'react';
import { formatTime } from '../../utils/timeFormatters';

interface WeekData {
  weekStart: Date;
  weekEnd: Date;
  minutes: number;
  hours: number;
  label: string;
}

interface WeeklyTimelineProps {
  weeklyData: WeekData[];
}

/**
 * Weekly timeline chart (last 12 weeks)
 */
export const WeeklyTimeline: React.FC<WeeklyTimelineProps> = ({ weeklyData }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Find max minutes for chart scaling (normalize to hours for consistency)
  const maxWeeklyMinutes = useMemo(() => {
    const max = Math.max(...weeklyData.map(w => w.minutes), 0);
    // Always normalize to at least 1 hour (60 minutes) for consistent scale
    const normalized = Math.max(max, 60);
    console.log('[WeeklyTimeline] weeklyData:', weeklyData);
    console.log('[WeeklyTimeline] maxWeeklyMinutes:', normalized, 'from actual max:', max);
    return normalized;
  }, [weeklyData]);

  return (
    <div data-time-analytics className="bg-zinc-900 rounded-xl p-8 border border-zinc-800 mb-6">
      <h3 className="text-lg font-semibold mb-6 text-zinc-200">
        Weekly Timeline (Last 12 Weeks)
      </h3>

      {/* Bar chart */}
      <div className="flex items-end justify-between gap-3">
        {weeklyData.map((week, index) => {
          // Calculate height percentage based on max minutes
          const heightPercent = maxWeeklyMinutes > 0 ? (week.minutes / maxWeeklyMinutes) * 100 : 0;
          const now = new Date();
          const isCurrentWeek = week.weekStart <= now && now < week.weekEnd;

          const isHovered = hoveredIndex === index;
          const isFaded = hoveredIndex !== null && !isHovered;

          return (
            <div
              key={index}
              className="flex flex-col items-center gap-3 group"
              style={{ flex: '1 1 0' }}
              onMouseEnter={() => {
                // Only trigger hover effect if this bar has minutes > 0
                if (week.minutes > 0) {
                  setHoveredIndex(index);
                }
              }}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Bar */}
              <div
                className="relative flex items-end justify-center"
                style={{ height: '240px', width: '100%' }}
              >
                {/* Background bar (подложка) */}
                <div
                  className="absolute bottom-0 w-8 h-full rounded-t-lg bg-zinc-800 opacity-20"
                />

                {/* Bar element */}
                <div
                  className={`w-8 rounded-t-lg transition-all duration-300 relative z-10 ${
                    week.minutes === 0
                      ? 'bg-zinc-800'
                      : isCurrentWeek
                        ? 'bg-gradient-to-t from-purple-600 via-purple-500 to-purple-400'
                        : 'bg-gradient-to-t from-zinc-700 via-zinc-600 to-zinc-500'
                  }`}
                  style={{
                    height: week.minutes === 0 ? '3px' : `${heightPercent}%`,
                    minHeight: week.minutes > 0 ? '20px' : '3px',
                    boxShadow: isCurrentWeek
                      ? (isHovered ? '0 0 30px rgba(168, 85, 247, 0.7)' : '0 0 20px rgba(168, 85, 247, 0.5)')
                      : (isHovered ? '0 0 20px rgba(113, 113, 122, 0.5)' : '0 0 0 rgba(0, 0, 0, 0)'),
                    transition: 'all 0.3s ease',
                    opacity: isFaded ? 0.3 : 1
                  }}
                >
                  {/* Glow effect */}
                  {week.minutes > 0 && (
                    <div
                      className={`absolute inset-0 rounded-t-lg ${
                        isCurrentWeek ? 'bg-purple-400' : 'bg-zinc-400'
                      } opacity-0 group-hover:opacity-20 transition-opacity`}
                    />
                  )}
                </div>

                {/* Value label above bar */}
                {week.minutes > 0 && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 pointer-events-none">
                    <div
                      className={`text-xs font-medium whitespace-nowrap ${
                        isCurrentWeek ? 'text-purple-300' : 'text-zinc-400'
                      }`}
                    >
                      {formatTime(week.minutes)}
                    </div>
                  </div>
                )}
              </div>

              {/* Label */}
              <div
                className={`text-xs transition-colors ${
                  isCurrentWeek ? 'text-purple-400 font-semibold' : 'text-zinc-500'
                }`}
              >
                {week.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
