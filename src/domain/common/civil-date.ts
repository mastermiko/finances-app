/**
 * Civil (calendar) dates without time zone: "YYYY-MM-DD" strings, and budget
 * periods: "YYYY-MM". All arithmetic is done on day numbers (days since
 * 1970-01-01) with Howard Hinnant's algorithms, so results never depend on the
 * device time zone or daylight saving changes.
 */

export type CivilDate = string; // YYYY-MM-DD
export type Period = string; // YYYY-MM

export const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface Ymd {
  readonly y: number;
  readonly m: number; // 1-12
  readonly d: number; // 1-31
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 30;
}

export function parseCivilDate(value: string): Ymd | null {
  const match = CIVIL_DATE_RE.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isCivilDate(value: unknown): value is CivilDate {
  return typeof value === 'string' && parseCivilDate(value) !== null;
}

export function isPeriod(value: unknown): value is Period {
  if (typeof value !== 'string') return false;
  const match = PERIOD_RE.exec(value);
  if (!match) return false;
  const y = Number(match[1]);
  return y >= 1900 && y <= 2999;
}

const pad = (n: number, len = 2): string => n.toString().padStart(len, '0');

export function formatYmd({ y, m, d }: Ymd): CivilDate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Days since 1970-01-01 for a proleptic Gregorian date. */
export function daysFromCivil({ y, m, d }: Ymd): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(days: number): Ymd {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return { y, m, d };
}

function mustParse(date: CivilDate): Ymd {
  const parsed = parseCivilDate(date);
  if (!parsed) throw new RangeError(`Invalid civil date: ${date}`);
  return parsed;
}

export function toDayNumber(date: CivilDate): number {
  return daysFromCivil(mustParse(date));
}

export function fromDayNumber(days: number): CivilDate {
  return formatYmd(civilFromDays(days));
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return fromDayNumber(toDayNumber(date) + days);
}

export function diffDays(a: CivilDate, b: CivilDate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** Adds months, clamping the day to the end of the target month (Jan 31 + 1 = Feb 28/29). */
export function addMonthsClamped(date: CivilDate, months: number): CivilDate {
  const { y, m, d } = mustParse(date);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return formatYmd({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: CivilDate): number {
  const days = toDayNumber(date);
  // 1970-01-01 was a Thursday (4)
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

/** Converts a Date to the civil date as seen in the device's local time zone. */
export function civilDateFromLocal(date: Date): CivilDate {
  return formatYmd({ y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() });
}

// ---------------------------------------------------------------------------
// Periods

export function parsePeriod(period: Period): { y: number; m: number } {
  const match = PERIOD_RE.exec(period);
  if (!match) throw new RangeError(`Invalid period: ${period}`);
  return { y: Number(match[1]), m: Number(match[2]) };
}

export function formatPeriod(y: number, m: number): Period {
  return `${pad(y, 4)}-${pad(m)}`;
}

export function addPeriods(period: Period, n: number): Period {
  const { y, m } = parsePeriod(period);
  const index = y * 12 + (m - 1) + n;
  return formatPeriod(Math.floor(index / 12), (index % 12) + 1);
}

export function comparePeriods(a: Period, b: Period): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function periodDiff(a: Period, b: Period): number {
  const pa = parsePeriod(a);
  const pb = parsePeriod(b);
  return pa.y * 12 + pa.m - (pb.y * 12 + pb.m);
}

/** Inclusive list of periods from `from` to `to`. Empty if from > to. */
export function periodRange(from: Period, to: Period): Period[] {
  const out: Period[] = [];
  const count = periodDiff(to, from);
  for (let i = 0; i <= count; i += 1) out.push(addPeriods(from, i));
  return out;
}

export function clampStartDay(startDay: number): number {
  return Math.min(28, Math.max(1, Math.trunc(startDay)));
}

/**
 * Budget period of a date. With a start day D > 1, the budget month named M
 * runs from day D of month M-1 to day D-1 of month M (it is named after the
 * calendar month in which it ends). Example, D = 26: 2025-10-30 → 2025-11.
 */
export function periodOfDate(date: CivilDate, startDay = 1): Period {
  const { y, m, d } = mustParse(date);
  const day = clampStartDay(startDay);
  const base = formatPeriod(y, m);
  return day > 1 && d >= day ? addPeriods(base, 1) : base;
}

/** First and last civil dates of a budget period. */
export function periodBounds(period: Period, startDay = 1): { start: CivilDate; end: CivilDate } {
  const day = clampStartDay(startDay);
  const { y, m } = parsePeriod(period);
  if (day === 1) {
    return { start: formatYmd({ y, m, d: 1 }), end: formatYmd({ y, m, d: daysInMonth(y, m) }) };
  }
  const prev = parsePeriod(addPeriods(period, -1));
  return {
    start: formatYmd({ y: prev.y, m: prev.m, d: day }),
    end: formatYmd({ y, m, d: day - 1 }),
  };
}

export function periodOfToday(today: CivilDate, startDay = 1): Period {
  return periodOfDate(today, startDay);
}

/**
 * Converts an Excel serial date (1900 date system, with the Lotus leap-year bug)
 * or 1904 system to a civil date.
 */
export function civilDateFromExcelSerial(serial: number, date1904 = false): CivilDate | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (date1904) return fromDayNumber(whole + daysFromCivil({ y: 1904, m: 1, d: 1 }));
  if (whole < 1) return null;
  // Serial 60 is the non-existent 1900-02-29; serials > 60 are shifted by one day.
  const offset = whole > 60 ? whole - 1 : whole;
  return fromDayNumber(daysFromCivil({ y: 1899, m: 12, d: 31 }) + offset);
}
