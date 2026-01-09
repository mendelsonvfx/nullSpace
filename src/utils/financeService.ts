// src/utils/financeService.ts
// Centralized finance logic for payment status updates and chart data

import type { Project, PaymentStatus, Transaction } from '../types/project';

// === PAYMENT STATUS UPDATE ===

/**
 * Get the updates needed when changing payment status.
 * Centralized logic to avoid duplication across components.
 *
 * Rules:
 * - unpaid: clear both completedAt and paidAt
 * - prepaid: set completedAt (first payment date), clear paidAt
 * - paid: set completedAt if not set, ALWAYS set paidAt to now
 */
export const getPaymentStatusUpdate = (
  project: Project,
  newStatus: PaymentStatus
): Partial<Project> => {
  const now = new Date().toISOString();

  if (newStatus === 'unpaid') {
    return {
      paymentStatus: 'unpaid',
      completedAt: undefined,
      paidAt: undefined
    };
  }

  if (newStatus === 'prepaid') {
    return {
      paymentStatus: 'prepaid',
      completedAt: project.completedAt || now, // Keep existing or set new
      paidAt: undefined // Not fully paid yet
    };
  }

  if (newStatus === 'paid') {
    return {
      paymentStatus: 'paid',
      completedAt: project.completedAt || now, // Keep existing or set new
      paidAt: now // ALWAYS update to current date when marking as paid
    };
  }

  return {};
};

// === CHART DATA POINTS ===

export interface ChartDataPoint {
  date: Date;
  amount: number;
  name: string;
  type: 'prepaid' | 'paid' | 'full' | 'transaction';
  projectId?: string;
}

/**
 * Generate chart data points for revenue timeline.
 *
 * Rules:
 * - prepaid project: one point (prepayment amount) on completedAt date
 * - paid (after prepaid): TWO points - prepayment on completedAt + remaining on paidAt
 * - paid (direct): one point (full amount) on paidAt or completedAt
 * - old projects (no paidAt): one point on completedAt (backwards compatible)
 */
export const getChartDataPoints = (
  projects: Project[],
  otherTransactions: Transaction[],
  convertCurrency: (amount: number, from: string, to: string) => number,
  baseCurrency: string,
  convertToBase: boolean
): ChartDataPoint[] => {
  const points: ChartDataPoint[] = [];

  projects.forEach(project => {
    if (!project.cost) return;

    const currency = project.currency || 'USD';
    const convert = (amount: number) =>
      convertToBase && currency !== baseCurrency
        ? convertCurrency(amount, currency, baseCurrency)
        : amount;

    if (project.paymentStatus === 'paid') {
      // Check if this was a prepaid->paid transition (has both prepaymentAmount and paidAt)
      if (project.prepaymentAmount && project.paidAt && project.completedAt &&
          project.paidAt !== project.completedAt) {
        // Two points: prepayment + remaining

        // Point 1: prepayment on completedAt
        points.push({
          date: new Date(project.completedAt),
          amount: convert(project.prepaymentAmount),
          name: project.name,
          type: 'prepaid',
          projectId: project.id
        });

        // Point 2: remaining on paidAt
        const remaining = project.cost - project.prepaymentAmount;
        points.push({
          date: new Date(project.paidAt),
          amount: convert(remaining),
          name: project.name,
          type: 'paid',
          projectId: project.id
        });
      } else {
        // Direct paid or old project (no paidAt) - one point
        const payDate = project.paidAt || project.completedAt;
        if (payDate) {
          points.push({
            date: new Date(payDate),
            amount: convert(project.cost),
            name: project.name,
            type: 'full',
            projectId: project.id
          });
        }
      }
    } else if (project.paymentStatus === 'prepaid' && project.prepaymentAmount) {
      // Only prepaid - one point with prepayment amount
      if (project.completedAt) {
        points.push({
          date: new Date(project.completedAt),
          amount: convert(project.prepaymentAmount),
          name: project.name,
          type: 'prepaid',
          projectId: project.id
        });
      }
    }
  });

  // Add "Other Project" transactions
  otherTransactions.forEach(t => {
    const convert = (amount: number) =>
      convertToBase && t.currency !== baseCurrency
        ? convertCurrency(amount, t.currency, baseCurrency)
        : amount;

    points.push({
      date: new Date(t.date),
      amount: convert(t.amount),
      name: 'Other Project',
      type: 'transaction'
    });
  });

  // Sort by date
  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
};

// === REVENUE CALCULATION ===

export interface RevenueResult {
  totalRevenue: Record<string, number>;
  pendingRevenue: Record<string, number>;
  paidProjects: (Project & { displayAmount?: number; remainingAmount?: number; isPrepaidProject?: boolean })[];
  pendingProjects: (Project & { displayAmount?: number; prepaidAmount?: number; isPrepaidProject?: boolean; showRemainingFirst?: boolean })[];
}

