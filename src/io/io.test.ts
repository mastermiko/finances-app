import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { account, category, exportData, operation, tag } from '@/test/factories';
import { canonicalJson, sha256Hex, toHex } from './checksum';
import { escapeFormula, needsFormulaEscape } from './sanitize';
import {
  applyMapping,
  guessDateFormat,
  headerSignature,
  isOwnCsvFormat,
  operationsToCsv,
  parseBankAmount,
  parseCsvTable,
  parseDateWithFormat,
  parseOwnCsv,
  suggestMapping,
  tableToCsv,
} from './csv/csv';
import { parseOfx, parseQif } from './bank/ofx-qif';
import {
  DecryptionError,
  decryptText,
  encryptText,
  isEncryptedFile,
  passwordStrength,
} from './crypto/encryption';
import {
  checksumOf,
  envelopeToText,
  exportFileName,
  mergeExportData,
  parseExportJson,
  serializeExport,
} from './json/export-json';
import { columnLetter, excelSerial, writeXlsx } from './xlsx/xlsx-writer';
import { readWorkbook, XlsxError } from './xlsx/xlsx-reader';
import {
  interpretFinancesWorkbook,
  parseSheetAmount,
  parseSheetDate,
} from './xlsx/finances-workbook';
import { isZip, listZipEntries, readZipTextEntries, ZipError } from './xlsx/zip';
import { categoriesSheet, monthlySummarySheet, operationsSheet } from './tabular';
import { ioApi } from './workers/io-api';

const meta = { fileName: 'f', fileHash: '0'.repeat(64), currency: 'EUR' };

describe('checksum and sanitisation', () => {
  it('canonical JSON sorts keys recursively and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[{"y":2,"z":1}]},"b":1}',
    );
  });

  it('hashes with SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(toHex(new Uint8Array([0, 255]))).toBe('00ff');
  });

  it('escapes values a spreadsheet would read as a formula', () => {
    expect(['=1+1', '+33 6', '-12', '@SUM', '\tx', 'Café'].map(escapeFormula)).toEqual([
      "'=1+1",
      "'+33 6",
      "'-12",
      "'@SUM",
      "'\tx",
      'Café',
    ]);
    expect(needsFormulaEscape('ok')).toBe(false);
  });
});

