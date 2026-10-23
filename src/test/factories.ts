/** Test data factories. */
import { uuidv7 } from '@/domain/common/uuid';
import {
  createDefaultSettings,
  paletteColor,
  type Account,
  type Budget,
  type Category,
  type ExportData,
  type Operation,
  type Rule,
  type Settings,
  type Tag,
} from '@/domain/model';

export const NOW = '2026-10-23T10:00:00.000Z';

export function category(overrides: Partial<Category> = {}): Category {
  return {
    id: uuidv7(),
    name: 'Alimentation',
    parentId: null,
    kind: 'expense',
    color: paletteColor(2),
    icon: 'utensils',
    order: 0,
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: uuidv7(),
    name: 'Compte courant',
    type: 'checking',
    currency: 'EUR',
    openingBalanceMinor: 0,
    openingDate: null,
    order: 0,
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function operation(overrides: Partial<Operation> & Pick<Operation, 'accountId'>): Operation {
  const kind = overrides.kind ?? 'expense';
  return {
    id: uuidv7(),
    date: '2026-10-10',
    period: '2026-10',
    amountMinor: -1000,
    currency: 'EUR',
    kind,
    categoryId: kind === 'transfer' ? null : uuidv7(),
    label: 'Café',
    amountExpression: null,
    note: '',
    tagIds: [],
    status: 'cleared',
    recurrenceId: null,
    recurrenceKey: null,
    transferGroupId: kind === 'transfer' ? uuidv7() : null,
    importBatchId: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

export function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: uuidv7(),
    period: '2026-10',
    categoryId: null,
    amountMinor: 10000,
    rollover: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: uuidv7(),
    name: 'Règle',
    matchType: 'contains',
    pattern: 'café',
    actions: { categoryId: null, label: null, addTagIds: [] },
    priority: 0,
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function tag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: uuidv7(),
    name: 'café',
    color: paletteColor(0),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...createDefaultSettings(NOW), ...overrides };
}

export function exportData(overrides: Partial<ExportData> = {}): ExportData {
  const acc = account();
  const cat = category();
  return {
    accounts: [acc],
    categories: [cat],
    operations: [operation({ accountId: acc.id, categoryId: cat.id })],
    budgets: [],
    recurrences: [],
    rules: [],
    tags: [],
    goals: [],
    importBatches: [],
    settings: settings({ defaultAccountId: acc.id }),
    ...overrides,
  };
}
