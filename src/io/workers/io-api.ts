/**
 * Heavy import/export work. Runs inside a Web Worker in the browser (see
 * client.ts) and directly in unit tests. Pure functions only: no DOM, no IndexedDB.
 */
import type { ExportData, Operation } from '@/domain/model';
import { sha256Hex } from '../checksum';
import {
  applyMapping,
  operationsToCsv,
  parseCsvTable,
  parseOwnCsv,
  type ColumnMapping,
  type CsvTable,
  type DateFormat,
} from '../csv/csv';
import { parseOfx, parseQif } from '../bank/ofx-qif';
import { decryptText, encryptText } from '../crypto/encryption';
import { parseExportJson, serializeExport } from '../json/export-json';
import { parseFinancesWorkbook } from '../xlsx/finances-workbook';
import { writeXlsx } from '../xlsx/xlsx-writer';
import {
  categoriesSheet,
  monthlySummarySheet,
  operationsSheet,
  type TabularContext,
} from '../tabular';

export const ioApi = {
  hash: (bytes: Uint8Array): Promise<string> => sha256Hex(bytes),
  parseWorkbook: (bytes: Uint8Array, fileName: string, fileHash: string) =>
    Promise.resolve(parseFinancesWorkbook(bytes, { fileName, fileHash })),
  parseJson: (text: string) => parseExportJson(text),
  decrypt: (text: string, password: string) => decryptText(text, password),
  encrypt: (text: string, password: string) => encryptText(text, password),
  parseCsvTable: (text: string, hasHeader: boolean) =>
    Promise.resolve(parseCsvTable(text, hasHeader)),
  applyCsvMapping: (
    table: CsvTable,
    mapping: ColumnMapping,
    meta: { fileName: string; fileHash: string; currency: string },
  ) => Promise.resolve(applyMapping(table, mapping, meta)),
  parseOwnCsv: (table: CsvTable, meta: { fileName: string; fileHash: string }) =>
    Promise.resolve(parseOwnCsv(table, meta)),
  parseOfx: (text: string, meta: { fileName: string; fileHash: string; currency: string }) =>
    Promise.resolve(parseOfx(text, meta)),
  parseQif: (
    text: string,
    meta: { fileName: string; fileHash: string; currency: string; dateFormat?: DateFormat },
  ) => Promise.resolve(parseQif(text, meta)),
  serializeExport: async (data: ExportData, appVersion: string, exportedAt: string) => {
    const { text, envelope } = await serializeExport(data, appVersion, exportedAt);
    return { text, checksum: envelope.checksum };
  },
  buildCsv: (ops: Operation[], ctx: TabularContext) => Promise.resolve(operationsToCsv(ops, ctx)),
  buildXlsx: (ops: Operation[], ctx: TabularContext, currencySymbol: string) =>
    Promise.resolve(
      writeXlsx(
        [operationsSheet(ops, ctx), monthlySummarySheet(ops, ctx), categoriesSheet(ops, ctx)],
        {
          currencySymbol,
        },
      ),
    ),
};

export type IoApi = typeof ioApi;