describe('CSV', () => {
  const acc = account({ name: 'Compte courant' });
  const parent = category({ name: 'Alimentation' });
  const cat = category({ name: 'Café', parentId: parent.id });
  const t = tag({ name: 'voyage' });
  const ops = [
    operation({
      accountId: acc.id,
      categoryId: cat.id,
      amountMinor: -1250,
      label: '=cmd|calc',
      tagIds: [t.id],
      note: 'a;b "c"',
      amountExpression: '-(10+2,5)',
    }),
    operation({
      accountId: acc.id,
      kind: 'transfer',
      amountMinor: -5000,
      label: 'Izly',
      transferGroupId: 'g1',
      date: null,
    }),
  ];
  const ctx = { categories: [parent, cat], accounts: [acc], tags: [t], currency: 'EUR' };

  it('exports RFC 4180 with BOM, semicolons and French decimals', () => {
    const csv = operationsToCsv(ops, ctx);
    expect(csv.startsWith('﻿Date;Période;Montant')).toBe(true);
    expect(csv).toContain(
      ';-12,50;EUR;Dépense;Café;Alimentation;\'=cmd|calc;Compte courant;voyage;"a;b ""c""";Validée;\'-(10+2,5)',
    );
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(tableToCsv(['A', '=B'], [['=x', 1.5]])).toBe("﻿A;'=B\r\n'=x;1,5\r\n");
  });

  it('re-imports its own format (round trip) with transfers re-linked', () => {
    const table = parseCsvTable(operationsToCsv(ops, ctx));
    expect(isOwnCsvFormat(table.headers)).toBe(true);
    const parsed = parseOwnCsv(table, meta);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      amountMinor: -1250,
      label: '=cmd|calc',
      categoryName: 'Café',
      parentCategoryName: 'Alimentation',
      tagNames: ['voyage'],
      note: 'a;b "c"',
      amountExpression: '-(10+2,5)',
      kind: 'expense',
    });
    expect(parsed.rows[1]).toMatchObject({
      kind: 'transfer',
      date: null,
      period: '2026-10',
      externalId: 'g1',
    });
  });

  it('rejects broken rows of its own format', () => {
    const table = parseCsvTable(
      'Date;Période;Montant;Devise;Type;Catégorie;Libellé;Identifiant\n2026-10-01;2026-10;0;EUR;Dépense;X;Y;1\nxx;2026-10;1;EUR;Dépense;X;Y;2\n2026-10-01;2026-10;1;EUR;Autre;X;Y;3\n;;;;;;;\n',
    );
    const parsed = parseOwnCsv(table, meta);
    expect(parsed.rejected.map((r) => r.reason)).toEqual([
      'zeroAmount',
      'invalidDate',
      'unparsableRow',
    ]);
  });

  it('parses bank amounts and dates in many formats', () => {
    expect(parseBankAmount('1 234,56', ',')).toBe(123456);
    expect(parseBankAmount('-1.234,56 €', ',')).toBe(-123456);
    expect(parseBankAmount('(12.50)', '.')).toBe(-1250);
    expect(parseBankAmount('12,50-', ',')).toBe(-1250);
    expect(parseBankAmount('1,234.56', '.')).toBe(123456);
    expect(parseBankAmount('abc', ',')).toBeNull();
    expect(parseBankAmount('', ',')).toBeNull();
    expect(parseDateWithFormat('23/10/2026', 'dd/MM/yyyy')).toBe('2026-10-23');
    expect(parseDateWithFormat('10/23/26', 'MM/dd/yyyy')).toBe('2026-10-23');
    expect(parseDateWithFormat('20261023', 'yyyyMMdd')).toBe('2026-10-23');
    expect(parseDateWithFormat('2026-10-23', 'yyyy-MM-dd')).toBe('2026-10-23');
    expect(parseDateWithFormat('31/02/2026', 'dd/MM/yyyy')).toBeNull();
    expect(parseDateWithFormat(' ', 'dd/MM/yyyy')).toBeNull();
    expect(guessDateFormat(['2026-10-01'])).toBe('yyyy-MM-dd');
    expect(guessDateFormat(['20261001'])).toBe('yyyyMMdd');
    expect(guessDateFormat(['01.10.2026'])).toBe('dd.MM.yyyy');
    expect(guessDateFormat(['01-10-2026'])).toBe('dd-MM-yyyy');
    expect(guessDateFormat(['10/23/2026'])).toBe('MM/dd/yyyy');
    expect(guessDateFormat(['23/10/2026'])).toBe('dd/MM/yyyy');
  });

  it('maps bank statement columns (single and debit/credit)', () => {
    const table = parseCsvTable(
      'Date opération;Libellé;Débit;Crédit\n01/10/2026;CB CAFE;2,50;\n02/10/2026;VIR SALAIRE;;1240,00\n03/10/2026;;;\n04/10/2026;FRAIS;0,00;\nxx;A;1;\n',
    );
    const mapping = suggestMapping(table);
    expect(mapping).toMatchObject({
      dateColumn: 0,
      amountMode: 'debitCredit',
      debitColumn: 2,
      creditColumn: 3,
      decimal: ',',
      labelColumns: [1],
    });
    const parsed = applyMapping(table, mapping, meta);
    expect(parsed.rows.map((r) => [r.date, r.amountMinor, r.kind, r.label])).toEqual([
      ['2026-10-01', -250, 'expense', 'CB CAFE'],
      ['2026-10-02', 124000, 'income', 'VIR SALAIRE'],
    ]);
    expect(parsed.rejected.map((r) => r.reason)).toEqual([
      'invalidAmount',
      'zeroAmount',
      'invalidDate',
    ]);
    const single = parseCsvTable(
      'date,amount,description,category\n2026-10-01,-12.5,Coffee,Food\n',
    );
    const m2 = suggestMapping(single);
    const p2 = applyMapping(single, { ...m2, invertSign: true }, meta);
    expect(p2.rows[0]).toMatchObject({ amountMinor: 1250, categoryName: 'Food', label: 'Coffee' });
    expect(headerSignature(['Date', 'Libellé'])).toBe('date|libelle');
    expect(parseCsvTable('a;b\n1;2', false).headers).toEqual(['Colonne 1', 'Colonne 2']);
  });
});

