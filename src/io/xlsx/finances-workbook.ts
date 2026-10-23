/**
 * Import of the legacy "Finances.xlsm" workbook (one sheet per month).
 * Rules: see specification §6 "Règles d'import du classeur actuel".
 */
import {
  addPeriods,
  civilDateFromExcelSerial,
  formatPeriod,
  formatYmd,
  parseCivilDate,
  periodDiff,
  periodOfDate,
  periodRange,
  type CivilDate,
  type Period,
} from '@/domain/common/civil-date';
import { cleanLabel, labelKey, stripDiacritics } from '@/domain/common/text';
import { evaluateAmountExpression } from '@/domain/money/expression';
import { minorFromNumber } from '@/domain/money/money';
import type {
  ImportWarning,
  IncomingRow,
  ParsedImport,
  RejectedRow,
  SheetControl,
  TrackerHint,
} from '../import-types';
import { readWorkbook, rowIndex, type Cell, type Sheet, type Workbook } from './xlsx-reader';

const MONTHS: Readonly<Record<string, number>> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

/** "Novembre2025", "Février 2026", "decembre_2025" → period. */
export function periodFromSheetName(name: string): Period | null {
  const match = /^\s*([\p{L}]+)[\s_-]*(\d{4})\s*$/u.exec(name);
  if (!match) return null;
  const month = MONTHS[stripDiacritics(match[1] ?? '').toLowerCase()];
  const year = Number(match[2]);
  if (!month || year < 1900 || year > 2999) return null;
  return formatPeriod(year, month);
}

const EXPECTED_HEADERS = ['date', 'montant', 'type de depense', 'libelle'];

function cellText(cell: Cell | undefined): string {
  if (!cell) return '';
  switch (cell.value.type) {
    case 'string':
      return cell.value.value;
    case 'number':
      return String(cell.value.value);
    case 'boolean':
      return cell.value.value ? 'TRUE' : 'FALSE';
    case 'error':
      return cell.value.value;
    default:
      return cell.formula ? `=${cell.formula}` : '';
  }
}

function isBlank(cell: Cell | undefined): boolean {
  return !cell || (cell.value.type === 'empty' && cell.formula === null);
}

function numberOf(cell: Cell | undefined): number | null {
  return cell && cell.value.type === 'number' ? cell.value.value : null;
}

type DateResult =
  | { kind: 'date'; date: CivilDate }
  | { kind: 'undated' }
  | { kind: 'missing' }
  | { kind: 'invalid' };

export function parseSheetDate(cell: Cell | undefined, date1904: boolean): DateResult {
  if (isBlank(cell)) return { kind: 'missing' };
  const value = cell?.value;
  if (value?.type === 'number') {
    const date = civilDateFromExcelSerial(value.value, date1904);
    return date ? { kind: 'date', date } : { kind: 'invalid' };
  }
  if (value?.type === 'string') {
    const text = value.value.trim();
    if (text === '') return { kind: 'missing' };
    if (labelKey(text) === 'aucune' || labelKey(text) === 'sans date') return { kind: 'undated' };
    const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
    if (fr) {
      const y = Number(fr[3]);
      const ymd = { y: y < 100 ? 2000 + y : y, m: Number(fr[2]), d: Number(fr[1]) };
      const iso = formatYmd(ymd);
      return parseCivilDate(iso) ? { kind: 'date', date: iso } : { kind: 'invalid' };
    }
    if (parseCivilDate(text)) return { kind: 'date', date: text };
  }
  return { kind: 'invalid' };
}

type AmountResult =
  | { ok: true; minor: number; expression: string | null; evaluated: boolean }
  | { ok: false; reason: 'noAmount' | 'invalidAmount' | 'zeroAmount' | 'formulaNotEvaluable' };

export function parseSheetAmount(cell: Cell | undefined): AmountResult {
  if (isBlank(cell) || !cell) return { ok: false, reason: 'noAmount' };
  const expression = cell.formula;
  let minor: number;
  let evaluated = false;
  if (cell.value.type === 'number') {
    minor = minorFromNumber(cell.value.value);
  } else if (cell.value.type === 'string' && cell.value.value.trim() !== '') {
    const r = evaluateAmountExpression(cell.value.value);
    if (!r.ok) return { ok: false, reason: 'invalidAmount' };
    minor = r.minor;
  } else if (cell.value.type === 'empty' && expression) {
    // No cached result (file not saved by Excel): evaluate pure arithmetic only.
    const r = evaluateAmountExpression(expression);
    if (!r.ok) return { ok: false, reason: 'formulaNotEvaluable' };
    minor = r.minor;
    evaluated = true;
  } else if (cell.value.type === 'string') {
    return { ok: false, reason: 'noAmount' };
  } else {
    return { ok: false, reason: 'invalidAmount' };
  }
  if (minor === 0) return { ok: false, reason: 'zeroAmount' };
  return { ok: true, minor, expression, evaluated };
}

