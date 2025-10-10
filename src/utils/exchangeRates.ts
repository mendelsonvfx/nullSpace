// src/utils/exchangeRates.ts

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  lastUpdated: string;
}

export interface ExchangeRatesData {
  rates: Record<string, number>;
  base: string;
  lastUpdated: string;
}

export type RateMode = 'auto' | 'manual';

const CACHE_KEY = 'exchangeRatesCache';
const CACHE_DURATION = 86400000; // 24 hours (1 day) in milliseconds

// Free API для получения курсов валют (без API ключа)
const API_URL = 'https://api.exchangerate-api.com/v4/latest/';

/**
 * Получить курсы валют из интернета
 */
export async function fetchExchangeRates(baseCurrency: string = 'USD'): Promise<ExchangeRatesData> {
  try {
    const response = await fetch(`${API_URL}${baseCurrency}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    const result: ExchangeRatesData = {
      rates: data.rates,
      base: data.base,
      lastUpdated: new Date().toISOString()
    };

    // Сохранить в кэш
    saveCachedRates(baseCurrency, result);

    return result;
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error);

    // Попытаться получить из кэша
    const cached = getCachedRates(baseCurrency);
    if (cached) {
      console.log('Using cached exchange rates');
      return cached;
    }

    // Вернуть дефолтные курсы
    return getDefaultRates(baseCurrency);
  }
}

/**
 * Сохранить курсы в кэш
 */
function saveCachedRates(baseCurrency: string, data: ExchangeRatesData): void {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    cache[baseCurrency] = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Failed to save exchange rates to cache:', error);
  }
}

/**
 * Получить курсы из кэша
 */
function getCachedRates(baseCurrency: string): ExchangeRatesData | null {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const cached = cache[baseCurrency];

    if (!cached) {
      return null;
    }

    // Проверить актуальность кэша
    if (Date.now() - cached.timestamp > CACHE_DURATION) {
      return null;
    }

    return cached.data;
  } catch (error) {
    console.error('Failed to get cached exchange rates:', error);
    return null;
  }
}

/**
 * Получить дефолтные курсы (статические значения на случай, если API недоступен)
 * Формат: базовая валюта -> { другая валюта: сколько базовой валюты за 1 единицу другой }
 */
function getDefaultRates(baseCurrency: string): ExchangeRatesData {
  const defaultRates: Record<string, Record<string, number>> = {
    USD: { USD: 1, RUB: 0.011, EUR: 1.09 },    // За 1 рубль = 0.011 USD, за 1 евро = 1.09 USD
    RUB: { USD: 100, RUB: 1, EUR: 110 },        // За 1 доллар = 100 RUB, за 1 евро = 110 RUB
    EUR: { USD: 0.92, RUB: 0.01, EUR: 1 }       // За 1 доллар = 0.92 EUR, за 1 рубль = 0.01 EUR
  };

  return {
    rates: defaultRates[baseCurrency] || defaultRates.USD,
    base: baseCurrency,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Конвертировать валюту
 * Логика для ручных курсов: rates[currency] = сколько базовой валюты за 1 единицу указанной валюты
 * Пример: base=RUB, rates={USD: 100} → 10 USD = 10 * 100 = 1000 RUB
 *
 * Для API курсов (auto mode): используется стандартная логика умножения
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  // Если у нас есть прямой курс fromCurrency -> toCurrency
  if (rates[fromCurrency]) {
    return amount * rates[fromCurrency];
  }

  return amount;
}

/**
 * Получить сохраненные вручную курсы
 */
export function getManualRates(): Record<string, Record<string, number>> {
  try {
    const saved = localStorage.getItem('manualExchangeRates');
    return saved ? JSON.parse(saved) : getDefaultManualRates();
  } catch (error) {
    console.error('Failed to get manual rates:', error);
    return getDefaultManualRates();
  }
}

/**
 * Сохранить вручную установленные курсы
 */
export function saveManualRates(rates: Record<string, Record<string, number>>): void {
  try {
    localStorage.setItem('manualExchangeRates', JSON.stringify(rates));
  } catch (error) {
    console.error('Failed to save manual rates:', error);
  }
}

/**
 * Получить дефолтные ручные курсы
 * Формат: базовая валюта -> { другая валюта: сколько базовой валюты за 1 единицу другой }
 * Пример: RUB -> { USD: 100 } означает "100 рублей за 1 доллар"
 */
function getDefaultManualRates(): Record<string, Record<string, number>> {
  return {
    USD: { USD: 1, RUB: 0.011, EUR: 1.09 },    // За 1 рубль = 0.011 USD, за 1 евро = 1.09 USD
    RUB: { USD: 100, RUB: 1, EUR: 110 },        // За 1 доллар = 100 RUB, за 1 евро = 110 RUB
    EUR: { USD: 0.92, RUB: 0.01, EUR: 1 }       // За 1 доллар = 0.92 EUR, за 1 рубль = 0.01 EUR
  };
}

/**
 * Получить режим курсов (авто или ручной)
 */
export function getRateMode(): RateMode {
  try {
    const saved = localStorage.getItem('exchangeRateMode');
    return (saved as RateMode) || 'auto';
  } catch (error) {
    return 'auto';
  }
}

/**
 * Сохранить режим курсов
 */
export function saveRateMode(mode: RateMode): void {
  try {
    localStorage.setItem('exchangeRateMode', mode);
  } catch (error) {
    console.error('Failed to save rate mode:', error);
  }
}

/**
 * Получить актуальные курсы в зависимости от режима
 */
export async function getCurrentRates(baseCurrency: string = 'USD'): Promise<Record<string, number>> {
  const mode = getRateMode();

  if (mode === 'auto') {
    try {
      const data = await fetchExchangeRates(baseCurrency);
      return data.rates;
    } catch (error) {
      console.error('Failed to get auto rates, falling back to manual:', error);
      const manual = getManualRates();
      return manual[baseCurrency] || manual.USD;
    }
  } else {
    const manual = getManualRates();
    return manual[baseCurrency] || manual.USD;
  }
}

/**
 * Получить курсы синхронно из кэша (без загрузки из API)
 */
export function getCachedRatesSync(baseCurrency: string = 'USD'): Record<string, number> | null {
  const cached = getCachedRates(baseCurrency);
  if (cached) {
    return cached.rates;
  }
  return null;
}

/**
 * Очистить кэш курсов
 */
export function clearRatesCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('Failed to clear rates cache:', error);
  }
}
