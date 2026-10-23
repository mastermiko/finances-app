/**
 * Minimal, values-only XLSX/XLSM reader.
 * Reads the workbook structure, shared strings and cell values (cached results of
 * formulas) plus the formula text. It never evaluates formulas, never resolves
 * external links and never touches VBA: only values are read.
 */
import { XMLParser } from 'fast-xml-parser';
import { readZipTextEntries, ZipError } from './zip';

export type CellValue =
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'error'; readonly value: string }
  | { readonly type: 'empty' };

export interface Cell {
  readonly ref: string;
  readonly value: CellValue;
  /** Formula text without the leading "=", if any. */
  readonly formula: string | null;
}

export interface Sheet {
  readonly name: string;
  readonly cells: ReadonlyMap<string, Cell>;
  readonly maxRow: number;
}

export interface Workbook {
  readonly sheets: readonly Sheet[];
  readonly date1904: boolean;
  readonly hasMacros: boolean;
}

export class XlsxError extends Error {
  constructor(readonly code: 'notXlsx' | 'tooLarge' | 'corrupt' | 'unsafe') {
    super(code);
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: true,
  removeNSPrefix: true,
  isArray: (name) => ['row', 'c', 'si', 'r', 'sheet', 'Relationship'].includes(name),
});

type XmlNode = Record<string, unknown>;

function parseXml(text: string): XmlNode {
  // OOXML never contains DTDs; refusing them rules out entity-expansion attacks.
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new XlsxError('unsafe');
  return parser.parse(text) as XmlNode;
}

function asArray(value: unknown): XmlNode[] {
  if (Array.isArray(value)) return value as XmlNode[];
  if (value && typeof value === 'object') return [value as XmlNode];
  return [];
}

function textOf(node: unknown): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean')
    return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object') {
    const n = node as XmlNode;
    if ('#text' in n) return textOf(n['#text']);
  }
  return '';
}

/** Text of a shared string item or inline string: <t> or rich text runs <r><t>. */
function stringItemText(si: XmlNode): string {
  if (si.t !== undefined) return textOf(si.t);
  return asArray(si.r)
    .map((run) => textOf(run.t))
    .join('');
}

function attr(node: XmlNode, name: string): string | undefined {
  const v = node[`@_${name}`];
  if (typeof v === 'string') return v;
  return typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined;
}

export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function rowIndex(ref: string): number {
  return Number(/\d+$/.exec(ref)?.[0] ?? '0');
}

function resolveTarget(target: string): string {
  const clean = target.replace(/^\/?/, '');
  return clean.startsWith('xl/') ? clean : `xl/${clean}`;
}

export function readWorkbook(bytes: Uint8Array): Workbook {
  let entries: Map<string, string>;
  try {
    entries = readZipTextEntries(
      bytes,
      (name) =>
        name === 'xl/workbook.xml' ||
        name === 'xl/_rels/workbook.xml.rels' ||
        name === 'xl/sharedStrings.xml' ||
        /^xl\/worksheets\/[^/]+\.xml$/.test(name) ||
        name === '[Content_Types].xml',
    );
  } catch (error) {
    if (error instanceof ZipError)
      throw new XlsxError(error.code === 'tooLarge' ? 'tooLarge' : 'notXlsx');
    throw error;
  }
  const workbookXml = entries.get('xl/workbook.xml');
  if (!workbookXml) throw new XlsxError('notXlsx');
  const contentTypes = entries.get('[Content_Types].xml') ?? '';
  const hasMacros = /vbaProject|macroEnabled/i.test(contentTypes);

  try {
    const wb = parseXml(workbookXml).workbook as XmlNode | undefined;
    if (!wb) throw new XlsxError('notXlsx');
    const workbookPr = (wb.workbookPr ?? {}) as XmlNode;
    const date1904 =
      attr(workbookPr, 'date1904') === '1' || attr(workbookPr, 'date1904') === 'true';

    const rels = new Map<string, string>();
    const relsXml = entries.get('xl/_rels/workbook.xml.rels');
    if (relsXml) {
      const root = parseXml(relsXml).Relationships as XmlNode | undefined;
      for (const rel of asArray(root?.Relationship)) {
        const id = attr(rel, 'Id');
        const target = attr(rel, 'Target');
        if (id && target) rels.set(id, resolveTarget(target));
      }
    }

    const shared: string[] = [];
    const sharedXml = entries.get('xl/sharedStrings.xml');
    if (sharedXml) {
      const sst = parseXml(sharedXml).sst as XmlNode | undefined;
      for (const si of asArray(sst?.si)) shared.push(stringItemText(si));
    }

    const sheets: Sheet[] = [];
    const sheetNodes = asArray((wb.sheets as XmlNode | undefined)?.sheet);
    sheetNodes.forEach((node, index) => {
      const name = attr(node, 'name') ?? `Sheet${index + 1}`;
      const rid = attr(node, 'id');
      const path = (rid && rels.get(rid)) ?? `xl/worksheets/sheet${index + 1}.xml`;
      const xml = entries.get(path);
      if (!xml) return;
      sheets.push(readSheet(name, xml, shared));
    });
    return { sheets, date1904, hasMacros };
  } catch (error) {
    if (error instanceof XlsxError) throw error;
    throw new XlsxError('corrupt');
  }
}

function readSheet(name: string, xml: string, shared: readonly string[]): Sheet {
  const ws = parseXml(xml).worksheet as XmlNode | undefined;
  const cells = new Map<string, Cell>();
  let maxRow = 0;
  const rows = asArray((ws?.sheetData as XmlNode | undefined)?.row);
  for (const row of rows) {
    for (const c of asArray(row.c)) {
      const ref = attr(c, 'r');
      if (!ref) continue;
      const type = attr(c, 't') ?? 'n';
      const formulaRaw = c.f !== undefined ? textOf(c.f) : null;
      const formula = formulaRaw === null || formulaRaw === '' ? null : formulaRaw;
      const raw = c.v !== undefined ? textOf(c.v) : undefined;
      let value: CellValue = { type: 'empty' };
      if (type === 's' && raw !== undefined) {
        value = { type: 'string', value: shared[Number(raw)] ?? '' };
      } else if (type === 'inlineStr') {
        value = { type: 'string', value: c.is ? stringItemText(c.is as XmlNode) : '' };
      } else if (type === 'str' && raw !== undefined) {
        value = { type: 'string', value: raw };
      } else if (type === 'b' && raw !== undefined) {
        value = { type: 'boolean', value: raw === '1' };
      } else if (type === 'e' && raw !== undefined) {
        value = { type: 'error', value: raw };
      } else if (raw !== undefined && raw.trim() !== '') {
        const n = Number(raw);
        value = Number.isFinite(n) ? { type: 'number', value: n } : { type: 'string', value: raw };
      }
      if (value.type === 'empty' && formula === null) continue;
      cells.set(ref, { ref, value, formula });
      maxRow = Math.max(maxRow, rowIndex(ref));
    }
  }
  return { name, cells, maxRow };
}

export function cellAt(sheet: Sheet, ref: string): Cell | undefined {
  return sheet.cells.get(ref);
}
