// src/features/time-tracking/hooks/useTimerSeconds.ts
import { useState, useEffect } from 'react';
import { TimerService } from '../services/TimerService';

/**
 * Hook to get current seconds for a timer
 * Updates every second
 */
export function useTimerSeconds(entryId: string | undefined): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!entryId) {
      setSeconds(0);
      return;
    }

    // Get initial seconds
    const initialSeconds = TimerService.getSeconds(entryId);
    setSeconds(initialSeconds);

    // Update every second
    const interval = setInterval(() => {
      const currentSeconds = TimerService.getSeconds(entryId);
      setSeconds(currentSeconds);
    }, 1000);

    return () => clearInterval(interval);
  }, [entryId]);

  return seconds;
}
