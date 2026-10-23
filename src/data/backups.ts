/**
 * Automatic local backups, taken before every import, migration, restore and
 * reset. Stored gzip-compressed in a separate IndexedDB database so that a reset
 * of the main database keeps them (only "Delete all my data" removes them).
 */
import Dexie, { type Table } from 'dexie';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { uuidv7 } from '@/domain/common/uuid';
import { SCHEMA_VERSION, type ExportData } from '@/domain/model';
import { serializeExport } from '@/io/json/export-json';
import { readSnapshot } from './repositories/snapshot';
import { nowIso } from './clock';

export type BackupReason = 'import' | 'migration' | 'restore' | 'reset' | 'manual' | 'undoImport';

export interface BackupRecord {
  readonly id: string;
  readonly createdAt: string;
  readonly reason: BackupReason;
  readonly appVersion: string;
  readonly schemaVersion: number;
  readonly operationCount: number;
  readonly size: number;
  readonly gz: Uint8Array;
}

export type BackupInfo = Omit<BackupRecord, 'gz'>;

function withoutPayload(record: BackupRecord): BackupInfo {
  return {
    id: record.id,
    createdAt: record.createdAt,
    reason: record.reason,
    appVersion: record.appVersion,
    schemaVersion: record.schemaVersion,
    operationCount: record.operationCount,
    size: record.size,
  };
}

export const MAX_BACKUPS = 5;
export const BACKUP_DB_NAME = 'finances-backups';

class BackupDb extends Dexie {
  backups!: Table<BackupRecord, string>;
  constructor() {
    super(BACKUP_DB_NAME);
    this.version(1).stores({ backups: 'id, createdAt, reason' });
  }
}

let backupDb: BackupDb | null = null;
function getBackupDb(): BackupDb {
  backupDb ??= new BackupDb();
  return backupDb;
}

export function resetBackupDbHandle(): void {
  backupDb?.close();
  backupDb = null;
}

export async function createBackupFrom(
  data: ExportData,
  reason: BackupReason,
  appVersion: string,
): Promise<BackupInfo> {
  const { text } = await serializeExport(data, appVersion, nowIso());
  const gz = gzipSync(strToU8(text), { level: 6 });
  const record: BackupRecord = {
    id: uuidv7(),
    createdAt: nowIso(),
    reason,
    appVersion,
    schemaVersion: SCHEMA_VERSION,
    operationCount: data.operations.length,
    size: gz.byteLength,
    gz,
  };
  const db = getBackupDb();
  await db.backups.add(record);
  // Keep the most recent ones only.
  const all = await db.backups.orderBy('createdAt').primaryKeys();
  if (all.length > MAX_BACKUPS) await db.backups.bulkDelete(all.slice(0, all.length - MAX_BACKUPS));
  return withoutPayload(record);
}

export async function createBackup(reason: BackupReason, appVersion: string): Promise<BackupInfo> {
  return createBackupFrom(await readSnapshot(), reason, appVersion);
}

export async function listBackups(): Promise<BackupInfo[]> {
  const records = await getBackupDb().backups.orderBy('createdAt').reverse().toArray();
  return records.map(withoutPayload);
}

/** Export JSON text of a backup (same format as a manual export). */
export async function backupText(id: string): Promise<string | null> {
  const record = await getBackupDb().backups.get(id);
  return record ? strFromU8(gunzipSync(record.gz)) : null;
}

export async function deleteBackup(id: string): Promise<void> {
  await getBackupDb().backups.delete(id);
}

export async function deleteBackupDatabase(): Promise<void> {
  resetBackupDbHandle();
  await Dexie.delete(BACKUP_DB_NAME);
}
