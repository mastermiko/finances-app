/**
 * Whole-database snapshots: export, replace (restore) and merge.
 * All writes happen in a single transaction: all or nothing.
 */
import { type ExportData } from '@/domain/model';
import { loadSchemas } from '../schemas-loader';
import { getDb } from '../db';

export async function readSnapshot(): Promise<ExportData> {
  const db = getDb();
  return db.transaction('r', db.dataTables, async () => {
    const [
      accounts,
      categories,
      operations,
      budgets,
      recurrences,
      rules,
      tags,
      goals,
      importBatches,
      settings,
    ] = await Promise.all([
      db.accounts.toArray(),
      db.categories.toArray(),
      db.operations.toArray(),
      db.budgets.toArray(),
      db.recurrences.toArray(),
      db.rules.toArray(),
      db.tags.toArray(),
      db.goals.toArray(),
      db.importBatches.toArray(),
      db.settings.get('settings'),
    ]);
    if (!settings) throw new Error('Settings not initialised');
    return {
      accounts,
      categories,
      operations,
      budgets,
      recurrences,
      rules,
      tags,
      goals,
      importBatches,
      settings,
    };
  });
}

/** Replaces every data table with the snapshot (validated first). */
export async function replaceWithSnapshot(snapshot: ExportData): Promise<void> {
  const { exportDataSchema } = await loadSchemas();
  const data = exportDataSchema.parse(snapshot);
  const db = getDb();
  await db.transaction('rw', db.dataTables, async () => {
    await Promise.all(db.dataTables.map((t) => t.clear()));
    await db.accounts.bulkAdd(data.accounts);
    await db.categories.bulkAdd(data.categories);
    await db.operations.bulkAdd(data.operations);
    await db.budgets.bulkAdd(data.budgets);
    await db.recurrences.bulkAdd(data.recurrences);
    await db.rules.bulkAdd(data.rules);
    await db.tags.bulkAdd(data.tags);
    await db.goals.bulkAdd(data.goals);
    await db.importBatches.bulkAdd(data.importBatches);
    await db.settings.put(data.settings);
  });
}

export async function clearAllData(): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [...db.dataTables, db.kv, db.meta], async () => {
    await Promise.all([...db.dataTables, db.kv, db.meta].map((t) => t.clear()));
  });
}
