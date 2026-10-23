/**
 * Writes a resolved import in a single transaction (all or nothing), after an
 * automatic backup, and records an ImportBatch so the import can be undone.
 */
import { parseExportJson } from '@/io/json/export-json';
import {
  type Account,
  type Category,
  type ExportData,
  type ImportBatch,
  type ImportSource,
  type Operation,
  type Rule,
  type Tag,
} from '@/domain/model';
import { uuidv7 } from '@/domain/common/uuid';
import { loadSchemas } from './schemas-loader';
import { backupText, createBackup } from './backups';
import { getDb } from './db';
import { nowIso } from './clock';
import { replaceWithSnapshot } from './repositories/snapshot';

export interface ImportCommit {
  readonly source: ImportSource;
  readonly fileName: string;
  readonly fileHash: string;
  readonly mode: 'merge' | 'replace';
  readonly categories: readonly Category[];
  readonly accounts: readonly Account[];
  readonly tags: readonly Tag[];
  readonly rules: readonly Rule[];
  readonly operations: readonly Operation[];
  readonly openingBalance?: { readonly accountId: string; readonly amountMinor: number } | null;
}

export interface ImportOutcome {
  readonly batch: ImportBatch;
  readonly backupId: string;
}

export async function commitImport(
  commit: ImportCommit,
  appVersion: string,
): Promise<ImportOutcome> {
  const {
    accountSchema,
    categorySchema,
    importBatchSchema,
    operationSchema,
    ruleSchema,
    tagSchema,
  } = await loadSchemas();
  const backup = await createBackup('import', appVersion);
  const db = getDb();
  const stamp = nowIso();
  const batch: ImportBatch = importBatchSchema.parse({
    id: uuidv7(),
    source: commit.source,
    fileName: commit.fileName.slice(0, 255),
    fileHash: commit.fileHash,
    importedAt: stamp,
    count: commit.operations.length,
    mode: commit.mode,
    createdCategoryIds: commit.categories.map((c) => c.id),
    backupId: backup.id,
    undoneAt: null,
  });
  const operations = commit.operations.map((op) =>
    operationSchema.parse({ ...op, importBatchId: batch.id }),
  );
  await db.transaction('rw', db.dataTables, async () => {
    if (commit.mode === 'replace') {
      await db.operations.clear();
      await db.importBatches.clear();
    }
    await db.categories.bulkAdd(commit.categories.map((c) => categorySchema.parse(c)));
    await db.accounts.bulkAdd(commit.accounts.map((a) => accountSchema.parse(a)));
    await db.tags.bulkAdd(commit.tags.map((t) => tagSchema.parse(t)));
    await db.rules.bulkAdd(commit.rules.map((r) => ruleSchema.parse(r)));
    await db.operations.bulkAdd(operations);
    if (commit.openingBalance) {
      const account = await db.accounts.get(commit.openingBalance.accountId);
      if (account) {
        await db.accounts.put(
          accountSchema.parse({
            ...account,
            openingBalanceMinor: commit.openingBalance.amountMinor,
            updatedAt: stamp,
          }),
        );
      }
    }
    await db.importBatches.add(batch);
  });
  return { batch, backupId: backup.id };
}

/**
 * Restores a JSON export snapshot (replace) or writes a merged snapshot, after a
 * backup. Nothing is added to the data itself, so a backup re-imported into an
 * empty browser is restored byte for byte; undo goes through the backup.
 */
export async function commitSnapshot(
  data: ExportData,
  meta: { fileName: string; fileHash: string; mode: 'merge' | 'replace' },
  appVersion: string,
): Promise<ImportOutcome> {
  const { importBatchSchema } = await loadSchemas();
  const backup = await createBackup(meta.mode === 'replace' ? 'restore' : 'import', appVersion);
  const batch = importBatchSchema.parse({
    id: uuidv7(),
    source: 'json',
    fileName: meta.fileName.slice(0, 255),
    fileHash: meta.fileHash,
    importedAt: nowIso(),
    count: data.operations.length,
    mode: meta.mode,
    createdCategoryIds: [],
    backupId: backup.id,
    undoneAt: null,
  });
  await replaceWithSnapshot(data);
  return { batch, backupId: backup.id };
}

/** Restores the automatic backup taken before an operation (JSON restore undo). */
export async function restoreBackup(backupId: string, appVersion: string): Promise<void> {
  const text = await backupText(backupId);
  if (!text) throw new UndoImportError('backupMissing');
  const parsed = await parseExportJson(text);
  if (!parsed.ok) throw new UndoImportError('backupMissing');
  await createBackup('restore', appVersion);
  await replaceWithSnapshot(parsed.data);
}

export class UndoImportError extends Error {
  constructor(readonly code: 'notFound' | 'alreadyUndone' | 'backupMissing') {
    super(code);
  }
}

/**
 * Undoes an import. Merge: removes the batch's operations and the categories it
 * created (when no longer used). Replace / JSON restore: restores the backup taken
 * just before the import.
 */
export async function undoImport(batchId: string, appVersion: string): Promise<void> {
  const db = getDb();
  const batch = await db.importBatches.get(batchId);
  if (!batch) throw new UndoImportError('notFound');
  if (batch.undoneAt) throw new UndoImportError('alreadyUndone');
  if (batch.mode === 'replace' || batch.source === 'json') {
    if (!batch.backupId) throw new UndoImportError('backupMissing');
    await restoreBackup(batch.backupId, appVersion);
    return;
  }
  await createBackup('undoImport', appVersion);
  await db.transaction('rw', db.operations, db.categories, db.importBatches, async () => {
    await db.operations.where('importBatchId').equals(batchId).delete();
    for (const id of batch.createdCategoryIds) {
      const used = await db.operations.where('categoryId').equals(id).count();
      const children = await db.categories.where('parentId').equals(id).count();
      if (used === 0 && children === 0) await db.categories.delete(id);
    }
    await db.importBatches.put({ ...batch, undoneAt: nowIso() });
  });
}
