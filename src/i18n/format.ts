/**
 * Locale-aware formatting (Intl). Amounts always show their sign and currency:
 * "−12,50 €", "+1 234,56 €".
 */
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { currencyExponent, minorToNumber } from '@/domain/money/money';
import { parseCivilDate, parsePeriod } from '@/domain/common/civil-date';
import { useFormatOptions } from './index';

export interface Formatters {
  readonly locale: string;
  readonly currency: string;
  /** Signed amount: +12,50 € / −12,50 € (0,00 € without sign). */
  money: (
    minor: number,
    options?: { sign?: 'always' | 'auto' | 'never'; currency?: string; compact?: boolean },
  ) => string;
  /** Plain number in the user's locale, for editable fields (12,5). */
  amountInput: (minor: number) => string;
  date: (civil: string) => string;
  dateLong: (civil: string) => string;
  weekdayDate: (civil: string) => string;
  period: (period: string, style?: 'long' | 'short') => string;
  percent: (ratio: number, digits?: number) => string;
  number: (n: number) => string;
  dateTime: (iso: string) => string;
  bytes: (n: number) => string;
}

const MINUS = '−';

export function createFormatters(locale: string, currency: string, dateFormat: string): Formatters {
  const exp = currencyExponent(currency);
  const cache = new Map<string, Intl.NumberFormat>();
  const nf = (key: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat => {
    let f = cache.get(key);
    if (!f) {
      f = new Intl.NumberFormat(locale, opts);
      cache.set(key, f);
    }
    return f;
  };
  const toDate = (civil: string): Date | null => {
    const ymd = parseCivilDate(civil);
    return ymd ? new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 12)) : null;
  };
  const dateShort = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const dateLong = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const monthLong = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const monthShort = new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });
  return {
    locale,
    currency,
    money: (minor, options = {}) => {
      const cur = options.currency ?? currency;
      const signDisplay =
        options.sign === 'never' ? 'never' : options.sign === 'auto' ? 'auto' : 'exceptZero';
      const key = `m|${cur}|${signDisplay}|${options.compact ? 'c' : ''}`;
      const f = nf(key, {
        style: 'currency',
        currency: cur,
        signDisplay,
        ...(options.compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
      });
      return f.format(minorToNumber(minor, cur)).replace('-', MINUS);
    },
    amountInput: (minor) =>
      nf(`i|${exp}`, {
        minimumFractionDigits: 0,
        maximumFractionDigits: exp,
        useGrouping: false,
      }).format(minorToNumber(Math.abs(minor), currency)),
    date: (civil) => {
      if (dateFormat === 'yyyy-MM-dd') return civil;
      const d = toDate(civil);
      if (!d) return civil;
      if (dateFormat === 'dd/MM/yyyy') {
        const [y, m, day] = civil.split('-');
        return `${day}/${m}/${y}`;
      }
      return dateShort.format(d);
    },
    dateLong: (civil) => {
      const d = toDate(civil);
      return d ? dateLong.format(d) : civil;
    },
    weekdayDate: (civil) => {
      const d = toDate(civil);
      if (!d) return civil;
      const text = weekday.format(d);
      return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
    },
    period: (period, style = 'long') => {
      const { y, m } = parsePeriod(period);
      const d = new Date(Date.UTC(y, m - 1, 15));
      const text = (style === 'long' ? monthLong : monthShort).format(d);
      return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
    },
    percent: (ratio, digits = 0) =>
      nf(`p|${digits}`, {
        style: 'percent',
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(ratio),
    number: (n) => nf('n', {}).format(n),
    dateTime: (iso) => dateTime.format(new Date(iso)),
    bytes: (n) => {
      const units = ['B', 'kB', 'MB', 'GB'];
      let v = n;
      let i = 0;
      while (v >= 1000 && i < units.length - 1) {
        v /= 1000;
        i += 1;
      }
      return `${nf('b', { maximumFractionDigits: 1 }).format(v)} ${units[i]}`;
    },
  };
}

export function useFormat(): Formatters {
  const intl = useIntl();
  const { currency, dateFormat } = useFormatOptions();
  return useMemo(
    () => createFormatters(intl.locale, currency, dateFormat),
    [intl.locale, currency, dateFormat],
  );
}
