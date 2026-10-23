/**
 * Turns parsed rows into operations ready to be written: categories, accounts
 * and tags are matched by name (case and accent insensitive) or created; rules
 * normalise labels; duplicates against existing data are detected (never removed
 * automatically: the user decides).
 */
import { findCategoryByName } from '@/domain/categories/categories';
import { periodOfDate } from '@/domain/common/civil-date';
import { labelKey } from '@/domain/common/text';
import { uuidv7 } from '@/domain/common/uuid';
import { buildLabelIndex, buildOperation, findDuplicates } from '@/domain/operations/operations';
import { applyRules } from '@/domain/rules/rules';
import {
  paletteColor,
  type Account,
  type Category,
  type Operation,
  type Rule,
  type Settings,
  type Tag,
} from '@/domain/model';
import type { IncomingRow, ParsedImport } from '@/io/import-types';

export interface ResolveContext {
  readonly categories: readonly Category[];
  readonly accounts: readonly Account[];
  readonly tags: readonly Tag[];
  readonly rules: readonly Rule[];
  readonly existing: readonly Operation[];
  readonly settings: Settings;
  readonly targetAccountId: string;
  readonly mode: 'merge' | 'replace';
  readonly nowIso: string;
  /** Localised name of the fallback category ("À classer"). */
  readonly uncategorizedName: string;
}

export interface DuplicateInfo {
  readonly index: number;
  readonly existing: readonly Operation[];
}

export interface ResolvedImport {
  readonly operations: readonly Operation[];
  readonly newCategories: readonly Category[];
  readonly newAccounts: readonly Account[];
  readonly newTags: readonly Tag[];
  readonly duplicates: readonly DuplicateInfo[];
  readonly categoryCounts: readonly {
    readonly categoryId: string;
    readonly name: string;
    readonly count: number;
    readonly created: boolean;
  }[];
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  readonly incomeMinor: number;
  readonly expenseMinor: number;
}

