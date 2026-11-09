// src/features/time-tracking/components/InlineTimer/InlineTimer.tsx
import { useState, useEffect } from 'react';
import { useTimeTrackingStore } from '../../stores/timeTrackingStore';
import type { TimeEntry } from '../../types/timeEntry';

interface InlineTimerProps {
  activeEntry: TimeEntry;
}

/**
 * Inline timer widget for software cards
 * Shows current session time with animated appearance
 * Uses elapsedSeconds from timeTrackingStore (updated by widget timer)
 */
export function InlineTimer({ activeEntry }: InlineTimerProps) {
  // Two primitive selectors: the entry object is replaced every second, its fields aren't
  const isActive = useTimeTrackingStore(state => state.sessions.get(activeEntry.id)?.isActive === true);
  const totalSeconds = useTimeTrackingStore(state => state.sessions.get(activeEntry.id)?.elapsedSeconds ?? 0);

  // Animation state - MUST be declared before any conditional returns (React Hooks Rules)
  const [isVisible, setIsVisible] = useState(false);

  // Slide in once the entry is active. Depends on isActive only, so it doesn't restart every second
  useEffect(() => {
    if (!isActive) return;

    // Small delay to ensure CSS animation triggers
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, [isActive]);

  // Defensive check: Don't render if entry is no longer active
  // This prevents frozen timers during async projectStore updates
  // MUST be after all hooks (React Hooks Rules)
  if (!isActive) {
    return null;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const displaySeconds = totalSeconds % 60;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return (
    <div
      className={`flex flex-col items-end gap-0.5 ml-auto transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-5 opacity-0'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium text-white tabular-nums">
          {hours}h {minutes.toString().padStart(2, '0')}m <span className="text-zinc-500">{displaySeconds.toString().padStart(2, '0')}s</span>
        </span>
      </div>
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">
        Current Session
      </span>
    </div>
  );
}
