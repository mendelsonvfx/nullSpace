// src/features/time-tracking/components/TimeInfoBar/TimeInfoBar.tsx
import { formatTime } from '../../utils/timeFormatters';
import type { Project } from '../../../../types/project';

interface TimeInfoBarProps {
  project: Project;
}

/**
 * Bottom info bar showing project creation date and time spent
 */
export function TimeInfoBar({ project }: TimeInfoBarProps) {
  // totalMinutesSpent now includes current WorkSession time (updated every minute)
  // No need to add workSession.elapsedMinutes - it would cause double counting
  const totalMinutes = project.totalMinutesSpent || 0;

  // Show green dot only when widget is visible (don't show on Finance page)
  const hasActiveSession = (project.timeEntries || []).some(
    (e: any) => e.isActive && e.widgetVisible === true
  );

  return (
    <div className="px-7 pb-3 flex-shrink-0">
      <div className="bg-card-bg border border-border-primary rounded-button px-6 py-2">
        <div className="flex justify-between items-center text-xs">
          <div className="flex gap-6">
            <div>
              <span className="text-text-muted">Created:</span>{' '}
              <span className="text-text-secondary">
                {project.createdAt
                  ? new Date(project.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })
                  : 'Unknown'}
              </span>
            </div>

            <div>
              <span className="text-text-muted">Time Spent:</span>{' '}
              <span className="text-text-primary font-medium">{formatTime(totalMinutes)}</span>
              {hasActiveSession && (
                <span className="text-green-400 ml-1 animate-pulse">●</span>
              )}
            </div>
          </div>

          <div>
            {project.status === 'completed' &&
              (project.completedAt || project.updatedAt) && (
                <div>
                  <span className="text-text-muted">Completed:</span>{' '}
                  <span className="text-text-secondary">
                    {new Date(
                      project.completedAt || project.updatedAt
                    ).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