export function resolveImport(parsed: ParsedImport, ctx: ResolveContext): ResolvedImport {
  const categories = [...ctx.categories];
  const accounts = [...ctx.accounts];
  const tags = [...ctx.tags];
  const newCategories: Category[] = [];
  const newAccounts: Account[] = [];
  const newTags: Tag[] = [];
  const kinds = new Map(categories.map((c) => [c.id, c.kind]));
  const history = buildLabelIndex(ctx.existing);
  const historyByKey = new Map(history.map((h) => [h.key, h]));
  let paletteIndex = categories.length;

  const createCategory = (
    name: string,
    kind: 'expense' | 'income',
    parentId: string | null,
  ): Category => {
    const category: Category = {
      id: uuidv7(),
      name: name.trim().slice(0, 60),
      parentId,
      kind,
      color: paletteColor(paletteIndex),
      icon: kind === 'income' ? 'wallet' : 'tag',
      order: categories.length,
      archived: false,
      createdAt: ctx.nowIso,
      updatedAt: ctx.nowIso,
    };
    paletteIndex += 1;
    categories.push(category);
    newCategories.push(category);
    kinds.set(category.id, kind);
    return category;
  };

  const findOrCreateCategory = (
    name: string,
    kind: 'expense' | 'income',
    parentName?: string | null,
  ): Category => {
    let parentId: string | null = null;
    if (parentName) {
      const parent =
        findCategoryByName(
          categories.filter((c) => c.kind === kind && c.parentId === null),
          parentName,
        ) ?? createCategory(parentName, kind, null);
      parentId = parent.id;
    }
    const candidates = categories.filter(
      (c) => c.kind === kind && (parentName ? c.parentId === parentId : true),
    );
    const found = findCategoryByName(candidates, name);
    if (found) return found;
    // "Revenu" from the workbook: any income category with that name, else the first income category.
    if (
      kind === 'income' &&
      !parentName &&
      ['revenu', 'revenus', 'income'].includes(labelKey(name))
    ) {
      const firstIncome = categories.find((c) => c.kind === 'income' && !c.archived);
      if (firstIncome) return firstIncome;
    }
    return createCategory(name, kind, parentId);
  };

  const fallbackCategory = (kind: 'expense' | 'income'): Category => {
    if (kind === 'income') {
      return (
        categories.find((c) => c.kind === 'income' && !c.archived) ??
        findOrCreateCategory(ctx.uncategorizedName, 'income')
      );
    }
    return findOrCreateCategory(ctx.uncategorizedName, 'expense');
  };

  const findOrCreateAccount = (name: string): Account => {
    const found = accounts.find((a) => labelKey(a.name) === labelKey(name));
    if (found) return found;
    const account: Account = {
      id: uuidv7(),
      name: name.slice(0, 60),
      type: 'checking',
      currency: ctx.settings.currency,
      openingBalanceMinor: 0,
      openingDate: null,
      order: accounts.length,
      archived: false,
      createdAt: ctx.nowIso,
      updatedAt: ctx.nowIso,
    };
    accounts.push(account);
    newAccounts.push(account);
    return account;
  };

  const findOrCreateTag = (name: string): Tag => {
    const found = tags.find((t) => labelKey(t.name) === labelKey(name));
    if (found) return found;
    const tag: Tag = {
      id: uuidv7(),
      name: name.slice(0, 40),
      color: paletteColor(tags.length),
      createdAt: ctx.nowIso,
      updatedAt: ctx.nowIso,
    };
    tags.push(tag);
    newTags.push(tag);
    return tag;
  };

  const transferGroups = new Map<string, string>();
  const operations: Operation[] = [];
  const startDay = ctx.settings.budgetMonthStartDay;

  parsed.rows.forEach((row: IncomingRow) => {
    const account = row.accountName
      ? findOrCreateAccount(row.accountName)
      : (accounts.find((a) => a.id === ctx.targetAccountId) ?? accounts[0]);
    if (!account) return;
    const period = row.period ?? (row.date ? periodOfDate(row.date, startDay) : null);
    if (!period) return;
    const tagIds = (row.tagNames ?? []).map((n) => findOrCreateTag(n).id);
    if (row.kind === 'transfer') {
      const original = row.externalId ?? `row-${row.source.row}`;
      let group = transferGroups.get(original);
      if (!group) {
        group = uuidv7();
        transferGroups.set(original, group);
      }
      operations.push(
        buildOperation(
          {
            accountId: account.id,
            date: row.date,
            period,
            amountMinor: row.amountMinor,
            currency: account.currency,
            kind: 'transfer',
            categoryId: null,
            label: row.label,
            note: row.note,
            tagIds,
            status: row.status ?? 'cleared',
            transferGroupId: group,
            amountExpression: row.amountExpression,
          },
          startDay,
          ctx.nowIso,
        ),
      );
      return;
    }
    const kind = row.kind;
    let categoryId: string | null = null;
    if (row.categoryName) {
      categoryId = findOrCreateCategory(row.categoryName, kind, row.parentCategoryName).id;
    }
    // Rules: label normalisation and tags always; category only when the file has none.
    const patch = applyRules({ label: row.label, categoryId, tagIds, kind }, ctx.rules, kinds);
    const label = patch.label ?? row.label;
    if (!categoryId && patch.categoryId) categoryId = patch.categoryId;
    if (!categoryId) {
      const habit = historyByKey.get(labelKey(label));
      if (habit?.categoryId && kinds.get(habit.categoryId) === kind) categoryId = habit.categoryId;
    }
    if (!categoryId) categoryId = fallbackCategory(kind).id;
    operations.push(
      buildOperation(
        {
          accountId: account.id,
          date: row.date,
          period,
          amountMinor: row.amountMinor,
          currency: account.currency,
          kind,
          categoryId,
          label,
          note: row.note,
          tagIds: patch.tagIds ?? tagIds,
          status: row.status ?? 'cleared',
          amountExpression: row.amountExpression,
        },
        startDay,
        ctx.nowIso,
      ),
    );
  });

  const duplicates =
    ctx.mode === 'merge'
      ? findDuplicates(operations, ctx.existing).map((d) => ({
          index: d.incomingIndex,
          existing: ctx.existing.filter((o) => d.existingIds.includes(o.id)),
        }))
      : [];

  const counts = new Map<string, number>();
  let income = 0;
  let expense = 0;
  for (const op of operations) {
    if (op.categoryId) counts.set(op.categoryId, (counts.get(op.categoryId) ?? 0) + 1);
    if (op.kind === 'income') income += op.amountMinor;
    else if (op.kind === 'expense') expense -= op.amountMinor;
  }
  const createdIds = new Set(newCategories.map((c) => c.id));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const periods = operations.map((o) => o.period).sort();
  return {
    operations,
    newCategories: newCategories.filter(
      (c) => counts.has(c.id) || categories.some((x) => x.parentId === c.id),
    ),
    newAccounts,
    newTags,
    duplicates,
    categoryCounts: [...counts.entries()]
      .map(([categoryId, count]) => ({
        categoryId,
        name: byId.get(categoryId)?.name ?? '',
        count,
        created: createdIds.has(categoryId),
      }))
      .sort((a, b) => b.count - a.count),
    periodFrom: periods[0] ?? null,
    periodTo: periods[periods.length - 1] ?? null,
    incomeMinor: income,
    expenseMinor: expense,
  };
}
