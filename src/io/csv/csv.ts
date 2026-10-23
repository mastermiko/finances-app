/**
 * CSV (RFC 4180, UTF-8 with BOM, ";" separator, CRLF), export and import.
 * Import supports the application's own format (automatic mapping) and bank
 * statements through a column mapping (memorised per bank by the UI).
 */
import Papa from 'papaparse';
import { formatYmd, parseCivilDate, type CivilDate } from '@/domain/common/civil-date';
import { cleanLabel, labelKey } from '@/domain/common/text';
import { evaluateAmountExpression } from '@/domain/money/expression';
import { currencyExponent } from '@/domain/money/money';
import type { Operation } from '@/domain/model';
import { CSV_COLUMNS, frenchDecimal, operationRecords, type TabularContext } from '../tabular';
import { escapeFormula } from '../sanitize';
import type { ImportWarning, IncomingRow, ParsedImport, RejectedRow } from '../import-types';

export const CSV_BOM = '﻿';

export function operationsToCsv(ops: readonly Operation[], ctx: TabularContext): string {
  const rows = operationRecords(ops, ctx).map((r) => [
    r.date,
    r.period,
    frenchDecimal(r.amountMinor, r.currency),
    r.currency,
    r.kind,
    escapeFormula(r.category),
    escapeFormula(r.parentCategory),
    escapeFormula(r.label),
    escapeFormula(r.account),
    escapeFormula(r.tags),
    escapeFormula(r.note),
    r.status,
    escapeFormula(r.expression),
    r.id,
    r.transferGroup,
    r.createdAt,
    r.updatedAt,
  ]);
  return (
    CSV_BOM +
    Papa.unparse(
      { fields: [...CSV_COLUMNS], data: rows },
      { delimiter: ';', newline: '\r\n', quotes: false, escapeFormulae: false },
    ) +
    '\r\n'
  );
}

/** Generic CSV of a data table (chart data exports). */
export function tableToCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string {
  const data = rows.map((r) =>
    r.map((v) => (typeof v === 'number' ? String(v).replace('.', ',') : escapeFormula(v))),
  );
  return (
    CSV_BOM +
    Papa.unparse(
      { fields: headers.map(escapeFormula), data },
      { delimiter: ';', newline: '\r\n' },
    ) +
    '\r\n'
  );
}

// ---------------------------------------------------------------------------
// Import

export interface CsvTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly delimiter: string;
}

export function parseCsvTable(text: string, hasHeader = true): CsvTable {
  const clean = text.replace(/^﻿/, '');
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy', delimiter: '' });
  const all = result.data.filter((r) => Array.isArray(r));
  const headers = hasHeader
    ? (all[0] ?? []).map((h) => h.trim())
    : (all[0] ?? []).map((_, i) => `Colonne ${i + 1}`);
  return { headers, rows: hasHeader ? all.slice(1) : all, delimiter: result.meta.delimiter };
}

export type DateFormat =
  'yyyy-MM-dd' | 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'dd-MM-yyyy' | 'dd.MM.yyyy' | 'yyyyMMdd';

export function parseDateWithFormat(value: string, format: DateFormat): CivilDate | null {
  const v = value.trim();
  if (v === '') return null;
  let y: number;
  let m: number;
  let d: number;
  const parts = v.split(/[^\d]/).filter(Boolean).map(Number);
  switch (format) {
    case 'yyyy-MM-dd':
      [y = 0, m = 0, d = 0] = parts;
      break;
    case 'yyyyMMdd': {
      const digits = v.replace(/\D/g, '');
      y = Number(digits.slice(0, 4));
      m = Number(digits.slice(4, 6));
      d = Number(digits.slice(6, 8));
      break;
    }
    case 'MM/dd/yyyy':
      [m = 0, d = 0, y = 0] = parts;
      break;
    default:
      [d = 0, m = 0, y = 0] = parts;
  }
  if (y < 100) y += 2000;
  const iso = formatYmd({ y, m, d });
  return parseCivilDate(iso) ? iso : null;
}

