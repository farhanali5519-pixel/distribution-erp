import React from 'react';
import { 
  formatCurrency, 
  formatNumber, 
  formatInteger, 
  formatDecimal, 
  formatPercentage 
} from '@/shared/utils/formatting';

export interface NumericValueProps {
  value?: number | string | null | undefined;
  children?: React.ReactNode;
  type?: 'currency' | 'number' | 'integer' | 'decimal' | 'percent' | 'phone' | 'cnic' | 'raw' | 'text' | 'date';
  currency?: string;
  decimals?: number;
  showCurrency?: boolean;
  showSign?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

/**
 * Global Enterprise Numeric Value Display Component
 * Enforces global numeric typography, tabular alignment, consistent decimals, and thousand separators.
 * Supports numbers, currencies, percentages, and user-facing identifiers (phone, CNIC, dates).
 */
export function NumericValue({
  value,
  children,
  type = 'number',
  currency = 'PKR',
  decimals,
  showCurrency = false,
  showSign = false,
  prefix,
  suffix,
  className = '',
  align,
}: NumericValueProps) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : '';

  // If children are supplied or type is raw/phone/cnic/date/text, render without decimal conversion
  if (children !== undefined || ['phone', 'cnic', 'raw', 'text', 'date'].includes(type)) {
    const content = children !== undefined ? children : (value ?? '');
    return (
      <span className={`numeric-text tracking-tight font-medium ${alignClass} ${className}`.trim()}>
        {prefix && <span>{prefix}</span>}
        {content}
        {suffix && <span className="ml-0.5 text-[0.85em] text-slate-500">{suffix}</span>}
      </span>
    );
  }

  let formatted = '';

  switch (type) {
    case 'currency':
      formatted = formatCurrency(value, currency, { decimals: decimals ?? 2, showCurrency });
      break;
    case 'integer':
      formatted = formatInteger(value);
      break;
    case 'decimal':
      formatted = formatDecimal(value, decimals ?? 2);
      break;
    case 'percent':
      formatted = formatPercentage(value, decimals ?? 1, showSign);
      break;
    case 'number':
    default:
      formatted = formatNumber(value, { decimals });
      break;
  }

  return (
    <span className={`numeric-text tabular-nums tracking-tight font-medium ${alignClass} ${className}`.trim()}>
      {prefix && <span>{prefix}</span>}
      {formatted}
      {suffix && <span className="ml-0.5 text-[0.85em] text-slate-500">{suffix}</span>}
    </span>
  );
}

export default NumericValue;
