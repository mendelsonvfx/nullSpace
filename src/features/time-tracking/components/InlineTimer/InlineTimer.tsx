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
  // Subscribe to timeTrackingStore for elapsedSeconds updates
  const currentEntry = useTimeTrackingStore(state => state.sessions.get(activeEntry.id));

  // Animation state - MUST be declared before any conditional returns (React Hooks Rules)
  const wasAlreadyVisible = activeEntry.widgetVisible === true;
  const [isVisible, setIsVisible] = useState(false);

  // Trigger animation on mount - MUST be declared before any conditional returns (React Hooks Rules)
  useEffect(() => {
    // Conditional logic inside effect is safe
    if (!currentEntry || !currentEntry.isActive) {
      console.log(`[InlineTimer] 🎭 useEffect: Entry is no longer active, skipping animation`);
      return; // Early return inside effect is allowed
    }

    console.log(`[InlineTimer] 🎭 useEffect for animation. wasAlreadyVisible=${wasAlreadyVisible}`);
    console.log(`[InlineTimer] ⏰ Setting 10ms timer to show widget with animation`);

    // Small delay to ensure CSS animation triggers
    const timer = setTimeout(() => {
      console.log(`[InlineTimer] ✅ 10ms elapsed, setting isVisible=true`);
      setIsVisible(true);
    }, 10);

    return () => {
      console.log(`[InlineTimer] 🧹 Cleaning up animation timer`);
      clearTimeout(timer);
    };
  }, [wasAlreadyVisible, currentEntry]);

  console.log(`[InlineTimer] 🎬 Component state: wasAlreadyVisible=${wasAlreadyVisible}, widgetVisible=${activeEntry.widgetVisible}, isVisible=${isVisible}`);

  // Defensive check: Don't render if entry is no longer active
  // This prevents frozen timers during async projectStore updates
  // MUST be after all hooks (React Hooks Rules)
  if (!currentEntry || !currentEntry.isActive) {
    console.log(`[InlineTimer] ⚠️ Entry is no longer active, not rendering`);
    return null;
  }

  // Use elapsedSeconds from currentEntry (updated by widget timer every second)
  // This ensures accurate time tracking without recalculation
  const totalSeconds = currentEntry?.elapsedSeconds ?? 0;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const displaySeconds = totalSeconds % 60;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  console.log(`[InlineTimer] 🎨 RENDERING: isVisible=${isVisible}, totalSeconds=${totalSeconds}, totalMinutes=${totalMinutes}, displaySeconds=${displaySeconds}`);

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