/** Guesses the date format from sample values (first unambiguous match wins). */
export function guessDateFormat(samples: readonly string[]): DateFormat {
  const nonEmpty = samples.map((s) => s.trim()).filter(Boolean);
  if (nonEmpty.every((s) => /^\d{4}-\d{2}-\d{2}/.test(s))) return 'yyyy-MM-dd';
  if (nonEmpty.every((s) => /^\d{8}$/.test(s))) return 'yyyyMMdd';
  if (nonEmpty.every((s) => /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(s))) return 'dd.MM.yyyy';
  if (nonEmpty.every((s) => /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(s))) return 'dd-MM-yyyy';
  const slash = nonEmpty.filter((s) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s));
  if (slash.some((s) => Number(s.split('/')[1]) > 12)) return 'MM/dd/yyyy';
  return 'dd/MM/yyyy';
}

/** Parses a bank amount: "1 234,56", "-12.5", "12,50 €", "(12,50)". */
export function parseBankAmount(
  value: string,
  decimal: ',' | '.',
  currency = 'EUR',
): number | null {
  let v = value
    .trim()
    .replace(/[€$£\s  ]/g, '')
    .replace(/[A-Z]{3}$/i, '');
  if (v === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (v.endsWith('-')) {
    negative = !negative;
    v = v.slice(0, -1);
  }
  const thousands = decimal === ',' ? /\./g : /,/g;
  v = v.replace(thousands, '');
  if (decimal === ',') v = v.replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(v)) return null;
  const r = evaluateAmountExpression(v, currencyExponent(currency));
  if (!r.ok) return null;
  return negative ? -r.minor : r.minor;
}

export interface ColumnMapping {
  readonly hasHeader: boolean;
  readonly dateColumn: number;
  readonly dateFormat: DateFormat;
  readonly amountMode: 'single' | 'debitCredit';
  readonly amountColumn: number | null;
  readonly debitColumn: number | null;
  readonly creditColumn: number | null;
  readonly decimal: ',' | '.';
  readonly labelColumns: readonly number[];
  readonly categoryColumn: number | null;
  readonly noteColumn: number | null;
  readonly invertSign: boolean;
}

export function suggestMapping(table: CsvTable): ColumnMapping {
  const keys = table.headers.map((h) => labelKey(h));
  const find = (...candidates: string[]): number | null => {
    const i = keys.findIndex((k) => candidates.some((c) => k === c || k.startsWith(c)));
    return i >= 0 ? i : null;
  };
  const dateColumn = find('date operation', 'date', 'date de valeur', 'booking date') ?? 0;
  const debit = find('debit', 'montant debit');
  const credit = find('credit', 'montant credit');
  const amount = find('montant', 'amount', 'somme', 'valeur');
  const label = find('libelle', 'label', 'description', 'intitule', 'motif', 'payee');
  const samples = table.rows.slice(0, 20).map((r) => r[dateColumn] ?? '');
  const amountSamples = table.rows.slice(0, 20).map((r) => r[amount ?? debit ?? 1] ?? '');
  const commaDecimal = amountSamples.some((s) => /,\d{1,2}\s*$/.test(s));
  return {
    hasHeader: true,
    dateColumn,
    dateFormat: guessDateFormat(samples),
    amountMode: debit !== null && credit !== null && amount === null ? 'debitCredit' : 'single',
    amountColumn: amount,
    debitColumn: debit,
    creditColumn: credit,
    decimal: commaDecimal ? ',' : '.',
    labelColumns: label !== null ? [label] : [Math.min(1, table.headers.length - 1)],
    categoryColumn: find('categorie', 'category'),
    noteColumn: find('note', 'commentaire', 'memo'),
    invertSign: false,
  };
}

/** Signature of a header row, used to remember the mapping of a bank. */
export function headerSignature(headers: readonly string[]): string {
  return headers.map((h) => labelKey(h)).join('|');
}

export function isOwnCsvFormat(headers: readonly string[]): boolean {
  const keys = new Set(headers.map((h) => labelKey(h)));
  return ['date', 'periode', 'montant', 'type', 'categorie', 'libelle', 'identifiant'].every((k) =>
    keys.has(k),
  );
}