describe('OFX and QIF', () => {
  it('reads OFX 1.x (SGML) and 2.x (XML) transactions', () => {
    const sgml = `OFXHEADER:100\n<OFX><BANKTRANLIST>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261001120000\n<TRNAMT>-2.50\n<FITID>A1\n<NAME>CAFE &amp; CO\n<MEMO>CB 01/10\n</STMTTRN>\n<STMTTRN><DTPOSTED>20261002<TRNAMT>1240,00<FITID>A2<NAME>SALAIRE</STMTTRN>\n<STMTTRN><DTPOSTED>bad<TRNAMT>1</STMTTRN><STMTTRN><DTPOSTED>20261003<TRNAMT>0</STMTTRN></BANKTRANLIST></OFX>`;
    const parsed = parseOfx(sgml, meta);
    expect(parsed.rows.map((r) => [r.date, r.amountMinor, r.label, r.note, r.externalId])).toEqual([
      ['2026-10-01', -250, 'CAFE & CO', 'CB 01/10', 'A1'],
      ['2026-10-02', 124000, 'SALAIRE', '', 'A2'],
    ]);
    expect(parsed.rejected.map((r) => r.reason)).toEqual(['invalidDate', 'zeroAmount']);
  });

  it('reads QIF with French dates', () => {
    const qif =
      '!Type:Bank\nD23/10/2026\nT-12,50\nPBoulangerie\nMPain\nLAlimentation:Pain\n^\nD31/02/2026\nT1\n^\nD24/10/2026\nT0\n^\nD25/10/2026\nU100.00\nPVirement\n';
    const parsed = parseQif(qif, meta);
    expect(
      parsed.rows.map((r) => [r.date, r.amountMinor, r.label, r.categoryName, r.note]),
    ).toEqual([
      ['2026-10-23', -1250, 'Boulangerie', 'Alimentation', 'Pain'],
      ['2026-10-25', 10000, 'Virement', null, ''],
    ]);
    expect(parsed.rejected.map((r) => r.reason)).toEqual(['invalidDate', 'zeroAmount']);
    expect(parseQif('D10/23/2026\nT1\n^', meta).rows[0]?.date).toBe('2026-10-23');
  });
});

describe('encrypted backup', () => {
  it('encrypts with AES-GCM and refuses a wrong password', async () => {
    const text = await encryptText('{"secret":1}', 'correct horse', 100_000);
    expect(isEncryptedFile(text)).toBe(true);
    expect(text).not.toContain('secret');
    expect(JSON.parse(text)).toMatchObject({
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 100_000 },
      cipher: { name: 'AES-GCM' },
    });
    expect(await decryptText(text, 'correct horse')).toBe('{"secret":1}');
    await expect(decryptText(text, 'wrong')).rejects.toEqual(new DecryptionError('wrongPassword'));
    await expect(decryptText('nope', 'x')).rejects.toEqual(new DecryptionError('notEncrypted'));
    await expect(decryptText('{"format":"other"}', 'x')).rejects.toEqual(
      new DecryptionError('notEncrypted'),
    );
    const weak = JSON.stringify({
      ...JSON.parse(text),
      kdf: { ...JSON.parse(text).kdf, iterations: 10 },
    });
    await expect(decryptText(weak, 'x')).rejects.toEqual(new DecryptionError('unsupported'));
  });

  it('uses 600 000 PBKDF2 iterations by default', async () => {
    const text = await encryptText('x', 'p');
    expect(JSON.parse(text).kdf.iterations).toBe(600_000);
  });

  it('rates passwords', () => {
    expect(passwordStrength('a')).toBe(0);
    expect(passwordStrength('Abcdefgh12!x')).toBe(4);
  });
});

