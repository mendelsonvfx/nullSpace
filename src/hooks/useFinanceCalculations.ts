// src/hooks/useFinanceCalculations.ts
// Memoized hook for finance calculations

import { useMemo, useCallback } from 'react';
import type { Project, Transaction } from '../types/project';
import {
  getChartDataPoints,
  calculateRevenue,
  calculateStatistics,
  type ChartDataPoint,
  type RevenueResult,
  type FinanceStatistics
} from '../utils/financeService';

interface UseFinanceCalculationsResult {
  // Currency conversion
  convertCurrency: (amount: number, from: string, to: string) => number;

  // Revenue data
  totalRevenue: Record<string, number>;
  pendingRevenue: Record<string, number>;
  paidProjects: RevenueResult['paidProjects'];
  pendingProjects: RevenueResult['pendingProjects'];

  // Chart data
  chartDataPoints: ChartDataPoint[];

  // Statistics
  statistics: FinanceStatistics;

  // Monthly breakdown helper
  getMonthlyRevenue: (year: number, month: number) => { revenue: number; pointCount: number };
}

export const useFinanceCalculations = (
  projects: Project[],
  otherTransactions: Transaction[],
  exchangeRates: Record<string, Record<string, number>>,
  baseCurrency: string,
  convertToBaseCurrency: boolean
): UseFinanceCalculationsResult => {
  // Memoized currency conversion function
  const convertCurrency = useCallback(
    (amount: number, from: string, to: string): number => {
      if (from === to) return amount;

      // Try to find rate in target currency rates
      const toRates = exchangeRates[to];
      if (toRates && typeof toRates[from] === 'number') {
        return amount * toRates[from];
      }

      // Try reverse rate
      const fromRates = exchangeRates[from];
      if (fromRates && typeof fromRates[to] === 'number') {
        return amount / fromRates[to];
      }

      return amount;
    },
    [exchangeRates]
  );

  // Memoized revenue calculation
  const revenueResult = useMemo(
    () => calculateRevenue(projects, otherTransactions, convertCurrency, baseCurrency, convertToBaseCurrency),
    [projects, otherTransactions, convertCurrency, baseCurrency, convertToBaseCurrency]
  );

  const { totalRevenue, pendingRevenue, paidProjects, pendingProjects } = revenueResult;

  // Memoized chart data points
  const chartDataPoints = useMemo(
    () => getChartDataPoints(projects, otherTransactions, convertCurrency, baseCurrency, convertToBaseCurrency),
    [projects, otherTransactions, convertCurrency, baseCurrency, convertToBaseCurrency]
  );

  // Memoized statistics
  const statistics = useMemo(
    () => calculateStatistics(paidProjects, totalRevenue, baseCurrency, convertToBaseCurrency),
    [paidProjects, totalRevenue, baseCurrency, convertToBaseCurrency]
  );

  // Helper for monthly breakdown - uses chartDataPoints for consistency
  const getMonthlyRevenue = useCallback(
    (year: number, month: number): { revenue: number; pointCount: number } => {
      const pointsInMonth = chartDataPoints.filter(point => {
        return point.date.getFullYear() === year && point.date.getMonth() === month;
      });

      const revenue = pointsInMonth.reduce((sum, p) => sum + p.amount, 0);
      return { revenue, pointCount: pointsInMonth.length };
    },
    [chartDataPoints]
  );

  return {
    convertCurrency,
    totalRevenue,
    pendingRevenue,
    paidProjects,
    pendingProjects,
    chartDataPoints,
    statistics,
    getMonthlyRevenue
  };
};