export function applyMapping(
  table: CsvTable,
  mapping: ColumnMapping,
  meta: { fileName: string; fileHash: string; currency: string; source?: 'csv' },
): ParsedImport {
  const rows: IncomingRow[] = [];
  const rejected: RejectedRow[] = [];
  const warnings: ImportWarning[] = [];
  table.rows.forEach((cells, index) => {
    const line = index + (mapping.hasHeader ? 2 : 1);
    const source = { row: line };
    const cell = (i: number | null): string => (i === null ? '' : (cells[i] ?? '').trim());
    if (cells.every((c) => c.trim() === '')) return;
    const date = parseDateWithFormat(cell(mapping.dateColumn), mapping.dateFormat);
    if (!date) {
      rejected.push({ source, reason: 'invalidDate', raw: cells });
      return;
    }
    let amount: number | null;
    if (mapping.amountMode === 'single') {
      amount = parseBankAmount(cell(mapping.amountColumn), mapping.decimal, meta.currency);
    } else {
      const debit = parseBankAmount(cell(mapping.debitColumn), mapping.decimal, meta.currency);
      const credit = parseBankAmount(cell(mapping.creditColumn), mapping.decimal, meta.currency);
      amount =
        debit !== null && debit !== 0
          ? -Math.abs(debit)
          : credit !== null
            ? Math.abs(credit)
            : debit === 0
              ? 0
              : null;
    }
    if (amount === null) {
      rejected.push({ source, reason: 'invalidAmount', raw: cells });
      return;
    }
    if (mapping.invertSign) amount = -amount;
    if (amount === 0) {
      rejected.push({ source, reason: 'zeroAmount', raw: cells });
      return;
    }
    const label = cleanLabel(
      mapping.labelColumns
        .map((i) => cell(i))
        .filter(Boolean)
        .join(' '),
    );
    const category = cell(mapping.categoryColumn);
    rows.push({
      source,
      date,
      period: null,
      amountMinor: amount,
      amountExpression: null,
      categoryName: category === '' ? null : category,
      kind: amount > 0 ? 'income' : 'expense',
      label: label.slice(0, 120),
      note: cell(mapping.noteColumn).slice(0, 1000),
    });
  });
  return {
    source: 'csv',
    fileName: meta.fileName,
    fileHash: meta.fileHash,
    rows,
    rejected,
    warnings,
    headers: table.headers,
  };
}

/** Import of the application's own CSV export (round trip, transfers re-linked). */
export function parseOwnCsv(
  table: CsvTable,
  meta: { fileName: string; fileHash: string },
): ParsedImport {
  const keys = table.headers.map((h) => labelKey(h));
  const col = (name: string): number => keys.indexOf(labelKey(name));
  const rows: IncomingRow[] = [];
  const rejected: RejectedRow[] = [];
  const kindOf = (v: string): IncomingRow['kind'] | null => {
    const k = labelKey(v);
    if (k === 'depense' || k === 'expense') return 'expense';
    if (k === 'revenu' || k === 'income') return 'income';
    if (k === 'virement' || k === 'transfer') return 'transfer';
    return null;
  };
  const unescape = (v: string): string => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);
  table.rows.forEach((cells, index) => {
    const source = { row: index + 2 };
    const get = (name: string): string => (cells[col(name)] ?? '').trim();
    if (cells.every((c) => c.trim() === '')) return;
    const amount = parseBankAmount(get('Montant'), ',', get('Devise') || 'EUR');
    const kind = kindOf(get('Type'));
    const dateText = get('Date');
    const date = dateText === '' ? null : parseDateWithFormat(dateText, 'yyyy-MM-dd');
    const period = get('Période');
    if (amount === null || amount === 0) {
      rejected.push({ source, reason: amount === 0 ? 'zeroAmount' : 'invalidAmount', raw: cells });
      return;
    }
    if (!kind || (dateText !== '' && !date) || (!date && !/^\d{4}-\d{2}$/.test(period))) {
      rejected.push({ source, reason: kind ? 'invalidDate' : 'unparsableRow', raw: cells });
      return;
    }
    const tags = unescape(get('Tags'))
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    rows.push({
      source,
      date,
      period: /^\d{4}-\d{2}$/.test(period) ? period : null,
      amountMinor: amount,
      amountExpression: unescape(get('Expression')) || null,
      categoryName: unescape(get('Catégorie')) || null,
      parentCategoryName: unescape(get('Catégorie parente')) || null,
      kind,
      label: cleanLabel(unescape(get('Libellé'))).slice(0, 120),
      note: unescape(get('Note')).slice(0, 1000),
      accountName: unescape(get('Compte')) || null,
      tagNames: tags,
      status:
        labelKey(get('Statut')) === 'prevue' || labelKey(get('Statut')) === 'planned'
          ? 'planned'
          : 'cleared',
      externalId: get('Groupe virement') || null,
    });
  });
  return {
    source: 'csv',
    fileName: meta.fileName,
    fileHash: meta.fileHash,
    rows,
    rejected,
    warnings: [],
    headers: table.headers,
  };
}
