/**
 * Reactive data shared by every screen. Operations are loaded once and kept in
 * memory (Dexie liveQuery refreshes them on any change, including from another
 * tab); filters, totals and charts are then pure in-memory computations.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { indexById } from '@/domain/categories/categories';
import { totalsByPeriod, type PeriodTotals } from '@/domain/analytics/totals';
import { periodOfDate, type Period } from '@/domain/common/civil-date';
import type {
  Account,
  Budget,
  Category,
  Goal,
  ImportBatch,
  Operation,
  Recurrence,
  Rule,
  Settings,
  Tag,
} from '@/domain/model';
import { queries, today } from '@/data';
import { measure } from './perf';

export interface AppData {
  readonly settings: Settings;
  readonly categories: readonly Category[];
  readonly accounts: readonly Account[];
  readonly tags: readonly Tag[];
  readonly rules: readonly Rule[];
  readonly recurrences: readonly Recurrence[];
  readonly budgets: readonly Budget[];
  readonly goals: readonly Goal[];
  readonly importBatches: readonly ImportBatch[];
  /** Live operations (trash excluded). */
  readonly operations: readonly Operation[];
  readonly trashCount: number;
  readonly categoriesById: ReadonlyMap<string, Category>;
  readonly accountsById: ReadonlyMap<string, Account>;
  readonly tagsById: ReadonlyMap<string, Tag>;
  /** Cleared totals per period. */
  readonly totals: ReadonlyMap<Period, PeriodTotals>;
  readonly currentPeriod: Period;
  readonly defaultAccountId: string;
}

const DataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const value = useContext(DataContext);
  if (!value) throw new Error('useAppData outside DataProvider');
  return value;
}

/** Same as useAppData but returns null while loading (for the shell). */
export function useAppDataOptional(): AppData | null {
  return useContext(DataContext);
}

export function DataProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}): ReactNode {
  const settings = useLiveQuery(queries.settings);
  const categories = useLiveQuery(queries.categories);
  const accounts = useLiveQuery(queries.accounts);
  const tags = useLiveQuery(queries.tags);
  const rules = useLiveQuery(queries.rules);
  const recurrences = useLiveQuery(queries.recurrences);
  const budgets = useLiveQuery(queries.budgets);
  const goals = useLiveQuery(queries.goals);
  const importBatches = useLiveQuery(queries.importBatches);
  const allOperations = useLiveQuery(queries.operations);

  const value = useMemo<AppData | null>(() => {
    if (
      !settings ||
      !categories ||
      !accounts ||
      !tags ||
      !rules ||
      !recurrences ||
      !budgets ||
      !goals ||
      !importBatches ||
      !allOperations
    ) {
      return null;
    }
    const operations = allOperations.filter((o) => o.deletedAt === null);
    return measure('finances:derive', () => ({
      settings,
      categories,
      accounts,
      tags,
      rules,
      recurrences,
      budgets,
      goals,
      importBatches,
      operations,
      trashCount: allOperations.length - operations.length,
      categoriesById: indexById(categories),
      accountsById: indexById(accounts),
      tagsById: indexById(tags),
      totals: totalsByPeriod(operations),
      currentPeriod: periodOfDate(today(), settings.budgetMonthStartDay),
      defaultAccountId: settings.defaultAccountId ?? accounts[0]?.id ?? '',
    }));
  }, [
    settings,
    categories,
    accounts,
    tags,
    rules,
    recurrences,
    budgets,
    goals,
    importBatches,
    allOperations,
  ]);

  if (!value) return fallback;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/** Test helper. */
export function StaticDataProvider({
  value,
  children,
}: {
  value: AppData;
  children: ReactNode;
}): ReactNode {
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