const TRACKER_RE = /^\s*(?:prix|total|co[uû]t|suivi)\s+(.+?)\s*:?\s*$/iu;

export interface WorkbookParseOptions {
  readonly fileName: string;
  readonly fileHash: string;
}

export function parseFinancesWorkbook(
  bytes: Uint8Array,
  options: WorkbookParseOptions,
): ParsedImport {
  const workbook = readWorkbook(bytes);
  return interpretFinancesWorkbook(workbook, options);
}

export function interpretFinancesWorkbook(
  workbook: Workbook,
  options: WorkbookParseOptions,
): ParsedImport {
  const rows: IncomingRow[] = [];
  const rejected: RejectedRow[] = [];
  const warnings: ImportWarning[] = [];
  const trackers: TrackerHint[] = [];

  const monthly: { sheet: Sheet; period: Period }[] = [];
  for (const sheet of workbook.sheets) {
    const period = periodFromSheetName(sheet.name);
    if (period) monthly.push({ sheet, period });
    else warnings.push({ code: 'sheetIgnored', params: { sheet: sheet.name } });
  }
  monthly.sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));

  const sumsByPeriod = new Map<Period, number>();
  const countsBySheet = new Map<string, number>();

  for (const { sheet, period } of monthly) {
    // Header check (tolerates "Type de Dépense" / "Type de Depense", "Libellé" / "Libelle"…)
    const header = ['A1', 'B1', 'C1', 'D1'].map((ref) => labelKey(cellText(sheet.cells.get(ref))));
    const headerOk = header.every((h, i) =>
      h.startsWith((EXPECTED_HEADERS[i] ?? '').split(' ')[0] ?? ''),
    );
    const exact = header.every((h, i) => h === EXPECTED_HEADERS[i]);
    if (headerOk && !exact) {
      warnings.push({
        code: 'headerVariant',
        source: { sheet: sheet.name, row: 1 },
        params: { header: header.join(' | ') },
      });
    }
    const firstRow = headerOk ? 2 : 1;
    let previousMonthCount = 0;
    let count = 0;

    for (let r = firstRow; r <= sheet.maxRow; r += 1) {
      const a = sheet.cells.get(`A${r}`);
      const b = sheet.cells.get(`B${r}`);
      const c = sheet.cells.get(`C${r}`);
      const d = sheet.cells.get(`D${r}`);
      if (isBlank(a) && isBlank(b) && isBlank(c) && isBlank(d)) continue;
      const raw = [cellText(a), cellText(b), cellText(c), cellText(d)];
      const source = { sheet: sheet.name, row: r };

      const amount = parseSheetAmount(b);
      if (!amount.ok) {
        rejected.push({ source, reason: amount.reason, raw });
        continue;
      }
      if (amount.evaluated) warnings.push({ code: 'formulaEvaluated', source });

      const dateResult = parseSheetDate(a, workbook.date1904);
      let date: CivilDate | null = null;
      if (dateResult.kind === 'date') {
        date = dateResult.date;
        const diff = periodDiff(periodOfDate(date, 1), period);
        if (diff === -1) previousMonthCount += 1;
        else if (diff !== 0) {
          warnings.push({
            code: 'dateFarFromPeriod',
            source,
            params: { date, period, months: diff },
          });
        }
      } else if (dateResult.kind === 'missing' || dateResult.kind === 'invalid') {
        warnings.push({ code: 'missingDate', source, params: { value: raw[0] ?? '' } });
      }

      const typeText = cellText(c).trim();
      const isIncomeType = labelKey(typeText) === 'revenu' || labelKey(typeText) === 'revenus';
      let kind: 'expense' | 'income';
      let categoryName: string | null;
      if (typeText === '') {
        kind = amount.minor > 0 ? 'income' : 'expense';
        categoryName = null;
        warnings.push({ code: 'missingCategory', source });
      } else if (isIncomeType) {
        kind = 'income';
        categoryName = typeText;
      } else {
        kind = 'expense';
        categoryName = typeText;
      }

      rows.push({
        source,
        date,
        period,
        amountMinor: amount.minor,
        amountExpression: amount.expression,
        categoryName,
        kind,
        label: cleanLabel(cellText(d)),
        note: '',
      });
      count += 1;
      sumsByPeriod.set(period, (sumsByPeriod.get(period) ?? 0) + amount.minor);
    }
    countsBySheet.set(sheet.name, count);
    if (previousMonthCount > 0) {
      warnings.push({
        code: 'previousMonthDates',
        params: { sheet: sheet.name, count: previousMonthCount },
      });
    }

    // Tracker cells beyond column D ("prix café:")
    for (const cell of sheet.cells.values()) {
      if (cell.value.type !== 'string' || /^[A-D]\d+$/.test(cell.ref)) continue;
      const m = TRACKER_RE.exec(cell.value.value);
      const term = m?.[1]?.trim();
      if (term && !trackers.some((t) => labelKey(t.term) === labelKey(term))) {
        trackers.push({ term, cell: cell.ref, sheet: sheet.name });
      }
    }
  }

  // Opening balance and controls (G2 = "Budget initial", F2 = "Budget restant")
  const first = monthly[0];
  const g2First = first ? numberOf(first.sheet.cells.get('G2')) : null;
  const openingBalanceMinor = g2First === null ? null : minorFromNumber(g2First);
  const controls: SheetControl[] = [];
  let running = openingBalanceMinor ?? 0;
  let previous: { sheet: Sheet; period: Period; f2: number | null } | null = null;
  const missingPeriods: Period[] = [];

  for (const { sheet, period } of monthly) {
    const g2Cell = sheet.cells.get('G2');
    const g2 = numberOf(g2Cell);
    const f2 = numberOf(sheet.cells.get('F2'));
    const g2Minor = g2 === null ? null : minorFromNumber(g2);
    const f2Minor = f2 === null ? null : minorFromNumber(f2);
    if (previous) {
      const gap = periodDiff(period, previous.period);
      if (gap > 1) {
        const missing = periodRange(addPeriods(previous.period, 1), addPeriods(period, -1));
        missingPeriods.push(...missing);
      }
      if (g2Minor !== null && previous.f2 !== null && g2Minor !== previous.f2) {
        warnings.push({
          code: 'carryBreak',
          source: { sheet: sheet.name, row: 2 },
          params: {
            sheet: sheet.name,
            previousSheet: previous.sheet.name,
            g2: g2Minor,
            previousF2: previous.f2,
          },
        });
      } else if (gap > 1 && g2Cell && g2Cell.formula === null) {
        warnings.push({
          code: 'carryTyped',
          source: { sheet: sheet.name, row: 2 },
          params: {
            sheet: sheet.name,
            previousSheet: previous.sheet.name,
            g2: g2Minor ?? 0,
            missing: gap - 1,
          },
        });
      }
    }
    const opening = running;
    const closing = running + (sumsByPeriod.get(period) ?? 0);
    controls.push({
      sheet: sheet.name,
      period,
      rowCount: countsBySheet.get(sheet.name) ?? 0,
      openingCellMinor: g2Minor,
      openingFormula: g2Cell?.formula ?? null,
      closingCellMinor: f2Minor,
      computedOpeningMinor: opening,
      computedClosingMinor: closing,
      differenceMinor: f2Minor === null ? null : closing - f2Minor,
    });
    if (f2Minor !== null && closing !== f2Minor) {
      warnings.push({
        code: 'controlMismatch',
        source: { sheet: sheet.name, row: 2 },
        params: {
          sheet: sheet.name,
          computed: closing,
          cell: f2Minor,
          difference: closing - f2Minor,
        },
      });
    }
    running = closing;
    previous = { sheet, period, f2: f2Minor };
  }
  if (missingPeriods.length > 0) {
    warnings.push({
      code: 'missingPeriods',
      params: { periods: missingPeriods.join(', '), count: missingPeriods.length },
    });
  }

  return {
    source: workbook.hasMacros ? 'xlsm' : 'xlsx',
    fileName: options.fileName,
    fileHash: options.fileHash,
    rows,
    rejected,
    warnings,
    controls,
    openingBalanceMinor,
    missingPeriods,
    trackers,
  };
}

export { rowIndex };