describe('JSON export', () => {
  it('serialises deterministically and re-imports identical data', async () => {
    const data = exportData();
    const first = await serializeExport(data, '1.0.0', '2026-10-23T10:00:00.000Z');
    expect(
      first.text.startsWith('{"format":"finances-app","schemaVersion":1,"appVersion":"1.0.0"'),
    ).toBe(true);
    const parsed = await parseExportJson(first.text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.checksumValid).toBe(true);
    expect(parsed.migrated).toBe(false);
    const second = await serializeExport(parsed.data, '1.0.0', '2026-10-24T10:00:00.000Z');
    const body = (t: string): string => t.slice(t.indexOf('"data"'));
    expect(body(second.text)).toBe(body(first.text));
    expect(second.envelope.checksum).toBe(first.envelope.checksum);
    expect(envelopeToText(first.envelope)).toBe(first.text);
    // Checksum built from the shared per-entity strings = checksum of the canonical JSON.
    expect(first.envelope.checksum).toBe(await checksumOf(first.envelope.data));
  });

  it('detects tampering, refuses newer versions and invalid content', async () => {
    const { text } = await serializeExport(exportData(), '1.0.0', '2026-10-23T10:00:00.000Z');
    const tampered = text.replace('"label":"Café"', '"label":"Thé"');
    const result = await parseExportJson(tampered);
    expect(result.ok && result.checksumValid).toBe(false);
    expect(await parseExportJson('{')).toEqual({ ok: false, issue: { code: 'notJson' } });
    expect(await parseExportJson('{"a":1}')).toEqual({ ok: false, issue: { code: 'notExport' } });
    const newer = JSON.stringify({ ...JSON.parse(text), schemaVersion: 99 });
    expect(await parseExportJson(newer)).toEqual({
      ok: false,
      issue: { code: 'tooNew', fileVersion: 99, appVersion: 1 },
    });
    const invalid = JSON.stringify({
      ...JSON.parse(text),
      data: { ...JSON.parse(text).data, operations: [{ id: 'x' }] },
    });
    const r = await parseExportJson(invalid);
    expect(!r.ok && r.issue.code).toBe('invalidData');
  });

  it('merges by id, most recent update wins', () => {
    const local = exportData();
    const op = local.operations[0];
    if (!op) throw new Error('fixture');
    const incoming = {
      ...local,
      operations: [
        { ...op, label: 'Nouveau', updatedAt: '2030-01-01T00:00:00.000Z' },
        operation({ accountId: op.accountId }),
      ],
      settings: { ...local.settings, updatedAt: '2000-01-01T00:00:00.000Z', currency: 'USD' },
    };
    const { data, conflicts } = mergeExportData(local, incoming);
    expect(conflicts).toBe(1);
    expect(data.operations).toHaveLength(2);
    expect(data.operations.find((o) => o.id === op.id)?.label).toBe('Nouveau');
    expect(data.settings.currency).toBe('EUR');
  });

  it('names files finances_AAAA-MM-JJ_HHmm.json', () => {
    expect(exportFileName(new Date(2026, 9, 3, 9, 5))).toBe('finances_2026-10-03_0905.json');
  });
});

