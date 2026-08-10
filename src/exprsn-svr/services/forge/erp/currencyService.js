const logger = require('../../../utils/logger');
const axios = require('axios');

/**
 * Currency Service
 *
 * Handles multi-currency support, exchange rates, and currency conversion
 */

// In-memory cache for exchange rates (would use Redis in production)
const exchangeRateCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Supported currencies
 */
const SUPPORTED_CURRENCIES = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  CHF: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', decimals: 2 },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', decimals: 2 },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  MXN: { code: 'MXN', symbol: 'Mex$', name: 'Mexican Peso', decimals: 2 },
  BRL: { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2 },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand', decimals: 2 },
  SEK: { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', decimals: 2 },
  NOK: { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', decimals: 2 },
  DKK: { code: 'DKK', symbol: 'kr', name: 'Danish Krone', decimals: 2 },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2 },
  HKD: { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', decimals: 2 },
  NZD: { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2 },
  KRW: { code: 'KRW', symbol: '₩', name: 'South Korean Won', decimals: 0 }
};

/**
 * Get exchange rate between two currencies
 */
async function getExchangeRate(fromCurrency, toCurrency, date = null) {
  try {
    // Same currency = 1:1
    if (fromCurrency === toCurrency) {
      return 1.0;
    }

    // Validate currencies
    if (!SUPPORTED_CURRENCIES[fromCurrency] || !SUPPORTED_CURRENCIES[toCurrency]) {
      throw new Error('Unsupported currency');
    }

    const cacheKey = `${fromCurrency}-${toCurrency}-${date || 'latest'}`;

    // Check cache
    if (exchangeRateCache.has(cacheKey)) {
      const cached = exchangeRateCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.rate;
      }
    }

    // Fetch from external API (placeholder - would use real API like exchangerate-api.com)
    const rate = await fetchExchangeRate(fromCurrency, toCurrency, date);

    // Cache the result
    exchangeRateCache.set(cacheKey, {
      rate,
      timestamp: Date.now()
    });

    logger.info('Exchange rate fetched', {
      fromCurrency,
      toCurrency,
      rate,
      date
    });

    return rate;
  } catch (error) {
    logger.error('Failed to get exchange rate', {
      error: error.message,
      fromCurrency,
      toCurrency
    });

    // Return fallback rate or throw
    throw error;
  }
}

/**
 * Convert amount from one currency to another
 */
async function convertCurrency(amount, fromCurrency, toCurrency, date = null) {
  try {
    const rate = await getExchangeRate(fromCurrency, toCurrency, date);
    const convertedAmount = amount * rate;

    const toCurrencyInfo = SUPPORTED_CURRENCIES[toCurrency];
    const roundedAmount = Number(convertedAmount.toFixed(toCurrencyInfo.decimals));

    logger.info('Currency converted', {
      amount,
      fromCurrency,
      toCurrency,
      rate,
      convertedAmount: roundedAmount
    });

    return roundedAmount;
  } catch (error) {
    logger.error('Failed to convert currency', {
      error: error.message,
      amount,
      fromCurrency,
      toCurrency
    });
    throw error;
  }
}

/**
 * Get all supported currencies
 */
function getSupportedCurrencies() {
  return Object.values(SUPPORTED_CURRENCIES);
}

/**
 * Get currency information
 */
function getCurrencyInfo(currencyCode) {
  const currency = SUPPORTED_CURRENCIES[currencyCode];
  if (!currency) {
    throw new Error(`Unsupported currency: ${currencyCode}`);
  }
  return currency;
}

/**
 * Format amount with currency symbol
 */
function formatCurrency(amount, currencyCode, options = {}) {
  try {
    const currency = getCurrencyInfo(currencyCode);
    const {
      showSymbol = true,
      showCode = false,
      locale = 'en-US'
    } = options;

    const formattedAmount = new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals
    }).format(amount);

    let result = formattedAmount;

    if (showSymbol) {
      result = `${currency.symbol}${formattedAmount}`;
    }

    if (showCode) {
      result = `${result} ${currencyCode}`;
    }

    return result;
  } catch (error) {
    logger.error('Failed to format currency', {
      error: error.message,
      amount,
      currencyCode
    });
    return amount.toString();
  }
}

/**
 * Convert multiple amounts to a base currency
 */
