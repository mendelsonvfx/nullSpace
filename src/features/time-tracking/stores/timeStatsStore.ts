// src/features/time-tracking/stores/timeStatsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SoftwareName } from '../../../types/project';
import { normalizeSoftwareName } from '../utils/softwareUtils';

/**
 * Migrates legacy software names to canonical forms
 * Merges duplicates like "aftereffects" into "after-effects"
 */
function migrateSoftwareNames(softwareMinutes: Record<string, number>): Record<SoftwareName, number> {
  const migrated: Record<string, number> = {};

  Object.entries(softwareMinutes).forEach(([software, minutes]) => {
    const normalized = normalizeSoftwareName(software);
    migrated[normalized] = (migrated[normalized] || 0) + minutes;
  });

  return migrated as Record<SoftwareName, number>;
}

interface TimeStats {
  // Map of software name to total minutes (focused time only)
  softwareMinutes: Record<SoftwareName, number>;
}

interface TimeStatsStore extends TimeStats {
  // Add minutes to a software's total
  addSoftwareTime: (software: SoftwareName, minutes: number) => void;

  // Remove minutes from a software's total
  removeSoftwareTime: (software: SoftwareName, minutes: number) => void;

  // Get total minutes for a software
  getSoftwareTime: (software: SoftwareName) => number;

  // Reset all statistics (for testing/debugging)
  resetStats: () => void;
}

const initialState: TimeStats = {
  softwareMinutes: {
    'blender': 0,
    'houdini': 0,
    'after-effects': 0,
    'photoshop': 0,
    'maya': 0,
    'cinema4d': 0,
    'substance': 0,
    'unreal': 0,
    'unity': 0,
    'zbrush': 0,
    'marmoset': 0,
    'davinci': 0
  }
};

export const useTimeStatsStore = create<TimeStatsStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Keys are normalized here so callers passing display names ('Unreal Engine') can't create duplicate keys
      addSoftwareTime: (software: SoftwareName, minutes: number) => {
        const key = normalizeSoftwareName(software);
        set(state => ({
          softwareMinutes: {
            ...state.softwareMinutes,
            [key]: (state.softwareMinutes[key] || 0) + minutes
          }
        }));
        console.log(`[TimeStats] Added ${minutes}m to ${key}. New total: ${get().softwareMinutes[key]}m`);
      },

      removeSoftwareTime: (software: SoftwareName, minutes: number) => {
        const key = normalizeSoftwareName(software);
        set(state => ({
          softwareMinutes: {
            ...state.softwareMinutes,
            [key]: Math.max(0, (state.softwareMinutes[key] || 0) - minutes)
          }
        }));
        console.log(`[TimeStats] Removed ${minutes}m from ${key}. New total: ${get().softwareMinutes[key]}m`);
      },

      getSoftwareTime: (software: SoftwareName) => {
        return get().softwareMinutes[normalizeSoftwareName(software)] || 0;
      },

      resetStats: () => {
        set(initialState);
        console.log('[TimeStats] ✅ Statistics reset');
      }
    }),
    {
      name: 'time-statistics-storage',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Migrate legacy software names
          const migratedMinutes = migrateSoftwareNames(state.softwareMinutes);
          const totalMinutes = Object.values(migratedMinutes).reduce((sum, m) => sum + m, 0);

          // Update state with migrated data
          state.softwareMinutes = migratedMinutes;

          console.log(`[TimeStats] ✅ Loaded and migrated from localStorage: ${totalMinutes} total minutes`, migratedMinutes);
        } else {
          console.log('[TimeStats] ⚠️ No data found in localStorage');
        }
      }
    }
  )
);