describe('XLSX writer and reader', () => {
  it('writes a workbook the reader reads back, text never as formula', () => {
    const bytes = writeXlsx(
      [
        {
          name: 'Opérations/Test',
          columns: [
            { header: 'Date' },
            { header: 'Montant' },
            { header: 'Libellé' },
            { header: 'Taux' },
            { header: 'N' },
          ],
          rows: [
            [
              { t: 'date', v: '2026-10-23' },
              { t: 'money', v: -12.5 },
              { t: 'text', v: '=1+1 & <b>' },
              { t: 'percent', v: 0.25 },
              { t: 'number', v: 3 },
            ],
            [null, { t: 'money', v: Number.NaN }, { t: 'text', v: 'Café' }, null, null],
          ],
        },
        { name: 'Opérations/Test', columns: [{ header: 'A' }], rows: [] },
      ],
      { currencySymbol: '€' },
    );
    const wb = readWorkbook(bytes);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Opérations Test', 'Opérations Test (2)']);
    const sheet = wb.sheets[0];
    expect(sheet?.cells.get('A2')?.value).toEqual({ type: 'number', value: 46318 });
    expect(sheet?.cells.get('B2')?.value).toEqual({ type: 'number', value: -12.5 });
    expect(sheet?.cells.get('C2')).toMatchObject({
      value: { type: 'string', value: '=1+1 & <b>' },
      formula: null,
    });
    expect(sheet?.cells.has('B3')).toBe(false);
    expect(wb.hasMacros).toBe(false);
    expect(excelSerial('1900-03-01')).toBe(61);
    expect(excelSerial('bad')).toBeNull();
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(27)).toBe('AB');
  });

  it('reads shared strings, rich text, inline strings, booleans, errors and formulas without values', () => {
    const files = {
      '[Content_Types].xml': strToU8(
        '<Types><Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>',
      ),
      'xl/workbook.xml': strToU8(
        '<workbook xmlns:r="r"><workbookPr date1904="1"/><sheets><sheet name="Janvier2026" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>',
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
      ),
      'xl/sharedStrings.xml': strToU8(
        '<sst><si><t>Date</t></si><si><r><t>Mon</t></r><r><t xml:space="preserve">tant </t></r></si><si><t>Aucune</t></si><si><t>Revenu</t></si></sst>',
      ),
      'xl/worksheets/sheet1.xml': strToU8(
        '<worksheet><sheetData>' +
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Type de dépense</t></is></c><c r="D1" t="inlineStr"><is><t>Libellé</t></is></c><c r="G2"><v>100</v></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><f>-(10+5.3)</f></c><c r="C2" t="inlineStr"><is><t>Loisirs</t></is></c><c r="D2" t="str"><f>A1</f><v>Ciné</v></c><c r="F2"><v>80</v></c></row>' +
          '<row r="3"><c r="A3"><v>1</v></c><c r="B3" t="s"><v>3</v></c><c r="C3" t="b"><v>1</v></c><c r="D3" t="e"><v>#REF!</v></c></row>' +
          '<row r="4"><c r="A4"><v>2</v></c><c r="B4"><f>Feuil2!A1</f></c></row>' +
          '</sheetData></worksheet>',
      ),
      'xl/worksheets/sheet2.xml': strToU8('<worksheet><sheetData/></worksheet>'),
      'xl/vbaProject.bin': new Uint8Array([1, 2, 3]),
    };
    const bytes = zipSync(files);
    expect(listZipEntries(bytes)).toContain('xl/vbaProject.bin');
    const wb = readWorkbook(bytes);
    expect(wb.date1904).toBe(true);
    expect(wb.hasMacros).toBe(true);
    const parsed = interpretFinancesWorkbook(wb, meta);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      date: null,
      amountMinor: -1530,
      amountExpression: '-(10+5.3)',
      categoryName: 'Loisirs',
      label: 'Ciné',
      period: '2026-01',
    });
    expect(parsed.rejected.map((r) => [r.source.row, r.reason])).toEqual([
      [3, 'invalidAmount'],
      [4, 'formulaNotEvaluable'],
    ]);
    expect(parsed.warnings.map((w) => w.code)).toEqual([
      'sheetIgnored',
      'formulaEvaluated',
      'controlMismatch',
    ]);
    expect(parsed.controls?.[0]).toMatchObject({
      computedClosingMinor: 8470,
      closingCellMinor: 8000,
      differenceMinor: 470,
    });
    expect(parsed.openingBalanceMinor).toBe(10000);
  });

  it('parses spreadsheet dates and amounts defensively', () => {
    const cell = (value: unknown, formula: string | null = null) => ({
      ref: 'A1',
      value: value as never,
      formula,
    });
    expect(parseSheetDate(cell({ type: 'string', value: '30/10/2025' }), false)).toEqual({
      kind: 'date',
      date: '2025-10-30',
    });
    expect(parseSheetDate(cell({ type: 'string', value: '2025-10-30' }), false)).toEqual({
      kind: 'date',
      date: '2025-10-30',
    });
    expect(parseSheetDate(cell({ type: 'string', value: '31/02/25' }), false)).toEqual({
      kind: 'invalid',
    });
    expect(parseSheetDate(cell({ type: 'string', value: 'sans date' }), false)).toEqual({
      kind: 'undated',
    });
    expect(parseSheetDate(cell({ type: 'string', value: '  ' }), false)).toEqual({
      kind: 'missing',
    });
    expect(parseSheetDate(cell({ type: 'boolean', value: true }), false)).toEqual({
      kind: 'invalid',
    });
    expect(parseSheetDate(undefined, false)).toEqual({ kind: 'missing' });
    expect(parseSheetDate(cell({ type: 'number', value: 0 }), false)).toEqual({ kind: 'invalid' });
    expect(parseSheetAmount(cell({ type: 'string', value: '12,5' }))).toEqual({
      ok: true,
      minor: 1250,
      expression: null,
      evaluated: false,
    });
    expect(parseSheetAmount(cell({ type: 'string', value: 'abc' }))).toEqual({
      ok: false,
      reason: 'invalidAmount',
    });
    expect(parseSheetAmount(cell({ type: 'string', value: ' ' }))).toEqual({
      ok: false,
      reason: 'noAmount',
    });
    expect(parseSheetAmount(cell({ type: 'number', value: 0 }))).toEqual({
      ok: false,
      reason: 'zeroAmount',
    });
  });

  it('refuses non-zip, DTDs and corrupt archives', () => {
    expect(isZip(new Uint8Array([1, 2, 3, 4, 5]))).toBe(false);
    expect(() => readWorkbook(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(XlsxError);
    expect(() => readZipTextEntries(new Uint8Array([1, 2]), () => true)).toThrow(ZipError);
    const dtd = zipSync({
      'xl/workbook.xml': strToU8('<!DOCTYPE x [<!ENTITY a "b">]><workbook/>'),
    });
    expect(() => readWorkbook(dtd)).toThrow(/unsafe/);
    const noWorkbook = zipSync({ 'a.txt': strToU8('x') });
    expect(() => readWorkbook(noWorkbook)).toThrow(/notXlsx/);
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0]);
    expect(() => listZipEntries(corrupt)).toThrow(ZipError);
  });
});

