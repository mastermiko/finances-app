/**
 * Read queries for reactive hooks (Dexie liveQuery). Screens subscribe through
 * features/shared/app-data.tsx and never import Dexie themselves.
 */
import { getDb } from './db';

export const queries = {
  settings: () => getDb().settings.get('settings'),
  meta: () => getDb().meta.get('meta'),
  categories: () => getDb().categories.orderBy('order').toArray(),
  accounts: () => getDb().accounts.orderBy('order').toArray(),
  tags: () => getDb().tags.orderBy('name').toArray(),
  rules: () => getDb().rules.orderBy('priority').toArray(),
  recurrences: () => getDb().recurrences.toArray(),
  budgets: () => getDb().budgets.toArray(),
  goals: () => getDb().goals.toArray(),
  importBatches: () => getDb().importBatches.orderBy('importedAt').reverse().toArray(),
  /** Every operation, trash included (filtered in memory). */
  operations: () => getDb().operations.toArray(),
  kv: (key: string) => getDb().kv.get(key),
};
