/**
 * Minimal XLSX writer (fflate): inline strings, numbers, dates, a header style,
 * a currency number format, frozen header row and auto-filter.
 * Text is always written as a string cell (never a formula); values that a
 * spreadsheet could take for a formula get the quotePrefix style as well.
 */
import { strToU8, zipSync } from 'fflate';
import { daysFromCivil, parseCivilDate } from '@/domain/common/civil-date';
import { needsFormulaEscape } from '../sanitize';

export type XlsxCell =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'number'; readonly v: number }
  | { readonly t: 'money'; readonly v: number } // already in major units
  | { readonly t: 'percent'; readonly v: number } // 0.25 = 25 %
  | { readonly t: 'date'; readonly v: string } // YYYY-MM-DD
  | null;

export interface XlsxSheet {
  readonly name: string;
  readonly columns: readonly { readonly header: string; readonly width?: number }[];
  readonly rows: readonly (readonly XlsxCell[])[];
}

export interface XlsxOptions {
  /** Currency symbol used in the money number format. */
  readonly currencySymbol: string;
  readonly creator?: string;
}

const xmlEscape = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Excel serial (1900 system) of a civil date. */
export function excelSerial(date: string): number | null {
  const ymd = parseCivilDate(date);
  if (!ymd) return null;
  const days = daysFromCivil(ymd) - daysFromCivil({ y: 1899, m: 12, d: 31 });
  return days >= 60 ? days + 1 : days;
}

// Style indexes in cellXfs
const S_DEFAULT = 0;
const S_HEADER = 1;
const S_MONEY = 2;
const S_DATE = 3;
const S_PERCENT = 4;
const S_TEXT_QUOTED = 5;

function sanitizeSheetName(name: string, used: Set<string>): string {
  let base =
    name
      .replace(/[\\/?*[\]:]/g, ' ')
      .slice(0, 31)
      .trim() || 'Feuille';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`;
    base = base.slice(0, 31 - suffix.length);
    candidate = `${base}${suffix}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function cellXml(ref: string, cell: XlsxCell): string {
  if (cell === null) return '';
  switch (cell.t) {
    case 'text': {
      const style = needsFormulaEscape(cell.v) ? ` s="${S_TEXT_QUOTED}"` : '';
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(cell.v)}</t></is></c>`;
    }
    case 'number':
      return Number.isFinite(cell.v) ? `<c r="${ref}"><v>${cell.v}</v></c>` : '';
    case 'money':
      return Number.isFinite(cell.v) ? `<c r="${ref}" s="${S_MONEY}"><v>${cell.v}</v></c>` : '';
    case 'percent':
      return Number.isFinite(cell.v) ? `<c r="${ref}" s="${S_PERCENT}"><v>${cell.v}</v></c>` : '';
    case 'date': {
      const serial = excelSerial(cell.v);
      return serial === null ? '' : `<c r="${ref}" s="${S_DATE}"><v>${serial}</v></c>`;
    }
    default:
      return '';
  }
}

function sheetXml(sheet: XlsxSheet): string {
  const lastCol = columnLetter(Math.max(0, sheet.columns.length - 1));
  const lastRow = sheet.rows.length + 1;
  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`)
    .join('');
  const header = `<row r="1">${sheet.columns
    .map(
      (c, i) =>
        `<c r="${columnLetter(i)}1" t="inlineStr" s="${S_HEADER}"><is><t>${xmlEscape(c.header)}</t></is></c>`,
    )
    .join('')}</row>`;
  const body = sheet.rows
    .map(
      (row, r) =>
        `<row r="${r + 2}">${row.map((cell, c) => cellXml(`${columnLetter(c)}${r + 2}`, cell)).join('')}</row>`,
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols><sheetData>${header}${body}</sheetData>` +
    (sheet.rows.length > 0 ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : '') +
    '</worksheet>'
  );
}

function stylesXml(currencySymbol: string): string {
  const symbol = xmlEscape(currencySymbol.replace(/"/g, ''));
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;${symbol}&quot;;\\-#,##0.00\\ &quot;${symbol}&quot;"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>` +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" quotePrefix="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

export function writeXlsx(sheets: readonly XlsxSheet[], options: XlsxOptions): Uint8Array {
  const used = new Set<string>();
  const names = sheets.map((s) => sanitizeSheetName(s.name, used));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '</Relationships>',
    ),
    'docProps/core.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        `<dc:creator>${xmlEscape(options.creator ?? 'Finances')}</dc:creator>` +
        '</cp:coreProperties>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        '</workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(stylesXml(options.currencySymbol)),
  };
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files, { level: 6, mtime: new Date('2000-01-01T00:00:00Z') });
}

export { S_DEFAULT };