describe('tabular projections and worker API', () => {
  const acc = account();
  const food = category({ name: 'Alimentation' });
  const sub = category({ name: 'Café', parentId: food.id });
  const income = category({ name: 'Revenu', kind: 'income' });
  const ops = [
    operation({
      accountId: acc.id,
      categoryId: sub.id,
      amountMinor: -250,
      period: '2026-09',
      date: '2026-09-01',
    }),
    operation({
      accountId: acc.id,
      categoryId: income.id,
      kind: 'income',
      amountMinor: 10000,
      period: '2026-11',
      date: '2026-11-01',
    }),
  ];
  const ctx = { categories: [food, sub, income], accounts: [acc], tags: [], currency: 'EUR' };

  it('builds the monthly summary with gaps filled and roll-up', () => {
    const summary = monthlySummarySheet(ops, ctx);
    expect(summary.rows).toHaveLength(3);
    expect(summary.rows[0]?.[6]).toEqual({ t: 'money', v: 2.5 });
    expect(summary.rows[2]?.[5]).toEqual({ t: 'percent', v: 1 });
    expect(categoriesSheet(ops, ctx).rows[1]?.[1]).toEqual({ t: 'text', v: 'Alimentation' });
    expect(operationsSheet(ops, ctx).rows).toHaveLength(2);
  });

  it('exposes every function through the worker API', async () => {
    const bytes = await ioApi.buildXlsx(ops, ctx, '€');
    expect(isZip(bytes)).toBe(true);
    expect(await ioApi.hash(new Uint8Array([1]))).toHaveLength(64);
    expect(await ioApi.buildCsv(ops, ctx)).toContain('Café');
    const table = await ioApi.parseCsvTable('Date;Montant;Libellé\n01/10/2026;-1,00;A\n', true);
    const m = suggestMapping(table);
    expect((await ioApi.applyCsvMapping(table, m, meta)).rows).toHaveLength(1);
    expect((await ioApi.parseOwnCsv(table, meta)).rows).toHaveLength(0);
    expect((await ioApi.parseOfx('', meta)).rows).toEqual([]);
    expect((await ioApi.parseQif('', meta)).rows).toEqual([]);
    const { text, checksum } = await ioApi.serializeExport(
      exportData(),
      '1.0.0',
      '2026-10-23T10:00:00.000Z',
    );
    expect(checksum).toMatch(/^sha256-/);
    expect((await ioApi.parseJson(text)).ok).toBe(true);
    const enc = await ioApi.encrypt('x', 'password');
    expect(await ioApi.decrypt(enc, 'password')).toBe('x');
  });
});
