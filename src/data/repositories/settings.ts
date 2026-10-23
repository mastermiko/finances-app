import { type Meta, type Settings } from '@/domain/model';
import { loadSchemas } from '../schemas-loader';
import { getDb } from '../db';
import { nowIso } from '../clock';

export async function getSettings(): Promise<Settings | undefined> {
  return getDb().settings.get('settings');
}

export async function requireSettings(): Promise<Settings> {
  const settings = await getSettings();
  if (!settings) throw new Error('Settings not initialised');
  return settings;
}

export type SettingsPatch = Partial<Omit<Settings, 'id' | 'updatedAt'>>;

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const { settingsSchema } = await loadSchemas();
  const db = getDb();
  return db.transaction('rw', db.settings, async () => {
    const current = await requireSettings();
    const next = settingsSchema.parse({ ...current, ...patch, updatedAt: nowIso() });
    await db.settings.put(next);
    return next;
  });
}

export async function getMeta(): Promise<Meta | undefined> {
  return getDb().meta.get('meta');
}

export async function markBackupDone(): Promise<void> {
  await updateSettings({ lastBackupAt: nowIso() });
}
