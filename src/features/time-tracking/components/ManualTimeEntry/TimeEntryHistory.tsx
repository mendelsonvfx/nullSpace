// src/features/time-tracking/components/ManualTimeEntry/TimeEntryHistory.tsx
import React, { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { Project } from '../../../../types/project';
import { formatTime, formatSoftwareName, getSoftwareColor } from '../../utils';
import { SoftwareIcon } from '../../../../components/SoftwareIcon';

interface TimeEntryHistoryProps {
  project: Project;
  onRemoveEntry: (entryId: string) => void;
}

/**
 * History list of manual time entries
 */
export const TimeEntryHistory: React.FC<TimeEntryHistoryProps> = ({
  project,
  onRemoveEntry
}) => {
  // Get manual time entries sorted by date (newest first)
  const manualEntries = useMemo(() => {
    return (project.timeEntries || [])
      .filter(entry => entry.isManual)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [project.timeEntries]);

  return (
    <div className="p-4 flex flex-col">
      <h3 className="text-sm font-medium text-zinc-300 mb-3">Recent Entries</h3>
      {manualEntries.length === 0 ? (
        <p className="text-zinc-600 text-xs text-center py-6">No manual entries yet</p>
      ) : (
        <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
          {manualEntries.map((entry) => {
            const color = getSoftwareColor(entry.software);
            const entryDate = new Date(entry.startTime).toLocaleDateString();
            const shotName = entry.shotId
              ? project.shots?.find(s => s.id === entry.shotId)?.name
              : null;

            return (
              <div
                key={entry.id}
                className="flex items-center gap-2.5 p-2.5 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors group"
              >
                {/* Software Icon */}
                <div style={{ color }}>
                  <SoftwareIcon name={entry.software} className="w-5 h-5" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">
                      {formatSoftwareName(entry.software)}
                    </span>
                    {shotName && (
                      <span className="text-xs text-zinc-500">• {shotName}</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                    <span>{entryDate}</span>
                    <span>•</span>
                    <span>{formatTime(entry.durationMinutes)}</span>
                    {entry.countedInStats && (
                      <>
                        <span>•</span>
                        <span className="text-accent/70">counted in software stats</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Delete Button */}
                <button
                  onClick={() => onRemoveEntry(entry.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-600/20 rounded-lg transition-all"
                  title="Delete entry"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
