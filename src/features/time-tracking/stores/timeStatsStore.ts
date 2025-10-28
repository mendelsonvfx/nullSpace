// src/features/time-tracking/stores/timeStatsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SoftwareName } from '../../../types/project';

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
    'marmoset': 0
  }
};

export const useTimeStatsStore = create<TimeStatsStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      addSoftwareTime: (software: SoftwareName, minutes: number) => {
        set(state => ({
          softwareMinutes: {
            ...state.softwareMinutes,
            [software]: (state.softwareMinutes[software] || 0) + minutes
          }
        }));
        console.log(`[TimeStats] Added ${minutes}m to ${software}. New total: ${get().softwareMinutes[software]}m`);
      },

      removeSoftwareTime: (software: SoftwareName, minutes: number) => {
        set(state => ({
          softwareMinutes: {
            ...state.softwareMinutes,
            [software]: Math.max(0, (state.softwareMinutes[software] || 0) - minutes)
          }
        }));
        console.log(`[TimeStats] Removed ${minutes}m from ${software}. New total: ${get().softwareMinutes[software]}m`);
      },

      getSoftwareTime: (software: SoftwareName) => {
        return get().softwareMinutes[software] || 0;
      },

      resetStats: () => {
        set(initialState);
        console.log('[TimeStats] ✅ Statistics reset');
      }
    }),
    {
      name: 'time-statistics-storage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const totalMinutes = Object.values(state.softwareMinutes).reduce((sum, m) => sum + m, 0);
          console.log(`[TimeStats] ✅ Loaded from localStorage: ${totalMinutes} total minutes`, state.softwareMinutes);
        } else {
          console.log('[TimeStats] ⚠️ No data found in localStorage');
        }
      }
    }
  )
);