async function convertMultipleCurrencies(amounts, baseCurrency) {
  try {
    const conversions = await Promise.all(
      amounts.map(async ({ amount, currency }) => {
        const convertedAmount = await convertCurrency(amount, currency, baseCurrency);
        return {
          originalAmount: amount,
          originalCurrency: currency,
          convertedAmount,
          baseCurrency
        };
      })
    );

    const total = conversions.reduce((sum, conv) => sum + conv.convertedAmount, 0);

    return {
      conversions,
      total,
      baseCurrency
    };
  } catch (error) {
    logger.error('Failed to convert multiple currencies', {
      error: error.message,
      baseCurrency
    });
    throw error;
  }
}

/**
 * Get historical exchange rates for a date range
 */
async function getHistoricalRates(fromCurrency, toCurrency, startDate, endDate) {
  try {
    const rates = [];
    const currentDate = new Date(startDate);
    const end = new Date(endDate);

    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      try {
        const rate = await getExchangeRate(fromCurrency, toCurrency, dateStr);
        rates.push({
          date: dateStr,
          rate
        });
      } catch (error) {
        logger.warn('Failed to get rate for date', {
          date: dateStr,
          error: error.message
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return rates;
  } catch (error) {
    logger.error('Failed to get historical rates', {
      error: error.message,
      fromCurrency,
      toCurrency
    });
    throw error;
  }
}

/**
 * Calculate exchange gain/loss
 */
async function calculateExchangeGainLoss({
  originalAmount,
  originalCurrency,
  paymentAmount,
  paymentCurrency,
  transactionDate,
  paymentDate
}) {
  try {
    // Convert original amount to payment currency at transaction date
    const originalRate = await getExchangeRate(originalCurrency, paymentCurrency, transactionDate);
    const expectedAmount = originalAmount * originalRate;

    // Calculate gain/loss
    const gainLoss = paymentAmount - expectedAmount;
    const gainLossPercentage = (gainLoss / expectedAmount) * 100;

    logger.info('Exchange gain/loss calculated', {
      originalAmount,
      originalCurrency,
      paymentAmount,
      paymentCurrency,
      gainLoss,
      gainLossPercentage
    });

    return {
      originalAmount,
      originalCurrency,
      expectedAmount,
      paymentAmount,
      paymentCurrency,
      gainLoss,
      gainLossPercentage,
      isGain: gainLoss > 0,
      isLoss: gainLoss < 0
    };
  } catch (error) {
    logger.error('Failed to calculate exchange gain/loss', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Clear exchange rate cache
 */
function clearCache() {
  exchangeRateCache.clear();
  logger.info('Exchange rate cache cleared');
}

// Helper function to fetch exchange rate from external API
async function fetchExchangeRate(fromCurrency, toCurrency, date) {
  // Placeholder implementation
  // In production, integrate with a real API like:
  // - exchangerate-api.com
  // - openexchangerates.org
  // - currencyapi.com
  // - fixer.io

  try {
    // Mock rates for demonstration (would fetch from real API)
    const mockRates = {
      'USD-EUR': 0.85,
      'USD-GBP': 0.73,
      'USD-JPY': 110.0,
      'USD-CAD': 1.25,
      'USD-AUD': 1.35,
      'EUR-USD': 1.18,
      'EUR-GBP': 0.86,
      'GBP-USD': 1.37,
      'GBP-EUR': 1.16
    };

    const key = `${fromCurrency}-${toCurrency}`;
    if (mockRates[key]) {
      return mockRates[key];
    }

    // Try reverse rate
    const reverseKey = `${toCurrency}-${fromCurrency}`;
    if (mockRates[reverseKey]) {
      return 1 / mockRates[reverseKey];
    }

    // Default fallback: convert through USD
    if (fromCurrency !== 'USD' && toCurrency !== 'USD') {
      const fromUSD = mockRates[`USD-${fromCurrency}`] || 1;
      const toUSD = mockRates[`USD-${toCurrency}`] || 1;
      return toUSD / fromUSD;
    }

    // Fallback rate
    return 1.0;
  } catch (error) {
    logger.error('Failed to fetch exchange rate from API', {
      error: error.message,
      fromCurrency,
      toCurrency
    });
    throw new Error('Unable to fetch exchange rate');
  }
}

module.exports = {
  getExchangeRate,
  convertCurrency,
  getSupportedCurrencies,
  getCurrencyInfo,
  formatCurrency,
  convertMultipleCurrencies,
  getHistoricalRates,
  calculateExchangeGainLoss,
  clearCache
};
