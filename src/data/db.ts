/**
 * IndexedDB schema (Dexie). Screens never touch this module directly: they go
 * through the repositories of this folder.
 */
import Dexie, { type EntityTable, type Table } from 'dexie';
import type {
  Account,
  Budget,
  Category,
  Goal,
  ImportBatch,
  Meta,
  Operation,
  Recurrence,
  Rule,
  Settings,
  Tag,
} from '@/domain/model';

export interface KvEntry {
  readonly key: string;
  readonly value: unknown;
}

export const DB_NAME = 'finances';

export class FinancesDb extends Dexie {
  operations!: EntityTable<Operation, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  importBatches!: EntityTable<ImportBatch, 'id'>;
  settings!: Table<Settings, 'settings'>;
  meta!: Table<Meta, 'meta'>;
  recurrences!: EntityTable<Recurrence, 'id'>;
  rules!: EntityTable<Rule, 'id'>;
  tags!: EntityTable<Tag, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  kv!: Table<KvEntry, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    // IndexedDB structure version (indexes). The data format version lives in meta.schemaVersion.
    this.version(1).stores({
      operations:
        'id, period, date, categoryId, accountId, [period+categoryId], updatedAt, importBatchId, transferGroupId, recurrenceId, deletedAt, *tagIds',
      categories: 'id, parentId, order',
      budgets: 'id, period, categoryId, [period+categoryId]',
      accounts: 'id, order',
      importBatches: 'id, importedAt',
      settings: 'id',
      meta: 'id',
      recurrences: 'id, nextDate',
      rules: 'id, priority',
      tags: 'id, name',
      goals: 'id',
      kv: 'key',
    });
  }

  get dataTables(): Table[] {
    return [
      this.operations,
      this.categories,
      this.budgets,
      this.accounts,
      this.importBatches,
      this.settings,
      this.recurrences,
      this.rules,
      this.tags,
      this.goals,
    ];
  }
}

let instance: FinancesDb | null = null;

export function getDb(): FinancesDb {
  instance ??= new FinancesDb();
  return instance;
}

/** Test helper: use a fresh database (fake-indexeddb). */
export function setDb(db: FinancesDb | null): void {
  instance = db;
}
