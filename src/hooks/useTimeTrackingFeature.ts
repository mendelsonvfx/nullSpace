// src/hooks/useTimeTrackingFeature.ts
import { useState, useEffect } from 'react';

/**
 * Hook to check if time tracking feature is enabled
 * Returns true by default (feature enabled)
 */
export function useTimeTrackingFeature(): boolean {
  const [isEnabled, setIsEnabled] = useState(() => {
    const saved = localStorage.getItem('timeTrackingEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    // Listen for changes in localStorage
    const handleStorageChange = () => {
      const saved = localStorage.getItem('timeTrackingEnabled');
      setIsEnabled(saved !== null ? JSON.parse(saved) : true);
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return isEnabled;
}
