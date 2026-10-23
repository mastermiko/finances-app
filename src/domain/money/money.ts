/**
 * Money value object. Amounts are always integer minor units (cents for EUR).
 * Floating point numbers never represent money in this code base.
 */

export type CurrencyCode = string;

export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

/** ISO 4217 minor-unit exponents for currencies that do not use 2 decimals. */
const EXPONENTS: Readonly<Record<string, number>> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

export const DEFAULT_CURRENCY: CurrencyCode = 'EUR';

export function currencyExponent(currency: CurrencyCode): number {
  return EXPONENTS[currency] ?? 2;
}

export function isMinorAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertMinor(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Amount must be a safe integer in minor units, got ${String(value)}`);
  }
  return value;
}

export function money(amountMinor: number, currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  return { amountMinor: assertMinor(amountMinor), currency };
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function negate(a: Money): Money {
  return money(a.amountMinor === 0 ? 0 : -a.amountMinor, a.currency);
}

export function sumMinor(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return assertMinor(total);
}

/**
 * Converts a decimal number coming from an external source (spreadsheet cell, CSV)
 * to minor units, rounding half away from zero. The conversion goes through the
 * shortest decimal representation of the float to avoid binary artefacts
 * (e.g. -3.789999999999992 → -379).
 */
export function minorFromNumber(value: number, currency: CurrencyCode = DEFAULT_CURRENCY): number {
  if (!Number.isFinite(value)) throw new RangeError('Amount must be finite');
  const exponent = currencyExponent(currency);
  // toPrecision(15) strips binary noise while keeping every significant digit a user can type.
  const text = Number(value.toPrecision(15)).toString();
  return roundDecimalStringToMinor(text, exponent);
}

/** Rounds a plain or exponent decimal string to minor units (half away from zero). */
export function roundDecimalStringToMinor(text: string, exponent: number): number {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text.trim());
  if (!match) throw new RangeError(`Not a decimal number: ${text}`);
  const sign = match[1] === '-' ? -1n : 1n;
  let intPart = match[2] ?? '';
  let fracPart = match[3] ?? '';
  const exp = Number(match[4] ?? '0');
  if (intPart === '' && fracPart === '') throw new RangeError(`Not a decimal number: ${text}`);
  // Shift the decimal point according to the exponent.
  if (exp > 0) {
    const shift = fracPart.padEnd(exp, '0');
    intPart += shift.slice(0, exp);
    fracPart = shift.slice(exp);
  } else if (exp < 0) {
    const padded = intPart.padStart(-exp + 1, '0');
    fracPart = padded.slice(padded.length + exp) + fracPart;
    intPart = padded.slice(0, padded.length + exp);
  }
  const keep = fracPart.padEnd(exponent + 1, '0');
  const unitsText = (intPart || '0') + keep.slice(0, exponent);
  let units = BigInt(unitsText);
  const nextDigit = Number(keep.charAt(exponent));
  if (nextDigit >= 5) units += 1n;
  const result = Number(sign * units);
  return result === 0 ? 0 : assertMinor(result);
}

/** Formats minor units as a plain decimal string with "." (machine format, e.g. CSV). */
export function minorToDecimalString(
  amountMinor: number,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): string {
  const exponent = currencyExponent(currency);
  const negative = amountMinor < 0;
  const digits = Math.abs(amountMinor)
    .toString()
    .padStart(exponent + 1, '0');
  const intPart = exponent === 0 ? digits : digits.slice(0, digits.length - exponent);
  const frac = exponent === 0 ? '' : `.${digits.slice(digits.length - exponent)}`;
  return `${negative ? '-' : ''}${intPart}${frac}`;
}

/** Converts minor units to a JS number for display-only purposes (charts, Intl). */
export function minorToNumber(
  amountMinor: number,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): number {
  return amountMinor / 10 ** currencyExponent(currency);
}

/**
 * Splits 100 % between parts proportionally using the largest remainder method,
 * so displayed percentages (with `decimals` digits) always add up to exactly 100.
 */
export function percentagesLargestRemainder(parts: readonly number[], decimals = 1): number[] {
  const total = parts.reduce((acc, p) => acc + Math.max(0, p), 0);
  if (total <= 0) return parts.map(() => 0);
  const scale = 100 * 10 ** decimals;
  const raw = parts.map((p) => (Math.max(0, p) * scale) / total);
  const floored = raw.map((r) => Math.floor(r));
  let remaining = scale - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floored[i] = (floored[i] ?? 0) + 1;
    remaining -= 1;
  }
  return floored.map((v) => v / 10 ** decimals);
}
