/**
 * Start-up sequence: open the database, create the initial records on first
 * launch, run pending data migrations (with backup and rollback), purge the
 * trash and generate recurring operations.
 */
import {
  SCHEMA_VERSION,
  createDefaultAccount,
  createDefaultCategories,
  createDefaultSettings,
  createMeta,
  migrateData,
  type AppLocale,
} from '@/domain/model';
import { loadSchemas } from './schemas-loader';
import { getDb } from './db';
import { nowIso } from './clock';
import { purgeTrash } from './repositories/operations';
import { runRecurrences } from './repositories/entities';
import { readSnapshot, replaceWithSnapshot } from './repositories/snapshot';

export interface BootstrapResult {
  readonly firstLaunch: boolean;
  readonly migratedFrom: number | null;
  readonly purged: number;
  readonly generated: number;
}

export class BootstrapError extends Error {
  constructor(
    readonly code: 'dataTooNew' | 'migrationFailed',
    options?: { cause?: unknown },
  ) {
    super(code, options);
  }
}

export function detectLocale(languages: readonly string[]): AppLocale {
  return languages.some((l) => l.toLowerCase().startsWith('fr')) || languages.length === 0
    ? 'fr-FR'
    : 'en-GB';
}

export async function initialize(
  appVersion: string,
  preferredLocale: AppLocale,
  defaultAccountName: string,
): Promise<BootstrapResult> {
  const db = getDb();
  await db.open();
  const stamp = nowIso();
  let firstLaunch = false;
  await db.transaction('rw', [db.meta, db.settings, db.accounts, db.categories], async () => {
    const meta = await db.meta.get('meta');
    if (!meta) {
      firstLaunch = (await db.settings.count()) === 0;
      await db.meta.put(createMeta(appVersion, stamp));
    }
    let settings = await db.settings.get('settings');
    if (!settings) {
      settings = createDefaultSettings(stamp, preferredLocale);
      await db.settings.put(settings);
    }
    if ((await db.accounts.count()) === 0) {
      const account = createDefaultAccount(defaultAccountName, settings.currency, stamp);
      await db.accounts.add(account);
      await db.settings.put({ ...settings, defaultAccountId: account.id, updatedAt: stamp });
    }
    if (firstLaunch && (await db.categories.count()) === 0) {
      await db.categories.bulkAdd(createDefaultCategories(settings.locale, stamp));
    }
  });

  const migratedFrom = await migrateIfNeeded(appVersion);
  const purged = await purgeTrash();
  const generated = await runRecurrences();
  return { firstLaunch, migratedFrom, purged, generated };
}

/**
 * Data migrations of the local database: backup, migrate a full snapshot with the
 * pure migration chain, validate, write back in one transaction. On failure the
 * transaction is aborted and the previous state stays untouched.
 */
async function migrateIfNeeded(appVersion: string): Promise<number | null> {
  const db = getDb();
  const meta = await db.meta.get('meta');
  if (!meta) return null;
  if (meta.schemaVersion > SCHEMA_VERSION) throw new BootstrapError('dataTooNew');
  if (meta.schemaVersion === SCHEMA_VERSION) {
    if (meta.appVersion !== appVersion) await db.meta.put({ ...meta, appVersion });
    return null;
  }
  const from = meta.schemaVersion;
  // Rare path: load validation and backup code only when a migration is due.
  const [{ exportDataSchema }, { createBackupFrom }] = await Promise.all([
    loadSchemas(),
    import('./backups'),
  ]);
  const snapshot = await readSnapshot();
  await createBackupFrom(snapshot, 'migration', meta.appVersion);
  try {
    const migrated = migrateData(snapshot, from).data;
    await replaceWithSnapshot(exportDataSchema.parse(migrated));
    await db.meta.put({ ...meta, schemaVersion: SCHEMA_VERSION, appVersion });
  } catch (cause) {
    throw new BootstrapError('migrationFailed', { cause });
  }
  return from;
}
