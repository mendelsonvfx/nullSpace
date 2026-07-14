// src/utils/financeSettings.ts

export interface RevenueThresholds {
  RUB: number;
  USD: number;
  EUR: number;
}

const DEFAULT_THRESHOLDS: RevenueThresholds = {
  RUB: 250000,
  USD: 2500,
  EUR: 2500
};

/**
 * Get revenue normalization thresholds from localStorage
 * Returns default values if not set or on error
 */
export function getRevenueThresholds(): RevenueThresholds {
  try {
    const saved = localStorage.getItem('revenueNormalizationThresholds');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to ensure all currencies are present
      return { ...DEFAULT_THRESHOLDS, ...parsed };
    }
  } catch (error) {
    console.error('Failed to get revenue thresholds:', error);
  }
  return DEFAULT_THRESHOLDS;
}

/**
 * Get threshold for specific currency
 * @param currency - Currency code (RUB, USD, EUR)
 * @returns Threshold value for the currency, defaults to USD threshold if not found
 */
export function getThresholdForCurrency(currency: string): number {
  const thresholds = getRevenueThresholds();
  return thresholds[currency as keyof RevenueThresholds] || DEFAULT_THRESHOLDS.USD;
}

/**
 * Save revenue normalization thresholds to localStorage
 * @param thresholds - Threshold values to save
 */
export function saveRevenueThresholds(thresholds: RevenueThresholds): void {
  try {
    localStorage.setItem('revenueNormalizationThresholds', JSON.stringify(thresholds));
    window.dispatchEvent(new Event('storage'));
  } catch (error) {
    console.error('Failed to save revenue thresholds:', error);
  }
}

/**
 * Get hours per work day used for Revenue per Day calculation
 * Default is 8 (industry standard freelance day)
 */
export function getHoursPerWorkDay(): number {
  try {
    const saved = localStorage.getItem('hoursPerWorkDay');
    const parsed = parseInt(saved || '8');
    if (isNaN(parsed) || parsed < 1) return 8;
    return Math.min(24, parsed);
  } catch {
    return 8;
  }
}

/**
 * Save hours per work day to localStorage
 */
export function saveHoursPerWorkDay(hours: number): void {
  try {
    localStorage.setItem('hoursPerWorkDay', hours.toString());
    window.dispatchEvent(new Event('storage'));
  } catch (error) {
    console.error('Failed to save hours per work day:', error);
  }
}
