/** Injectable clock, so that tests and E2E scenarios control "now". */
import { civilDateFromLocal, type CivilDate } from '@/domain/common/civil-date';

let override: (() => Date) | null = null;

export function now(): Date {
  return override ? override() : new Date();
}

export function nowIso(): string {
  return now().toISOString();
}

export function today(): CivilDate {
  return civilDateFromLocal(now());
}

export function setClock(fn: (() => Date) | null): void {
  override = fn;
}
