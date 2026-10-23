/**
 * Local error journal (no telemetry): message, stack, route and version only,
 * never financial data. Capped at 100 entries, exportable from the About page.
 */
import { kvGet, kvSet } from './repositories/entities';
import { nowIso } from './clock';

export interface ErrorEntry {
  readonly at: string;
  readonly message: string;
  readonly stack: string;
  readonly route: string;
  readonly appVersion: string;
}

const KEY = 'errorLog';
const MAX = 100;

/** Strips anything that looks like an amount or a long number from free text. */
export function scrub(text: string): string {
  return text.replace(/-?\d[\d\s.,]*\d|\d/g, '#').slice(0, 2000);
}

export async function logError(error: unknown, route: string, appVersion: string): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const entry: ErrorEntry = {
      at: nowIso(),
      message: scrub(`${err.name}: ${err.message}`),
      stack: (err.stack ?? '').split('\n').slice(0, 12).join('\n').slice(0, 4000),
      route: route.replace(/\?.*$/, ''),
      appVersion,
    };
    const list = (await kvGet<ErrorEntry[]>(KEY)) ?? [];
    await kvSet(KEY, [entry, ...list].slice(0, MAX));
  } catch {
    // The error journal must never throw.
  }
}

export async function readErrorLog(): Promise<ErrorEntry[]> {
  return (await kvGet<ErrorEntry[]>(KEY)) ?? [];
}

export async function clearErrorLog(): Promise<void> {
  await kvSet(KEY, []);
}
