import { describe, expect, it } from 'vitest';
import type { Recurrence } from '../model/types';
import {
  formatRRule,
  generateOccurrences,
  nextOccurrenceAfter,
  nthOccurrence,
  occurrencesBetween,
  parseRRule,
  presetRule,
  type RecurrenceRule,
} from './recurrences';

const monthly: RecurrenceRule = {
  freq: 'MONTHLY',
  interval: 1,
  byMonthDay: null,
  until: null,
  count: null,
};

describe('RRULE subset', () => {
  it('parses and formats round-trip', () => {
    const text = 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=-1;UNTIL=20271231';
    const parsed = parseRRule(`RRULE:${text}`);
    expect(parsed).toEqual({
      ok: true,
      rule: { freq: 'MONTHLY', interval: 2, byMonthDay: -1, until: '2027-12-31', count: null },
    });
    if (parsed.ok) expect(formatRRule(parsed.rule)).toBe(text);
  });

  it.each([
    ['', 'freq'],
    ['FREQ=HOURLY', 'freq'],
    ['FREQ=DAILY;INTERVAL=0', 'interval'],
    ['FREQ=MONTHLY;BYMONTHDAY=32', 'bymonthday'],
    ['FREQ=MONTHLY;UNTIL=2027', 'until'],
    ['FREQ=MONTHLY;COUNT=0', 'count'],
    ['FREQ=MONTHLY;COUNT=2;UNTIL=20271231', 'untilAndCount'],
    ['FREQ=MONTHLY;BYDAY=MO', 'unsupported'],
  ])('rejects %j (%s)', (text, error) => {
    expect(parseRRule(text)).toEqual({ ok: false, error });
  });
});

describe('occurrences', () => {
  it('clamps the 31st to short months and comes back', () => {
    expect([0, 1, 2, 3].map((n) => nthOccurrence(monthly, '2026-01-31', n))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('supports daily, weekly, yearly, last day of month, until and count', () => {
    expect(nthOccurrence({ ...monthly, freq: 'DAILY', interval: 3 }, '2026-10-01', 2)).toBe(
      '2026-10-07',
    );
    expect(nthOccurrence({ ...monthly, freq: 'WEEKLY' }, '2026-10-01', 2)).toBe('2026-10-15');
    expect(nthOccurrence({ ...monthly, freq: 'YEARLY' }, '2024-02-29', 1)).toBe('2025-02-28');
    expect(nthOccurrence({ ...monthly, byMonthDay: -1 }, '2026-01-15', 1)).toBe('2026-02-28');
    expect(
      occurrencesBetween({ ...monthly, count: 2 }, '2026-01-05', '2026-01-01', '2026-12-31'),
    ).toEqual(['2026-01-05', '2026-02-05']);
    expect(
      occurrencesBetween(
        { ...monthly, until: '2026-03-10' },
        '2026-01-05',
        '2026-02-01',
        '2026-12-31',
      ),
    ).toEqual(['2026-02-05', '2026-03-05']);
    expect(nextOccurrenceAfter(monthly, '2026-01-05', '2026-01-05')).toBe('2026-02-05');
    expect(nextOccurrenceAfter({ ...monthly, count: 1 }, '2026-01-05', '2026-01-05')).toBeNull();
    expect(
      nextOccurrenceAfter({ ...monthly, until: '2026-01-31' }, '2026-01-05', '2026-01-05'),
    ).toBeNull();
    expect(nextOccurrenceAfter(monthly, '2026-01-05', null)).toBe('2026-01-05');
  });

  it('offers presets', () => {
    expect(presetRule('monthly').freq).toBe('MONTHLY');
    expect(presetRule('weekly').freq).toBe('WEEKLY');
    expect(presetRule('yearly').freq).toBe('YEARLY');
    expect(presetRule('custom', { freq: 'DAILY', interval: 2 })).toMatchObject({
      freq: 'DAILY',
      interval: 2,
    });
  });
});

describe('generation', () => {
  const base: Recurrence = {
    id: '0190a0a0-0000-7000-8000-000000000001',
    name: 'Loyer',
    template: {
      accountId: '0190a0a0-0000-7000-8000-000000000002',
      toAccountId: null,
      amountMinor: -55000,
      currency: 'EUR',
      kind: 'expense',
      categoryId: '0190a0a0-0000-7000-8000-000000000003',
      label: 'Loyer',
      note: '',
      tagIds: [],
    },
    rule: 'FREQ=MONTHLY;INTERVAL=1',
    dtstart: '2026-09-05',
    undated: false,
    nextDate: '2026-09-05',
    autoConfirm: false,
    active: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  it('creates planned occurrences up to the horizon and advances nextDate', () => {
    const r = generateOccurrences(
      base,
      '2026-11-30',
      '2026-10-23',
      1,
      '2026-10-23T00:00:00.000Z',
      new Set(),
    );
    expect(r.operations.map((o) => [o.date, o.status, o.recurrenceKey])).toEqual([
      ['2026-09-05', 'planned', '2026-09-05'],
      ['2026-10-05', 'planned', '2026-10-05'],
      ['2026-11-05', 'planned', '2026-11-05'],
    ]);
    expect(r.nextDate).toBe('2026-12-05');
  });

  it('is idempotent thanks to occurrence keys, auto-confirms reached dates', () => {
    const r = generateOccurrences(
      { ...base, autoConfirm: true },
      '2026-11-30',
      '2026-10-23',
      1,
      '',
      new Set(['2026-09-05']),
    );
    expect(r.operations.map((o) => [o.date, o.status])).toEqual([
      ['2026-10-05', 'cleared'],
      ['2026-11-05', 'planned'],
    ]);
  });

  it('undated charges are keyed by budget period', () => {
    const r = generateOccurrences(
      { ...base, undated: true },
      '2026-10-31',
      '2026-10-23',
      1,
      '',
      new Set(['2026-09']),
    );
    expect(r.operations.map((o) => [o.date, o.period, o.recurrenceKey])).toEqual([
      [null, '2026-10', '2026-10'],
    ]);
  });

  it('generates both legs of a recurring transfer', () => {
    const r = generateOccurrences(
      {
        ...base,
        template: {
          ...base.template,
          kind: 'transfer',
          categoryId: null,
          amountMinor: 10000,
          toAccountId: '0190a0a0-0000-7000-8000-000000000009',
        },
      },
      '2026-09-30',
      '2026-10-23',
      1,
      '',
      new Set(),
    );
    expect(r.operations).toHaveLength(2);
    expect(r.operations[0]?.transferGroupId).toBe(r.operations[1]?.transferGroupId);
  });

  it('does nothing when inactive, exhausted or invalid', () => {
    expect(
      generateOccurrences({ ...base, active: false }, '2026-12-31', '2026-10-23', 1, '', new Set())
        .operations,
    ).toEqual([]);
    expect(
      generateOccurrences({ ...base, nextDate: null }, '2026-12-31', '2026-10-23', 1, '', new Set())
        .operations,
    ).toEqual([]);
    expect(
      generateOccurrences({ ...base, rule: 'nope' }, '2026-12-31', '2026-10-23', 1, '', new Set())
        .operations,
    ).toEqual([]);
  });
});
