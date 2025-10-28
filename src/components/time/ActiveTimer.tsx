import { useState, useEffect } from 'react';
import { Pause, Square, Play } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import type { TimeEntry } from '../../types/project';

interface ActiveTimerProps {
  activeEntry: TimeEntry;
  projectName: string;
  shotNumber?: number;
  onStop: (finalMinutes: number) => void;
  onPause: () => void;
  onResume: () => void;
}

const formatTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

export function ActiveTimer({
  activeEntry,
  projectName,
  shotNumber,
  onStop,
  onPause,
  onResume
}: ActiveTimerProps) {
  // Sync with activeEntry changes
  const [currentMinutes, setCurrentMinutes] = useState(activeEntry.durationMinutes);
  const [pausedMinutes, setPausedMinutes] = useState(activeEntry.pausedMinutes || 0);

  // Update from activeEntry when it changes (from backend)
  useEffect(() => {
    setCurrentMinutes(activeEntry.durationMinutes);
    setPausedMinutes(activeEntry.pausedMinutes || 0);
  }, [activeEntry.durationMinutes, activeEntry.pausedMinutes]);

  // Sync with backend every minute to get accurate time
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      try {
        const sessions = await invoke<any[]>('get_active_sessions');
        const session = sessions.find(s => s.entry_id === activeEntry.id);
        if (session) {
          setCurrentMinutes(session.accumulated_minutes);
          if (session.is_paused) {
            setPausedMinutes(session.paused_minutes);
          }
        }
      } catch (error) {
        console.error('Failed to sync time:', error);
      }
    }, 60000); // Sync every minute

    return () => clearInterval(syncInterval);
  }, [activeEntry.id]);

  const handlePause = async () => {
    try {
      await invoke('pause_time_tracking', { entryId: activeEntry.id });
      onPause();
    } catch (error) {
      console.error('Failed to pause tracking:', error);
    }
  };

  const handleResume = async () => {
    try {
      await invoke('resume_time_tracking', { entryId: activeEntry.id });
      onResume();
    } catch (error) {
      console.error('Failed to resume tracking:', error);
    }
  };

  const handleStop = async () => {
    try {
      const finalMinutes = await invoke<number>('stop_time_tracking', {
        entryId: activeEntry.id
      });
      onStop(finalMinutes);
    } catch (error) {
      console.error('Failed to stop tracking:', error);
    }
  };

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-zinc-400 mb-3">
        {activeEntry.isPaused ? '⏸ Session Paused' : '⏱ Active Session'}
      </h3>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!activeEntry.isPaused && (
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            )}
            {activeEntry.isPaused && (
              <div className="w-3 h-3 bg-yellow-500 rounded-full" />
            )}
            <div>
              <div className="font-medium text-white">
                {activeEntry.software.charAt(0).toUpperCase() + activeEntry.software.slice(1)}
                {activeEntry.isPaused ? ' paused' : ' running'}
              </div>
              <div className="text-sm text-zinc-500">
                {shotNumber ? `Shot ${String(shotNumber).padStart(3, '0')} • ` : ''}{projectName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {formatTime(currentMinutes)}
              </div>
              {activeEntry.isPaused && pausedMinutes > 0 && (
                <div className="text-xs text-zinc-500">
                  (paused {formatTime(pausedMinutes)})
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {!activeEntry.isPaused ? (
                <button
                  onClick={handlePause}
                  className="p-2 bg-yellow-900/50 hover:bg-yellow-900/70 rounded-lg transition-colors"
                  title="Pause"
                >
                  <Pause className="w-4 h-4 text-yellow-400" />
                </button>
              ) : (
                <button
                  onClick={handleResume}
                  className="p-2 bg-green-900/50 hover:bg-green-900/70 rounded-lg transition-colors"
                  title="Resume"
                >
                  <Play className="w-4 h-4 text-green-400" />
                </button>
              )}

              <button
                onClick={handleStop}
                className="p-2 bg-red-900/50 hover:bg-red-900/70 rounded-lg transition-colors"
                title="Stop"
              >
                <Square className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
