// src/features/time-tracking/components/TimeAnalytics/SoftwareBreakdown.tsx
import React from 'react';
import { formatTimeCompact, formatSoftwareName, getSoftwareColor } from '../../utils';
import { SoftwareIcon } from '../../../../components/SoftwareIcon';

interface SoftwareBreakdownProps {
  sortedSoftware: Array<[string, number]>;
  totalMinutes: number;
}

/**
 * Software breakdown with progress bars
 */
export const SoftwareBreakdown: React.FC<SoftwareBreakdownProps> = ({
  sortedSoftware,
  totalMinutes
}) => {
  return (
    <div data-time-analytics className="bg-card-bg rounded-xl p-6 border border-border-primary mb-6">
      <h3 className="text-lg font-semibold mb-4 text-zinc-200">Software Breakdown</h3>
      <div className="space-y-3">
        {sortedSoftware.map(([software, minutes]) => {
          const percentage = (minutes / totalMinutes) * 100;
          const color = getSoftwareColor(software as any);

          return (
            <div key={software} className="group">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div style={{ color }}>
                    <SoftwareIcon name={software} className="w-4 h-4 flex-shrink-0" />
                  </div>
                  <span className="text-sm font-medium text-zinc-300">
                    {formatSoftwareName(software)}
                  </span>
                </div>
                <div className="text-sm text-zinc-400">
                  {formatTimeCompact(minutes)} ({percentage.toFixed(1)}%)
                </div>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full transition-all duration-300 group-hover:opacity-80"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: color
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
