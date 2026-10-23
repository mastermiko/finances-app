/**
 * Format-independent result of parsing an import file (worker side). Rows still
 * reference categories by name; they are resolved against the database on the
 * main thread (see features/import).
 */
import type { CivilDate, Period } from '@/domain/common/civil-date';
import type { ImportSource } from '@/domain/model';

export interface RowSource {
  readonly sheet?: string;
  /** 1-based row (spreadsheet) or line (text file) number. */
  readonly row: number;
}

export interface IncomingRow {
  readonly source: RowSource;
  readonly date: CivilDate | null;
  /** Explicit period (sheet name, undated charge); derived from date when null. */
  readonly period: Period | null;
  readonly amountMinor: number;
  readonly amountExpression: string | null;
  /** Category name as written in the file; null → rules, history or fallback. */
  readonly categoryName: string | null;
  /** Parent category name (own CSV format). */
  readonly parentCategoryName?: string | null;
  readonly kind: 'expense' | 'income' | 'transfer';
  readonly label: string;
  readonly note: string;
  readonly accountName?: string | null;
  readonly tagNames?: readonly string[];
  readonly status?: 'cleared' | 'planned';
  /** Bank identifier (OFX FITID) used for duplicate detection. */
  readonly externalId?: string | null;
}

export type RejectReason =
  | 'noAmount'
  | 'invalidAmount'
  | 'zeroAmount'
  | 'invalidDate'
  | 'unparsableRow'
  | 'formulaNotEvaluable';

export interface RejectedRow {
  readonly source: RowSource;
  readonly reason: RejectReason;
  readonly raw: readonly string[];
}

export type WarningCode =
  | 'headerVariant'
  | 'dateFarFromPeriod'
  | 'missingCategory'
  | 'missingDate'
  | 'formulaEvaluated'
  | 'missingPeriods'
  | 'carryBreak'
  | 'carryTyped'
  | 'controlMismatch'
  | 'sheetIgnored'
  | 'checksumMismatch'
  | 'previousMonthDates';

export interface ImportWarning {
  readonly code: WarningCode;
  readonly source?: RowSource;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** Spreadsheet control: recomputed closing balance vs the F2 cell, per sheet. */
export interface SheetControl {
  readonly sheet: string;
  readonly period: Period;
  readonly rowCount: number;
  readonly openingCellMinor: number | null; // G2
  readonly openingFormula: string | null;
  readonly closingCellMinor: number | null; // F2
  readonly computedOpeningMinor: number;
  readonly computedClosingMinor: number;
  readonly differenceMinor: number | null; // computed − F2
}

export interface TrackerHint {
  /** e.g. "café" from a "prix café:" cell */
  readonly term: string;
  readonly cell: string;
  readonly sheet: string;
}

export interface ParsedImport {
  readonly source: ImportSource;
  readonly fileName: string;
  readonly fileHash: string;
  readonly rows: readonly IncomingRow[];
  readonly rejected: readonly RejectedRow[];
  readonly warnings: readonly ImportWarning[];
  /** Spreadsheet only */
  readonly controls?: readonly SheetControl[];
  readonly openingBalanceMinor?: number | null;
  readonly missingPeriods?: readonly Period[];
  readonly trackers?: readonly TrackerHint[];
  /** Header row of tabular files, for the column-mapping assistant. */
  readonly headers?: readonly string[];
}
