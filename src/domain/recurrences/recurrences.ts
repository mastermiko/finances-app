/**
 * Recurring operations. Rules use a subset of RFC 5545 RRULE:
 *   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY ; INTERVAL=n ; BYMONTHDAY=d|-1 ; UNTIL=YYYYMMDD ; COUNT=n
 * Occurrences are generated as "planned" operations, confirmed in one click
 * (or automatically when autoConfirm is set and the date is reached).
 */
import {
  addDays,
  addMonthsClamped,
  daysInMonth,
  formatYmd,
  parseCivilDate,
  periodOfDate,
  type CivilDate,
} from '../common/civil-date';
import { uuidv7 } from '../common/uuid';
import type { Operation, Recurrence } from '../model/types';
import { buildOperation, buildTransfer } from '../operations/operations';

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceRule {
  readonly freq: Frequency;
  readonly interval: number;
  /** Day of month for MONTHLY/YEARLY (−1 = last day). Defaults to dtstart's day. */
  readonly byMonthDay: number | null;
  readonly until: CivilDate | null;
  readonly count: number | null;
}

export type RuleParseResult = { ok: true; rule: RecurrenceRule } | { ok: false; error: string };

export function parseRRule(text: string): RuleParseResult {
  const parts = text
    .replace(/^RRULE:/i, '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  let freq: Frequency | null = null;
  let interval = 1;
  let byMonthDay: number | null = null;
  let until: CivilDate | null = null;
  let count: number | null = null;
  for (const part of parts) {
    const [rawKey, rawValue = ''] = part.split('=');
    const key = (rawKey ?? '').toUpperCase();
    const value = rawValue.toUpperCase();
    switch (key) {
      case 'FREQ':
        if (value !== 'DAILY' && value !== 'WEEKLY' && value !== 'MONTHLY' && value !== 'YEARLY') {
          return { ok: false, error: 'freq' };
        }
        freq = value;
        break;
      case 'INTERVAL':
        interval = Number(value);
        if (!Number.isInteger(interval) || interval < 1 || interval > 366)
          return { ok: false, error: 'interval' };
        break;
      case 'BYMONTHDAY':
        byMonthDay = Number(value);
        if (
          !Number.isInteger(byMonthDay) ||
          byMonthDay === 0 ||
          byMonthDay < -1 ||
          byMonthDay > 31
        ) {
          return { ok: false, error: 'bymonthday' };
        }
        break;
      case 'UNTIL': {
        const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
        const date = m ? `${m[1]}-${m[2]}-${m[3]}` : '';
        if (!parseCivilDate(date)) return { ok: false, error: 'until' };
        until = date;
        break;
      }
      case 'COUNT':
        count = Number(value);
        if (!Number.isInteger(count) || count < 1 || count > 10000)
          return { ok: false, error: 'count' };
        break;
      default:
        return { ok: false, error: 'unsupported' };
    }
  }
  if (!freq) return { ok: false, error: 'freq' };
  if (until !== null && count !== null) return { ok: false, error: 'untilAndCount' };
  return { ok: true, rule: { freq, interval, byMonthDay, until, count } };
}

export function formatRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`, `INTERVAL=${rule.interval}`];
  if (rule.byMonthDay !== null) parts.push(`BYMONTHDAY=${rule.byMonthDay}`);
  if (rule.until) parts.push(`UNTIL=${rule.until.replaceAll('-', '')}`);
  if (rule.count !== null) parts.push(`COUNT=${rule.count}`);
  return parts.join(';');
}

function withMonthDay(date: CivilDate, byMonthDay: number | null): CivilDate {
  if (byMonthDay === null) return date;
  const ymd = parseCivilDate(date);
  if (!ymd) return date;
  const dim = daysInMonth(ymd.y, ymd.m);
  const day = byMonthDay === -1 ? dim : Math.min(byMonthDay, dim);
  return formatYmd({ y: ymd.y, m: ymd.m, d: day });
}

/** n-th occurrence (0-based) of a rule starting at dtstart. */
export function nthOccurrence(rule: RecurrenceRule, dtstart: CivilDate, n: number): CivilDate {
  switch (rule.freq) {
    case 'DAILY':
      return addDays(dtstart, n * rule.interval);
    case 'WEEKLY':
      return addDays(dtstart, n * 7 * rule.interval);
    case 'MONTHLY':
      return withMonthDay(addMonthsClamped(dtstart, n * rule.interval), rule.byMonthDay);
    case 'YEARLY':
      return withMonthDay(addMonthsClamped(dtstart, n * 12 * rule.interval), rule.byMonthDay);
    default:
      return dtstart;
  }
}

/** Occurrences in [from, to] (inclusive), at most `limit`. */
export function occurrencesBetween(
  rule: RecurrenceRule,
  dtstart: CivilDate,
  from: CivilDate,
  to: CivilDate,
  limit = 1000,
): CivilDate[] {
  const out: CivilDate[] = [];
  const max = rule.count ?? Number.POSITIVE_INFINITY;
  for (let n = 0; n < max && out.length < limit && n < 100000; n += 1) {
    const date = nthOccurrence(rule, dtstart, n);
    if (rule.until && date > rule.until) break;
    if (date > to) break;
    if (date >= from) out.push(date);
  }
  return out;
}

/** Next occurrence strictly after `after`, or null when the rule is exhausted. */
export function nextOccurrenceAfter(
  rule: RecurrenceRule,
  dtstart: CivilDate,
  after: CivilDate | null,
): CivilDate | null {
  const max = rule.count ?? Number.POSITIVE_INFINITY;
  for (let n = 0; n < max && n < 100000; n += 1) {
    const date = nthOccurrence(rule, dtstart, n);
    if (rule.until && date > rule.until) return null;
    if (after === null || date > after) return date;
  }
  return null;
}

export interface GenerationResult {
  readonly operations: Operation[];
  readonly nextDate: CivilDate | null;
}

/**
 * Generates the operations of a recurrence from its `nextDate` up to `horizon`.
 * Undated recurrences produce one charge per budget period ("Aucune" charges),
 * keyed by period so they are never generated twice.
 */
export function generateOccurrences(
  recurrence: Recurrence,
  horizon: CivilDate,
  today: CivilDate,
  startDay: number,
  nowIso: string,
  existingKeys: ReadonlySet<string>,
): GenerationResult {
  const parsed = parseRRule(recurrence.rule);
  if (!parsed.ok || !recurrence.active || recurrence.nextDate === null) {
    return { operations: [], nextDate: recurrence.nextDate };
  }
  const rule = parsed.rule;
  const ops: Operation[] = [];
  let next: CivilDate | null = recurrence.nextDate;
  let guard = 0;
  while (next !== null && next <= horizon && guard < 500) {
    guard += 1;
    const period = periodOfDate(next, startDay);
    const occurrenceKey = recurrence.undated ? period : next;
    if (!existingKeys.has(occurrenceKey)) {
      const status = recurrence.autoConfirm && next <= today ? 'cleared' : 'planned';
      const t = recurrence.template;
      const date = recurrence.undated ? null : next;
      if (t.kind === 'transfer' && t.toAccountId) {
        ops.push(
          ...buildTransfer(
            {
              fromAccountId: t.accountId,
              toAccountId: t.toAccountId,
              amountMinor: t.amountMinor,
              currency: t.currency,
              date,
              period,
              label: t.label,
              note: t.note,
              tagIds: t.tagIds,
              status,
              recurrenceId: recurrence.id,
              recurrenceKey: occurrenceKey,
            },
            startDay,
            nowIso,
          ),
        );
      } else if (t.kind !== 'transfer') {
        ops.push(
          buildOperation(
            {
              accountId: t.accountId,
              date,
              period,
              amountMinor: t.amountMinor,
              currency: t.currency,
              kind: t.kind,
              categoryId: t.categoryId,
              label: t.label,
              note: t.note,
              tagIds: t.tagIds,
              status,
              recurrenceId: recurrence.id,
              recurrenceKey: occurrenceKey,
            },
            startDay,
            nowIso,
            uuidv7(),
          ),
        );
      }
    }
    next = nextOccurrenceAfter(rule, recurrence.dtstart, next);
  }
  return { operations: ops, nextDate: next };
}

/** Human-friendly presets offered by the UI. */
export function presetRule(
  preset: 'monthly' | 'weekly' | 'yearly' | 'custom',
  custom?: Partial<RecurrenceRule>,
): RecurrenceRule {
  // The anchor day comes from Recurrence.dtstart: occurrences are recomputed from it each
  // time, so "the 31st" falls back to the last day of shorter months and comes back afterwards.
  switch (preset) {
    case 'monthly':
      return { freq: 'MONTHLY', interval: 1, byMonthDay: null, until: null, count: null };
    case 'weekly':
      return { freq: 'WEEKLY', interval: 1, byMonthDay: null, until: null, count: null };
    case 'yearly':
      return { freq: 'YEARLY', interval: 1, byMonthDay: null, until: null, count: null };
    default:
      return {
        freq: custom?.freq ?? 'MONTHLY',
        interval: custom?.interval ?? 1,
        byMonthDay: custom?.byMonthDay ?? null,
        until: custom?.until ?? null,
        count: custom?.count ?? null,
      };
  }
}
