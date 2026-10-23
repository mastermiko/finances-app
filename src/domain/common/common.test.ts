import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  addPeriods,
  civilDateFromExcelSerial,
  civilDateFromLocal,
  civilFromDays,
  clampStartDay,
  comparePeriods,
  daysFromCivil,
  diffDays,
  fromDayNumber,
  isCivilDate,
  isPeriod,
  isoWeekday,
  parseCivilDate,
  periodBounds,
  periodDiff,
  periodOfDate,
  periodRange,
} from './civil-date';
import { cleanLabel, labelKey, matchesText, stripDiacritics } from './text';
import { isUuid, uuidv7, uuidv7Timestamp } from './uuid';

describe('civil dates', () => {
  it('validates dates and periods', () => {
    expect(isCivilDate('2024-02-29')).toBe(true);
    expect(isCivilDate('2025-02-29')).toBe(false);
    expect(isCivilDate('2025-13-01')).toBe(false);
    expect(isCivilDate(20250101)).toBe(false);
    expect(parseCivilDate('1899-12-31')).toBeNull();
    expect(isPeriod('2025-11')).toBe(true);
    expect(isPeriod('2025-00')).toBe(false);
    expect(isPeriod(null)).toBe(false);
  });

  it('round-trips day numbers (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -25000, max: 300000 }), (days) => {
        expect(daysFromCivil(civilFromDays(days))).toBe(days);
      }),
    );
  });

  it('does date arithmetic without time zones', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(diffDays('2025-03-01', '2025-02-01')).toBe(28);
    expect(addMonthsClamped('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsClamped('2025-01-15', -2)).toBe('2024-11-15');
    expect(isoWeekday('2026-10-23')).toBe(5); // Friday
    expect(isoWeekday('2026-10-26')).toBe(1); // Monday
    expect(fromDayNumber(0)).toBe('1970-01-01');
    expect(() => addDays('nope', 1)).toThrow(RangeError);
    expect(civilDateFromLocal(new Date(2026, 9, 23, 23, 59))).toBe('2026-10-23');
  });

  it('handles periods', () => {
    expect(addPeriods('2025-12', 1)).toBe('2026-01');
    expect(addPeriods('2026-01', -1)).toBe('2025-12');
    expect(periodDiff('2026-10', '2026-04')).toBe(6);
    expect(periodRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(periodRange('2026-02', '2026-01')).toEqual([]);
    expect(comparePeriods('2025-11', '2025-12')).toBe(-1);
    expect(comparePeriods('2025-12', '2025-12')).toBe(0);
  });

  it('derives the budget period from the month start day', () => {
    expect(periodOfDate('2025-10-30', 1)).toBe('2025-10');
    expect(periodOfDate('2025-10-30', 26)).toBe('2025-11');
    expect(periodOfDate('2025-10-25', 26)).toBe('2025-10');
    expect(periodOfDate('2025-12-28', 26)).toBe('2026-01');
    expect(periodBounds('2025-11', 1)).toEqual({ start: '2025-11-01', end: '2025-11-30' });
    expect(periodBounds('2025-11', 26)).toEqual({ start: '2025-10-26', end: '2025-11-25' });
    expect(clampStartDay(31)).toBe(28);
    expect(clampStartDay(0)).toBe(1);
  });

  it('every date belongs to the period whose bounds contain it (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20000 }),
        fc.integer({ min: 1, max: 28 }),
        (days, startDay) => {
          const date = fromDayNumber(days);
          const { start, end } = periodBounds(periodOfDate(date, startDay), startDay);
          expect(date >= start && date <= end).toBe(true);
        },
      ),
    );
  });

  it('converts Excel serial dates', () => {
    expect(civilDateFromExcelSerial(1)).toBe('1900-01-01');
    expect(civilDateFromExcelSerial(59)).toBe('1900-02-28');
    expect(civilDateFromExcelSerial(61)).toBe('1900-03-01');
    expect(civilDateFromExcelSerial(25569)).toBe('1970-01-01');
    expect(civilDateFromExcelSerial(45960)).toBe('2025-10-30');
    expect(civilDateFromExcelSerial(0, true)).toBe('1904-01-01');
    expect(civilDateFromExcelSerial(0)).toBeNull();
    expect(civilDateFromExcelSerial(Number.NaN)).toBeNull();
  });
});

describe('text', () => {
  it('cleans labels and builds comparison keys', () => {
    expect(cleanLabel('  Virement   Papa  ')).toBe('Virement Papa');
    expect(stripDiacritics('Planète Fitness')).toBe('Planete Fitness');
    expect(labelKey('Carter-Cash')).toBe(labelKey('carter cash '));
    expect(labelKey("Pot'Kfet")).toBe(labelKey("Pot'kfet"));
    expect(labelKey('Café')).toBe('cafe');
    expect(matchesText('Café aéroport', 'cafe')).toBe(true);
    expect(matchesText('Parking', '')).toBe(true);
    expect(matchesText('Parking', 'cafe')).toBe(false);
  });
});

describe('uuid v7', () => {
  it('generates valid, time-ordered ids', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_000);
    const c = uuidv7(1_700_000_000_001);
    expect(isUuid(a)).toBe(true);
    expect(a.charAt(14)).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(a.charAt(19));
    expect(a < b && b < c).toBe(true);
    expect(uuidv7Timestamp(c)).toBe(1_700_000_000_001);
    expect(uuidv7Timestamp('not-a-uuid')).toBeNull();
  });

  it('stays monotonic when the clock goes backwards', () => {
    const a = uuidv7(1_800_000_000_000);
    const b = uuidv7(1_799_999_999_000);
    expect(b > a).toBe(true);
  });

  it('stays unique over many ids in the same millisecond', () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7(1_900_000_000_000));
    expect(new Set(ids).size).toBe(5000);
    expect([...ids].sort()).toEqual(ids);
  });
});
