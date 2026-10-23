/**
 * Bank statement readers: OFX/QFX (1.x SGML and 2.x XML) and QIF.
 */
import { cleanLabel } from '@/domain/common/text';
import type { IncomingRow, ParsedImport, RejectedRow } from '../import-types';
import { parseBankAmount, parseDateWithFormat, type DateFormat } from '../csv/csv';

function tagValue(block: string, tag: string): string {
  // SGML (no closing tag) and XML forms: <NAME>value[</NAME>]
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
  return (re.exec(block)?.[1] ?? '').trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

export function parseOfx(
  text: string,
  meta: { fileName: string; fileHash: string; currency: string },
): ParsedImport {
  const rows: IncomingRow[] = [];
  const rejected: RejectedRow[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  blocks.forEach((rawBlock, index) => {
    const block = rawBlock.split(/<\/STMTTRN>/i)[0] ?? rawBlock;
    const source = { row: index + 1 };
    const dateRaw = tagValue(block, 'DTPOSTED');
    const date = parseDateWithFormat(dateRaw.slice(0, 8), 'yyyyMMdd');
    const amountRaw = tagValue(block, 'TRNAMT');
    const decimal = /,\d+$/.test(amountRaw) ? ',' : '.';
    const amount = parseBankAmount(amountRaw, decimal, meta.currency);
    const name = decodeEntities(tagValue(block, 'NAME'));
    const memo = decodeEntities(tagValue(block, 'MEMO'));
    const raw = [dateRaw, amountRaw, name, memo];
    if (!date) {
      rejected.push({ source, reason: 'invalidDate', raw });
      return;
    }
    if (amount === null || amount === 0) {
      rejected.push({ source, reason: amount === 0 ? 'zeroAmount' : 'invalidAmount', raw });
      return;
    }
    const label = cleanLabel(name || memo).slice(0, 120);
    rows.push({
      source,
      date,
      period: null,
      amountMinor: amount,
      amountExpression: null,
      categoryName: null,
      kind: amount > 0 ? 'income' : 'expense',
      label,
      note: name && memo && memo !== name ? memo.slice(0, 1000) : '',
      externalId: tagValue(block, 'FITID') || null,
    });
  });
  return {
    source: 'ofx',
    fileName: meta.fileName,
    fileHash: meta.fileHash,
    rows,
    rejected,
    warnings: [],
  };
}

export function parseQif(
  text: string,
  meta: { fileName: string; fileHash: string; currency: string; dateFormat?: DateFormat },
): ParsedImport {
  const rows: IncomingRow[] = [];
  const rejected: RejectedRow[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let current: Record<string, string> = {};
  let startLine = 1;
  const dates: string[] = [];
  const records: { fields: Record<string, string>; line: number }[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith('!')) return;
    if (line.trim() === '^') {
      if (Object.keys(current).length > 0) records.push({ fields: current, line: startLine });
      current = {};
      startLine = i + 2;
      return;
    }
    const code = line.charAt(0);
    const value = line.slice(1).trim();
    if (code === '') return;
    if (code === 'D') dates.push(value.replace(/'/g, '/'));
    current[code] = current[code] ? `${current[code]} ${value}` : value;
  });
  if (Object.keys(current).length > 0) records.push({ fields: current, line: startLine });
  const format: DateFormat =
    meta.dateFormat ??
    (dates.some((d) => Number(d.split(/[/.-]/)[1]) > 12) ? 'MM/dd/yyyy' : 'dd/MM/yyyy');
  for (const { fields, line } of records) {
    const source = { row: line };
    const raw = [fields.D ?? '', fields.T ?? fields.U ?? '', fields.P ?? '', fields.M ?? ''];
    const date = parseDateWithFormat((fields.D ?? '').replace(/'/g, '/'), format);
    const amountText = fields.T ?? fields.U ?? '';
    const amount = parseBankAmount(
      amountText,
      /,\d{1,2}$/.test(amountText) ? ',' : '.',
      meta.currency,
    );
    if (!date) {
      rejected.push({ source, reason: 'invalidDate', raw });
      continue;
    }
    if (amount === null || amount === 0) {
      rejected.push({ source, reason: amount === 0 ? 'zeroAmount' : 'invalidAmount', raw });
      continue;
    }
    const category =
      (fields.L ?? '')
        .replace(/^\[.*\]$/, '')
        .split(':')[0]
        ?.trim() ?? '';
    rows.push({
      source,
      date,
      period: null,
      amountMinor: amount,
      amountExpression: null,
      categoryName: category === '' ? null : category,
      kind: amount > 0 ? 'income' : 'expense',
      label: cleanLabel(fields.P ?? fields.M ?? '').slice(0, 120),
      note: fields.P && fields.M ? fields.M.slice(0, 1000) : '',
      externalId: fields.N ?? null,
    });
  }
  return {
    source: 'qif',
    fileName: meta.fileName,
    fileHash: meta.fileHash,
    rows,
    rejected,
    warnings: [],
  };
}
