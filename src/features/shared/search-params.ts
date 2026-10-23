/**
 * URL search parameter validation without Zod (kept out of the initial bundle).
 * Same contract as `.optional().catch(undefined)`: an invalid value is dropped.
 * TanStack Router has already JSON-decoded the values (numbers, booleans).
 */
import { isPeriod, type Period } from '@/domain/common/civil-date';

export type RawSearch = Record<string, unknown>;

export function optString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined;
}

/** Like optString, but numbers are accepted and converted (z.coerce.string()). */
export function optCoercedString(value: unknown, max: number): string | undefined {
  return optString(typeof value === 'number' ? String(value) : value, max);
}

export function optPeriod(value: unknown): Period | undefined {
  return typeof value === 'string' && isPeriod(value) ? value : undefined;
}

export function optEnum<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export function optNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function optBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Drops undefined entries so that the URL stays clean. */
export function compact<T extends object>(search: T): T {
  return Object.fromEntries(Object.entries(search).filter(([, v]) => v !== undefined)) as T;
}