/**
 * Calculate total and pending revenue from projects.
 *
 * Rules:
 * - paid: add full cost to totalRevenue
 * - prepaid: add prepaymentAmount to totalRevenue, remaining to pendingRevenue
 * - unpaid: add full cost to pendingRevenue
 */
export const calculateRevenue = (
  projects: Project[],
  otherTransactions: Transaction[],
  convertCurrency: (amount: number, from: string, to: string) => number,
  baseCurrency: string,
  convertToBase: boolean
): RevenueResult => {
  const totalRevenue: Record<string, number> = {};
  const pendingRevenue: Record<string, number> = {};
  const paidProjects: RevenueResult['paidProjects'] = [];
  const pendingProjects: RevenueResult['pendingProjects'] = [];

  projects.forEach(project => {
    if (project.paymentStatus === 'paid' && project.cost) {
      const currency = project.currency || 'USD';

      if (convertToBase) {
        const convertedAmount = convertCurrency(project.cost, currency, baseCurrency);
        totalRevenue[baseCurrency] = (totalRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        totalRevenue[currency] = (totalRevenue[currency] || 0) + project.cost;
      }

      paidProjects.push(project);
    } else if (project.paymentStatus === 'prepaid' && project.cost && project.prepaymentAmount) {
      const currency = project.currency || 'USD';

      // Prepayment goes to totalRevenue
      if (convertToBase) {
        const convertedAmount = convertCurrency(project.prepaymentAmount, currency, baseCurrency);
        totalRevenue[baseCurrency] = (totalRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        totalRevenue[currency] = (totalRevenue[currency] || 0) + project.prepaymentAmount;
      }

      paidProjects.push({
        ...project,
        displayAmount: project.prepaymentAmount,
        remainingAmount: project.cost - project.prepaymentAmount,
        isPrepaidProject: true
      });

      // Remaining goes to pendingRevenue
      const remainingAmount = project.cost - project.prepaymentAmount;
      if (convertToBase) {
        const convertedAmount = convertCurrency(remainingAmount, currency, baseCurrency);
        pendingRevenue[baseCurrency] = (pendingRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        pendingRevenue[currency] = (pendingRevenue[currency] || 0) + remainingAmount;
      }

      pendingProjects.push({
        ...project,
        displayAmount: remainingAmount,
        prepaidAmount: project.prepaymentAmount,
        isPrepaidProject: true,
        showRemainingFirst: true
      });
    } else if (project.paymentStatus === 'unpaid' && project.cost) {
      const currency = project.currency || 'USD';

      if (convertToBase) {
        const convertedAmount = convertCurrency(project.cost, currency, baseCurrency);
        pendingRevenue[baseCurrency] = (pendingRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        pendingRevenue[currency] = (pendingRevenue[currency] || 0) + project.cost;
      }

      pendingProjects.push(project);
    }
  });

  // Add "Other Project" transactions to total revenue
  otherTransactions.forEach(transaction => {
    const currency = transaction.currency || 'USD';

    if (convertToBase) {
      const convertedAmount = convertCurrency(transaction.amount, currency, baseCurrency);
      totalRevenue[baseCurrency] = (totalRevenue[baseCurrency] || 0) + convertedAmount;
    } else {
      totalRevenue[currency] = (totalRevenue[currency] || 0) + transaction.amount;
    }
  });

  return { totalRevenue, pendingRevenue, paidProjects, pendingProjects };
};

// === STATISTICS ===

export interface FinanceStatistics {
  totalPaid: number;
  displayCurrency: string;
  avgValue: number;
  dailyRate: number;
  projectCount: number;
}

/**
 * Calculate finance statistics from paid projects.
 */
export const calculateStatistics = (
  paidProjects: RevenueResult['paidProjects'],
  totalRevenue: Record<string, number>,
  baseCurrency: string,
  convertToBase: boolean
): FinanceStatistics => {
  const totalPaid = Object.values(totalRevenue).reduce((sum, val) => sum + val, 0);
  const displayCurrency = convertToBase ? baseCurrency : (paidProjects[0]?.currency || 'USD');
  const avgValue = paidProjects.length > 0 ? totalPaid / paidProjects.length : 0;

  // Calculate daily rate
  let totalDaysWorked = 0;
  paidProjects.forEach((project) => {
    if (project.createdAt && !project.isPrepaidProject) {
      const createdDate = new Date(project.createdAt);
      const completedDate = new Date();
      const daysWorked = Math.max(1, Math.ceil(
        (completedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
      ));
      totalDaysWorked += daysWorked;
    }
  });
  const dailyRate = totalDaysWorked > 0 ? totalPaid / totalDaysWorked : 0;

  return {
    totalPaid,
    displayCurrency,
    avgValue,
    dailyRate,
    projectCount: paidProjects.length
  };
};
