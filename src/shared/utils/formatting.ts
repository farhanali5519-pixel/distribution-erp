/**
 * Global Enterprise Numeric Formatting Standard
 * 
 * Rules:
 * 1. Standard business font for all numbers (Inter / tabular-nums)
 * 2. Proper thousand separators (e.g. 1,250,000)
 * 3. Consistent decimals (e.g. 1,250.00)
 * 4. Consistent financial formatting (e.g. 1,250.00 without PKR prefix)
 * 5. Consistent percentage formatting (e.g. 15.0%)
 * 6. Right-alignment in financial and numeric table cells
 */

export interface FormatCurrencyOptions {
  currency?: string;
  decimals?: number;
  showCurrency?: boolean;
  fallback?: string;
}

export interface FormatNumberOptions {
  decimals?: number;
  minDecimals?: number;
  maxDecimals?: number;
  fallback?: string;
}

/**
 * Format a monetary amount with thousand separators and consistent decimals.
 * Default currency: 'PKR', default decimals: 2.
 * Note: showCurrency defaults to false to display clean enterprise amounts without "PKR" in Pakistan.
 * Example: 1250000 -> "1,250,000.00"
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string = 'PKR',
  options?: { decimals?: number; showCurrency?: boolean; fallback?: string }
): string {
  const decimals = options?.decimals ?? 2;
  const showCurrency = options?.showCurrency ?? false;
  const fallback = options?.fallback ?? (showCurrency ? `${currency} 0.00` : '0.00');
  if (amount === null || amount === undefined || amount === '') return fallback;

  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return fallback;

  const formattedNum = num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return showCurrency ? `${currency} ${formattedNum}` : formattedNum;
}

/**
 * Format a number with thousand separators.
 * Example: 1250000 -> "1,250,000"
 */
export function formatNumber(
  amount: number | string | null | undefined,
  options?: FormatNumberOptions
): string {
  const fallback = options?.fallback ?? '0';
  if (amount === null || amount === undefined || amount === '') return fallback;

  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return fallback;

  if (options?.decimals !== undefined) {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: options.decimals,
      maximumFractionDigits: options.decimals,
    });
  }

  const minDecimals = options?.minDecimals ?? 0;
  const maxDecimals = options?.maxDecimals ?? 2;

  return num.toLocaleString('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * Format an integer with thousand separators (no decimal points).
 * Example: 1250000 -> "1,250,000"
 */
export function formatInteger(
  amount: number | string | null | undefined,
  fallback: string = '0'
): string {
  if (amount === null || amount === undefined || amount === '') return fallback;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return fallback;

  return Math.round(num).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  });
}

/**
 * Format a decimal number with fixed decimal places and thousand separators.
 * Example: formatDecimal(1250, 2) -> "1,250.00"
 */
export function formatDecimal(
  amount: number | string | null | undefined,
  decimals: number = 2,
  fallback: string = '0.00'
): string {
  if (amount === null || amount === undefined || amount === '') return fallback;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return fallback;

  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a percentage with a single decimal place by default.
 * Example: 15.5 -> "15.5%" or 15 -> "15.0%" (or "15%" if decimals=0)
 */
export function formatPercentage(
  amount: number | string | null | undefined,
  decimals: number = 1,
  showPlusSign: boolean = false
): string {
  if (amount === null || amount === undefined || amount === '') return '0%';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0%';

  const sign = showPlusSign && num > 0 ? '+' : '';
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${sign}${formatted}%`;
}

/**
 * Format a quantity with unit and thousand separators.
 * Example: formatQuantity(1250, 'PCS') -> "1,250 PCS"
 */
export function formatQuantity(
  amount: number | string | null | undefined,
  unit?: string
): string {
  const formatted = formatInteger(amount);
  return unit ? `${formatted} ${unit}` : formatted;
}
