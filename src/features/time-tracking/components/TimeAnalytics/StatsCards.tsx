// src/features/time-tracking/components/TimeAnalytics/StatsCards.tsx
import React from 'react';
import { formatTime } from '../../utils/timeFormatters';

interface StatsCardsProps {
  totalMinutesAllProjects: number;
  totalFocusedMinutes: number;
  globalHourlyRate?: number;
  focusedHourlyRate?: number;
  baseCurrency: string;
}

/**
 * Stats cards showing Total Time and Hourly Rate
 */
export const StatsCards: React.FC<StatsCardsProps> = ({
  totalMinutesAllProjects,
  totalFocusedMinutes,
  globalHourlyRate,
  focusedHourlyRate,
  baseCurrency
}) => {
  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'RUB': '₽',
    'EUR': '€'
  };

  return (
    <div className="grid grid-cols-2 gap-6 mb-6">
      {/* Total Time Card */}
      <div data-time-analytics className="bg-card-bg rounded-xl p-6 border border-border-primary">
        <p className="text-sm text-zinc-500 mb-2">Total Time Tracked</p>
        <p className="text-5xl font-bold text-blue-400">
          {formatTime(totalMinutesAllProjects)}
        </p>
        <p className="text-sm text-zinc-600 mt-2">
          {formatTime(totalFocusedMinutes)} focused
        </p>
      </div>

      {/* Average Hourly Rate Card */}
      <div data-time-analytics className="bg-card-bg rounded-xl p-6 border border-border-primary">
        <p className="text-sm text-zinc-500 mb-2">Average Hourly Rate</p>
        <p className="text-5xl font-bold text-green-400">
          {currencySymbols[baseCurrency] || '$'}
          {globalHourlyRate && globalHourlyRate > 0 ? Math.round(globalHourlyRate) : '0'}
          <span className="text-green-400">/h</span>
        </p>
        {focusedHourlyRate !== undefined && (
          <p className="text-sm text-zinc-600 mt-2">
            {currencySymbols[baseCurrency] || '$'}{Math.round(focusedHourlyRate)}/h focused
          </p>
        )}
      </div>
    </div>
  );
};
