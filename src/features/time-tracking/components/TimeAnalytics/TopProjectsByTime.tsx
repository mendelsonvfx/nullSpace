// src/features/time-tracking/components/TimeAnalytics/TopProjectsByTime.tsx
import React from 'react';
import { formatTime } from '../../utils/timeFormatters';
import { getProjectColor, createSoftGradient } from '../../../../utils/colorUtils';

interface TopProject {
  id: string;
  name: string;
  totalMinutes: number;
  color?: string;
}

interface TopProjectsByTimeProps {
  topProjectsByTime: TopProject[];
}

/**
 * Top 3 Projects by Time Spent
 * Shows projects with most time tracked (similar to Finance page's Top 3 by Revenue)
 */
export const TopProjectsByTime: React.FC<TopProjectsByTimeProps> = ({
  topProjectsByTime
}) => {
  if (topProjectsByTime.length === 0) {
    return null;
  }

  // Calculate total minutes for percentage
  const totalMinutes = topProjectsByTime.reduce((sum, p) => sum + p.totalMinutes, 0);

  return (
    <div data-time-analytics className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mt-6 mb-12">
      <h2 className="text-2xl font-medium text-zinc-400 mb-6">Top 3 Projects by Time Spent</h2>
      <div className="space-y-4">
        {topProjectsByTime.map((project) => {
          const percentage = totalMinutes > 0 ? (project.totalMinutes / totalMinutes) * 100 : 0;
          const projectColor = getProjectColor(project);
          return (
            <div key={project.id} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-300 truncate flex-1 mr-4">{project.name}</span>
                <span className="font-medium" style={{ color: projectColor }}>
                  {formatTime(project.totalMinutes)}
                </span>
              </div>
              <div className="relative h-8 bg-zinc-800 rounded-lg overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
                  style={{
                    width: `${percentage}%`,
                    background: createSoftGradient(projectColor)
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-end px-3">
                  <span className="text-xs font-medium text-white" style={{ textShadow: '0 1px 3px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.6)' }}>
                    {percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
