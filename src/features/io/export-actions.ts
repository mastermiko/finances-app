/**
 * Export use cases: complete JSON backup, encrypted backup, CSV / XLSX of a
 * selection. Serialisation runs in the I/O worker.
 */
import type { Operation } from '@/domain/model';
import { markBackupDone, now, nowIso, readSnapshot } from '@/data';
import { exportFileName } from '@/io/json/export-json';
import { getIo } from '@/io/workers/client';
import type { Translate } from '@/i18n';
import { toast } from '@/ui';
import { reportError } from '../shared/actions';
import { downloadBlob } from '../shared/download';
import type { AppData } from '../shared/app-data';

export const APP_VERSION = __APP_VERSION__;

export async function exportJson(t: Translate): Promise<boolean> {
  try {
    const io = await getIo();
    const snapshot = await readSnapshot();
    const { text } = await io.serializeExport(snapshot, APP_VERSION, nowIso());
    downloadBlob(text, exportFileName(now(), 'json'), 'application/json');
    await markBackupDone();
    toast(t('export.done', { count: snapshot.operations.length }), { tone: 'success' });
    return true;
  } catch (error) {
    reportError(error, t);
    return false;
  }
}

export async function exportEncrypted(password: string, t: Translate): Promise<boolean> {
  try {
    const io = await getIo();
    const snapshot = await readSnapshot();
    const { text } = await io.serializeExport(snapshot, APP_VERSION, nowIso());
    const encrypted = await io.encrypt(text, password);
    downloadBlob(encrypted, exportFileName(now(), 'finances.enc'), 'application/octet-stream');
    await markBackupDone();
    toast(t('export.encryptedDone'), { tone: 'success' });
    return true;
  } catch (error) {
    reportError(error, t);
    return false;
  }
}

function currencySymbol(locale: string, currency: string): string {
  return (
    new Intl.NumberFormat(locale, { style: 'currency', currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency
  );
}

export async function exportOperations(
  format: 'csv' | 'xlsx',
  ops: readonly Operation[],
  data: AppData,
  t: Translate,
): Promise<void> {
  try {
    if (ops.length === 0) {
      toast(t('export.nothing'), { tone: 'info' });
      return;
    }
    const io = await getIo();
    const ctx = {
      categories: [...data.categories],
      accounts: [...data.accounts],
      tags: [...data.tags],
      currency: data.settings.currency,
    };
    const sorted = [...ops].sort((a, b) =>
      a.period + (a.date ?? '') < b.period + (b.date ?? '') ? -1 : 1,
    );
    if (format === 'csv') {
      const csv = await io.buildCsv(sorted, ctx);
      downloadBlob(csv, exportFileName(now(), 'csv'), 'text/csv;charset=utf-8');
    } else {
      const bytes = await io.buildXlsx(
        sorted,
        ctx,
        currencySymbol(data.settings.locale, data.settings.currency),
      );
      downloadBlob(
        bytes as Uint8Array<ArrayBuffer>,
        exportFileName(now(), 'xlsx'),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    }
    toast(t('export.tableDone', { count: ops.length }), { tone: 'success' });
  } catch (error) {
    reportError(error, t);
  }
}
