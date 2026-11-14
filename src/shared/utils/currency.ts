/**
 * Strict Minor-Unit (Paisa/Cent) Integer Math for Double-Entry Accounting
 * Stores monetary amounts as integers to eliminate IEEE-754 floating point rounding errors.
 * 1 PKR = 100 Paisas.
 */

export * from './formatting';

export function toPaisas(amount: number | string): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100);
}

export function fromPaisas(paisas: number): number {
  return paisas / 100;
}

export function roundCurrency(amount: number): number {
  return fromPaisas(toPaisas(amount));
}

export function formatPaisas(paisas: number, currency: string = 'PKR', showCurrency: boolean = false): string {
  const decimal = fromPaisas(paisas);
  const formatted = decimal.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return showCurrency ? `${currency} ${formatted}` : formatted;
}

export function arePaisasEqual(debitPaisas: number, creditPaisas: number): boolean {
  return Math.round(debitPaisas) === Math.round(creditPaisas);
}

export function areBalancesEqual(debits: number, credits: number): boolean {
  return arePaisasEqual(toPaisas(debits), toPaisas(credits));
}
