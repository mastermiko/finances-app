/** Persistent storage request and quota estimation. */

export interface StorageStatus {
  readonly persisted: boolean | null;
  readonly usage: number | null;
  readonly quota: number | null;
  readonly ratio: number | null;
}

export const STORAGE_ALERT_RATIO = 0.8;

export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageStatus(): Promise<StorageStatus> {
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    const usage = estimate?.usage ?? null;
    const quota = estimate?.quota ?? null;
    return { persisted, usage, quota, ratio: usage !== null && quota ? usage / quota : null };
  } catch {
    return { persisted: null, usage: null, quota: null, ratio: null };
  }
}

export function isStorageCritical(status: StorageStatus): boolean {
  return status.ratio !== null && status.ratio >= STORAGE_ALERT_RATIO;
}

/** "Delete all my data": IndexedDB databases, Cache Storage and service workers. */
export async function wipeEverything(dbNames: readonly string[]): Promise<void> {
  const { default: Dexie } = await import('dexie');
  for (const name of dbNames) await Dexie.delete(name);
  if ('caches' in globalThis) {
    for (const key of await caches.keys()) await caches.delete(key);
  }
  if ('serviceWorker' in navigator) {
    for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // storage may be unavailable (private mode)
  }
}

/** Closes the databases and wipes everything (see wipeEverything). */
export async function deleteAllData(): Promise<void> {
  const { getDb, setDb, DB_NAME } = await import('./db');
  const { resetBackupDbHandle, BACKUP_DB_NAME } = await import('./backups');
  getDb().close();
  setDb(null);
  resetBackupDbHandle();
  await wipeEverything([DB_NAME, BACKUP_DB_NAME]);
}
