/**
 * Downloadable import report (Markdown): what was imported, skipped, rejected,
 * the spreadsheet controls (recomputed balance vs F2) and every warning.
 */
import type { ImportWarning, ParsedImport, RejectedRow } from '@/io/import-types';
import type { Formatters } from '@/i18n/format';
import type { MessageId, Translate } from '@/i18n';
import type { ResolvedImport } from './resolve';

const esc = (text: string): string => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function sourceText(source: RejectedRow['source'] | undefined, t: Translate): string {
  if (!source) return '';
  return source.sheet
    ? t('report.sourceSheet', { sheet: source.sheet, row: source.row })
    : t('report.sourceLine', { row: source.row });
}

export function warningText(w: ImportWarning, t: Translate, fmt: Formatters): string {
  const p = w.params ?? {};
  const money = (key: string): string => fmt.money(Number(p[key] ?? 0));
  switch (w.code) {
    case 'carryBreak':
      return t('warning.carryBreak', {
        sheet: String(p.sheet),
        previousSheet: String(p.previousSheet),
        g2: money('g2'),
        previousF2: money('previousF2'),
      });
    case 'carryTyped':
      return t('warning.carryTyped', {
        sheet: String(p.sheet),
        previousSheet: String(p.previousSheet),
        g2: money('g2'),
        missing: Number(p.missing),
      });
    case 'controlMismatch':
      return t('warning.controlMismatch', {
        sheet: String(p.sheet),
        computed: money('computed'),
        cell: money('cell'),
        difference: money('difference'),
      });
    case 'missingPeriods':
      return t('warning.missingPeriods', {
        count: Number(p.count),
        periods: String(p.periods ?? '')
          .split(', ')
          .map((x) => fmt.period(x))
          .join(', '),
      });
    case 'dateFarFromPeriod':
      return t('warning.dateFarFromPeriod', {
        date: fmt.date(String(p.date)),
        period: fmt.period(String(p.period)),
      });
    case 'previousMonthDates':
      return t('warning.previousMonthDates', { sheet: String(p.sheet), count: Number(p.count) });
    case 'sheetIgnored':
      return t('warning.sheetIgnored', { sheet: String(p.sheet) });
    case 'headerVariant':
      return t('warning.headerVariant');
    case 'missingCategory':
      return t('warning.missingCategory');
    case 'missingDate':
      return t('warning.missingDate', { value: String(p.value ?? '') });
    case 'formulaEvaluated':
      return t('warning.formulaEvaluated');
    case 'checksumMismatch':
      return t('warning.checksumMismatch');
    default:
      return w.code;
  }
}

export const REJECT_MESSAGES: Record<RejectedRow['reason'], MessageId> = {
  noAmount: 'reject.noAmount',
  invalidAmount: 'reject.invalidAmount',
  zeroAmount: 'reject.zeroAmount',
  invalidDate: 'reject.invalidDate',
  unparsableRow: 'reject.unparsableRow',
  formulaNotEvaluable: 'reject.formulaNotEvaluable',
};

export function buildImportReport(
  parsed: ParsedImport,
  resolved: ResolvedImport,
  outcome: {
    imported: number;
    skippedDuplicates: number;
    mode: 'merge' | 'replace';
    importedAt: string;
  },
  t: Translate,
  fmt: Formatters,
): string {
  const lines: string[] = [];
  lines.push(`# ${t('report.title')}`, '');
  lines.push(`- ${t('report.file')} : ${parsed.fileName}`);
  lines.push(`- ${t('report.fileHash')} : \`${parsed.fileHash}\``);
  lines.push(`- ${t('report.date')} : ${fmt.dateTime(outcome.importedAt)}`);
  lines.push(
    `- ${t('report.mode')} : ${t(outcome.mode === 'merge' ? 'import.mode.merge' : 'import.mode.replace')}`,
  );
  lines.push(`- ${t('report.imported')} : ${outcome.imported}`);
  lines.push(`- ${t('report.duplicatesSkipped')} : ${outcome.skippedDuplicates}`);
  lines.push(`- ${t('report.rejected')} : ${parsed.rejected.length}`);
  if (resolved.periodFrom && resolved.periodTo) {
    lines.push(
      `- ${t('report.periods')} : ${fmt.period(resolved.periodFrom)} → ${fmt.period(resolved.periodTo)}`,
    );
  }
  lines.push(`- ${t('report.income')} : ${fmt.money(resolved.incomeMinor)}`);
  lines.push(`- ${t('report.expense')} : ${fmt.money(-resolved.expenseMinor)}`);
  if (parsed.openingBalanceMinor !== undefined && parsed.openingBalanceMinor !== null) {
    lines.push(`- ${t('report.opening')} : ${fmt.money(parsed.openingBalanceMinor)}`);
  }
  lines.push('');

  if (parsed.controls && parsed.controls.length > 0) {
    lines.push(`## ${t('report.controls')}`, '');
    lines.push(
      `| ${t('report.col.sheet')} | ${t('report.col.rows')} | ${t('report.col.opening')} | ${t('report.col.computed')} | ${t('report.col.f2')} | ${t('report.col.difference')} |`,
    );
    lines.push('|---|---:|---:|---:|---:|---:|');
    for (const c of parsed.controls) {
      lines.push(
        `| ${esc(c.sheet)} | ${c.rowCount} | ${fmt.money(c.computedOpeningMinor)} | ${fmt.money(c.computedClosingMinor)} | ${
          c.closingCellMinor === null ? '—' : fmt.money(c.closingCellMinor)
        } | ${c.differenceMinor === null ? '—' : c.differenceMinor === 0 ? '0' : fmt.money(c.differenceMinor)} |`,
      );
    }
    lines.push('');
  }

  if (resolved.newCategories.length > 0) {
    lines.push(`## ${t('report.categoriesCreated')}`, '');
    for (const c of resolved.newCategories) lines.push(`- ${esc(c.name)}`);
    lines.push('');
  }

  lines.push(`## ${t('report.categories')}`, '');
  for (const c of resolved.categoryCounts) lines.push(`- ${esc(c.name)} : ${c.count}`);
  lines.push('');

  if (parsed.warnings.length > 0) {
    lines.push(`## ${t('report.warnings')}`, '');
    for (const w of parsed.warnings) {
      const where = sourceText(w.source, t);
      lines.push(`- ${where ? `${where} — ` : ''}${warningText(w, t, fmt)}`);
    }
    lines.push('');
  }

  if (parsed.rejected.length > 0) {
    lines.push(`## ${t('report.rejectedLines')}`, '');
    lines.push(
      `| ${t('report.col.where')} | ${t('report.col.reason')} | ${t('report.col.content')} |`,
    );
    lines.push('|---|---|---|');
    for (const r of parsed.rejected) {
      lines.push(
        `| ${esc(sourceText(r.source, t))} | ${esc(t(REJECT_MESSAGES[r.reason]))} | ${esc(r.raw.map((x) => JSON.stringify(x)).join(', '))} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
