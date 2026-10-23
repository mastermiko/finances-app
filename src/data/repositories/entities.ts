/**
 * Repositories of the reference entities: categories, accounts, budgets, tags,
 * rules, recurrences and goals.
 */
import { uuidv7 } from '@/domain/common/uuid';
import { wouldCreateCycle } from '@/domain/categories/categories';
import { copyBudgets } from '@/domain/budgets/budgets';
import {
  generateOccurrences,
  nextOccurrenceAfter,
  parseRRule,
} from '@/domain/recurrences/recurrences';
import { addPeriods, periodBounds, periodOfDate, type Period } from '@/domain/common/civil-date';
import { applyRules, patchIsEmpty } from '@/domain/rules/rules';
import {
  type Account,
  type Budget,
  type Category,
  type Goal,
  type Operation,
  type Recurrence,
  type Rule,
  type Tag,
} from '@/domain/model';
import { loadSchemas } from '../schemas-loader';
import { nowIso, today } from '../clock';
import { getDb } from '../db';
import { requireSettings } from './settings';

type Draft<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

// ---------------------------------------------------------------------------
// Categories

export async function createCategory(
  draft: Omit<Draft<Category>, 'order' | 'archived'> & { order?: number },
): Promise<Category> {
  const { categorySchema } = await loadSchemas();
  const db = getDb();
  const stamp = nowIso();
  const order = draft.order ?? (await db.categories.count());
  const category = categorySchema.parse({
    ...draft,
    order,
    archived: false,
    id: uuidv7(),
    createdAt: stamp,
    updatedAt: stamp,
  });
  await db.categories.add(category);
  return category;
}

export class CategoryError extends Error {
  constructor(
    readonly code: 'cycle' | 'kindMismatch' | 'needsReassignment' | 'sameCategory' | 'notFound',
  ) {
    super(code);
  }
}

export async function updateCategory(
  id: string,
  patch: Partial<Draft<Category>>,
): Promise<Category> {
  const { categorySchema } = await loadSchemas();
  const db = getDb();
  return db.transaction('rw', db.categories, db.operations, async () => {
    const current = await db.categories.get(id);
    if (!current) throw new CategoryError('notFound');
    const all = await db.categories.toArray();
    if (patch.parentId !== undefined && wouldCreateCycle(id, patch.parentId, all))
      throw new CategoryError('cycle');
    if (patch.kind && patch.kind !== current.kind) {
      const used = await db.operations.where('categoryId').equals(id).count();
      if (used > 0) throw new CategoryError('kindMismatch');
    }
    const next = categorySchema.parse({ ...current, ...patch, updatedAt: nowIso() });
    await db.categories.put(next);
    return next;
  });
}

export async function reorderCategories(orderedIds: readonly string[]): Promise<void> {
  const db = getDb();
  const stamp = nowIso();
  await db.transaction('rw', db.categories, async () => {
    const cats = await db.categories.bulkGet([...orderedIds]);
    await db.categories.bulkPut(
      cats
        .filter((c): c is Category => c !== undefined)
        .map((c) => ({ ...c, order: orderedIds.indexOf(c.id), updatedAt: stamp })),
    );
  });
}

export async function categoryUsage(
  id: string,
): Promise<{ operations: number; budgets: number; rules: number; children: number }> {
  const db = getDb();
  const [operations, budgets, rules, children] = await Promise.all([
    db.operations.where('categoryId').equals(id).count(),
    db.budgets.where('categoryId').equals(id).count(),
    db.rules.filter((r) => r.actions.categoryId === id).count(),
    db.categories.where('parentId').equals(id).count(),
  ]);
  return { operations, budgets, rules, children };
}

/**
 * Deletes a category. Linked operations, recurrences and rules must be moved to
 * `reassignTo` (same kind); budgets of the category are dropped; children move up.
 */
export async function deleteCategory(id: string, reassignTo: string | null): Promise<void> {
  const db = getDb();
  await db.transaction(
    'rw',
    [db.categories, db.operations, db.budgets, db.rules, db.recurrences],
    async () => {
      const category = await db.categories.get(id);
      if (!category) throw new CategoryError('notFound');
      const usage = await categoryUsage(id);
      const recurrences = (await db.recurrences.toArray()).filter(
        (r) => r.template.categoryId === id,
      );
      const needs = usage.operations > 0 || usage.rules > 0 || recurrences.length > 0;
      if (needs && reassignTo === null) throw new CategoryError('needsReassignment');
      if (reassignTo === id) throw new CategoryError('sameCategory');
      const stamp = nowIso();
      if (reassignTo !== null) {
        const target = await db.categories.get(reassignTo);
        if (!target) throw new CategoryError('notFound');
        if (target.kind !== category.kind) throw new CategoryError('kindMismatch');
        await db.operations
          .where('categoryId')
          .equals(id)
          .modify((op: Operation) => {
            op.categoryId = reassignTo;
            op.updatedAt = stamp;
          });
        await db.rules
          .filter((r) => r.actions.categoryId === id)
          .modify((r: Rule) => {
            r.actions = { ...r.actions, categoryId: reassignTo };
            r.updatedAt = stamp;
          });
        for (const rec of recurrences) {
          await db.recurrences.put({
            ...rec,
            template: { ...rec.template, categoryId: reassignTo },
            updatedAt: stamp,
          });
        }
      }
      await db.budgets.where('categoryId').equals(id).delete();
      await db.categories
        .where('parentId')
        .equals(id)
        .modify((c: Category) => {
          c.parentId = category.parentId;
          c.updatedAt = stamp;
        });
      await db.categories.delete(id);
    },
  );
}

// ---------------------------------------------------------------------------
// Accounts

export async function createAccount(
  draft: Omit<Draft<Account>, 'order' | 'archived'>,
): Promise<Account> {
  const { accountSchema } = await loadSchemas();
  const db = getDb();
  const stamp = nowIso();
  const account = accountSchema.parse({
    ...draft,
    order: await db.accounts.count(),
    archived: false,
    id: uuidv7(),
    createdAt: stamp,
    updatedAt: stamp,
  });
  await db.accounts.add(account);
  return account;
}

export async function updateAccount(id: string, patch: Partial<Draft<Account>>): Promise<Account> {
  const { accountSchema } = await loadSchemas();
  const db = getDb();
  return db.transaction('rw', db.accounts, async () => {
    const current = await db.accounts.get(id);
    if (!current) throw new Error('Account not found');
    const next = accountSchema.parse({ ...current, ...patch, updatedAt: nowIso() });
    await db.accounts.put(next);
    return next;
  });
}

export class AccountError extends Error {
  constructor(readonly code: 'inUse' | 'lastAccount') {
    super(code);
  }
}

export async function deleteAccount(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.accounts, db.operations, db.settings, async () => {
    if ((await db.accounts.count()) <= 1) throw new AccountError('lastAccount');
    if ((await db.operations.where('accountId').equals(id).count()) > 0)
      throw new AccountError('inUse');
    await db.accounts.delete(id);
    const settings = await db.settings.get('settings');
    if (settings?.defaultAccountId === id) {
      const next = await db.accounts.orderBy('order').first();
      await db.settings.put({
        ...settings,
        defaultAccountId: next?.id ?? null,
        updatedAt: nowIso(),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Budgets

export async function setBudget(
  period: Period,
  categoryId: string | null,
  amountMinor: number,
  rollover: boolean,
): Promise<Budget> {
  const { budgetSchema } = await loadSchemas();
  const db = getDb();
  return db.transaction('rw', db.budgets, async () => {
    const existing = await db.budgets
      .where('period')
      .equals(period)
      .filter((b) => b.categoryId === categoryId)
      .first();
    const stamp = nowIso();
    const budget = budgetSchema.parse({
      id: existing?.id ?? uuidv7(),
      period,
      categoryId,
      amountMinor,
      rollover,
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    });
    await db.budgets.put(budget);
    return budget;
  });
}

export async function deleteBudget(period: Period, categoryId: string | null): Promise<void> {
  const db = getDb();
  await db.budgets
    .where('period')
    .equals(period)
    .filter((b) => b.categoryId === categoryId)
    .delete();
}

/** Copies the envelopes of the previous month (one click). Existing envelopes are overwritten. */
export async function copyPreviousBudgets(period: Period): Promise<number> {
  const db = getDb();
  const all = await db.budgets.toArray();
  // Source: the latest month before `period` that has envelopes.
  const source = all
    .map((b) => b.period)
    .filter((p) => p < period)
    .sort()
    .pop();
  if (!source) return 0;
  const drafts = copyBudgets(all, source, period);
  for (const d of drafts) await setBudget(d.period, d.categoryId, d.amountMinor, d.rollover);
  return drafts.length;
}

// ---------------------------------------------------------------------------
// Tags

export async function createTag(name: string, color: string): Promise<Tag> {
  const { tagSchema } = await loadSchemas();
  const stamp = nowIso();
  const tag = tagSchema.parse({ id: uuidv7(), name, color, createdAt: stamp, updatedAt: stamp });
  await getDb().tags.add(tag);
  return tag;
}

export async function updateTag(
  id: string,
  patch: Partial<Pick<Tag, 'name' | 'color'>>,
): Promise<Tag> {
  const { tagSchema } = await loadSchemas();
  const db = getDb();
  const current = await db.tags.get(id);
  if (!current) throw new Error('Tag not found');
  const next = tagSchema.parse({ ...current, ...patch, updatedAt: nowIso() });
  await db.tags.put(next);
  return next;
}

export async function deleteTag(id: string): Promise<void> {
  const db = getDb();
  const stamp = nowIso();
  await db.transaction('rw', db.tags, db.operations, db.rules, db.recurrences, async () => {
    await db.operations
      .where('tagIds')
      .equals(id)
      .modify((op: Operation) => {
        op.tagIds = op.tagIds.filter((t) => t !== id);
        op.updatedAt = stamp;
      });
    await db.rules
      .filter((r) => r.actions.addTagIds.includes(id))
      .modify((r: Rule) => {
        r.actions = { ...r.actions, addTagIds: r.actions.addTagIds.filter((t) => t !== id) };
        r.updatedAt = stamp;
      });
    await db.recurrences
      .filter((r) => r.template.tagIds.includes(id))
      .modify((r: Recurrence) => {
        r.template = { ...r.template, tagIds: r.template.tagIds.filter((t) => t !== id) };
        r.updatedAt = stamp;
      });
    await db.tags.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Rules

export async function saveRule(
  rule: Omit<Draft<Rule>, 'priority'> & { id?: string; priority?: number },
): Promise<Rule> {
  const { ruleSchema } = await loadSchemas();
  const db = getDb();
  const stamp = nowIso();
  const existing = rule.id ? await db.rules.get(rule.id) : undefined;
  const next = ruleSchema.parse({
    ...existing,
    ...rule,
    id: existing?.id ?? uuidv7(),
    priority: rule.priority ?? existing?.priority ?? (await db.rules.count()),
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  });
  await db.rules.put(next);
  return next;
}

export async function deleteRule(id: string): Promise<void> {
  await getDb().rules.delete(id);
}

/**
 * Applies the given rules retroactively to the listed operations, in one
 * transaction. Returns the previous versions for undo.
 */
export async function applyRulesToOperations(
  ruleIds: readonly string[],
  operationIds: readonly string[],
): Promise<Operation[]> {
  const { operationSchema } = await loadSchemas();
  const db = getDb();
  return db.transaction('rw', db.operations, db.rules, db.categories, async () => {
    const rules = (await db.rules.bulkGet([...ruleIds]))
      .filter((r): r is Rule => r !== undefined)
      .map((r) => ({ ...r, enabled: true }));
    const kinds = new Map((await db.categories.toArray()).map((c) => [c.id, c.kind]));
    const ops = (await db.operations.bulkGet([...operationIds])).filter(
      (o): o is Operation => o !== undefined,
    );
    const stamp = nowIso();
    const before: Operation[] = [];
    const after: Operation[] = [];
    for (const op of ops) {
      const patch = applyRules(op, rules, kinds);
      if (patchIsEmpty(patch)) continue;
      before.push(op);
      after.push(
        operationSchema.parse({
          ...op,
          ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
          ...(patch.tagIds !== undefined ? { tagIds: patch.tagIds } : {}),
          updatedAt: stamp,
        }),
      );
    }
    await db.operations.bulkPut(after);
    return before;
  });
}

// ---------------------------------------------------------------------------
// Recurrences

export async function saveRecurrence(
  draft: Omit<Draft<Recurrence>, 'nextDate'> & { id?: string },
): Promise<Recurrence> {
  const { recurrenceSchema } = await loadSchemas();
  const db = getDb();
  const stamp = nowIso();
  const existing = draft.id ? await db.recurrences.get(draft.id) : undefined;
  const parsed = parseRRule(draft.rule);
  if (!parsed.ok) throw new Error(`Invalid rule: ${parsed.error}`);
  const ruleChanged =
    !existing || existing.rule !== draft.rule || existing.dtstart !== draft.dtstart;
  const nextDate = ruleChanged
    ? nextOccurrenceAfter(parsed.rule, draft.dtstart, null)
    : (existing?.nextDate ?? null);
  const rec = recurrenceSchema.parse({
    ...existing,
    ...draft,
    id: existing?.id ?? uuidv7(),
    nextDate,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  });
  await db.transaction('rw', db.recurrences, db.operations, async () => {
    if (existing && ruleChanged) {
      // Regenerate: drop planned occurrences not yet confirmed.
      await db.operations
        .where('recurrenceId')
        .equals(existing.id)
        .filter((o) => o.status === 'planned')
        .delete();
    }
    await db.recurrences.put(rec);
  });
  return rec;
}

export async function deleteRecurrence(id: string, deletePlanned: boolean): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.recurrences, db.operations, async () => {
    if (deletePlanned) {
      await db.operations
        .where('recurrenceId')
        .equals(id)
        .filter((o) => o.status === 'planned')
        .delete();
    }
    await db.recurrences.delete(id);
  });
}

/**
 * Generates due occurrences of every active recurrence up to the end of the next
 * budget period, and confirms auto-confirmed occurrences whose date is reached.
 * Idempotent: occurrences are keyed by (recurrenceId, date or period).
 */
export async function runRecurrences(): Promise<number> {
  const db = getDb();
  // Most launches have nothing to do: skip loading the validation code then.
  if ((await db.recurrences.count()) === 0) return 0;
  const { operationSchema } = await loadSchemas();
  const settings = await requireSettings();
  const day = today();
  const currentPeriod = periodOfDate(day, settings.budgetMonthStartDay);
  const horizon = periodBounds(addPeriods(currentPeriod, 1), settings.budgetMonthStartDay).end;
  return db.transaction('rw', db.recurrences, db.operations, async () => {
    const recurrences = await db.recurrences
      .filter((r) => r.active && r.nextDate !== null && r.nextDate <= horizon)
      .toArray();
    let created = 0;
    const stamp = nowIso();
    for (const rec of recurrences) {
      const existing = await db.operations.where('recurrenceId').equals(rec.id).toArray();
      const keys = new Set(
        existing.map((o) => o.recurrenceKey).filter((k): k is string => k !== null),
      );
      const result = generateOccurrences(
        rec,
        horizon,
        day,
        settings.budgetMonthStartDay,
        stamp,
        keys,
      );
      const valid = result.operations.map((o) => operationSchema.parse(o));
      if (valid.length > 0) await db.operations.bulkAdd(valid);
      created += valid.length;
      await db.recurrences.put({ ...rec, nextDate: result.nextDate, updatedAt: stamp });
    }
    // Auto-confirm reached occurrences
    const autoIds = new Set(
      (await db.recurrences.filter((r) => r.autoConfirm).toArray()).map((r) => r.id),
    );
    if (autoIds.size > 0) {
      await db.operations
        .where('recurrenceId')
        .anyOf([...autoIds])
        .filter(
          (o) =>
            o.status === 'planned' &&
            o.deletedAt === null &&
            (o.date === null ? o.period <= currentPeriod : o.date <= day),
        )
        .modify((o: Operation) => {
          o.status = 'cleared';
          o.updatedAt = stamp;
        });
    }
    return created;
  });
}

// ---------------------------------------------------------------------------
// Goals

export async function saveGoal(
  draft: Omit<Draft<Goal>, 'archived'> & { id?: string; archived?: boolean },
): Promise<Goal> {
  const { goalSchema } = await loadSchemas();
  const db = getDb();
  const stamp = nowIso();
  const existing = draft.id ? await db.goals.get(draft.id) : undefined;
  const goal = goalSchema.parse({
    archived: false,
    ...existing,
    ...draft,
    id: existing?.id ?? uuidv7(),
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  });
  await db.goals.put(goal);
  return goal;
}

export async function deleteGoal(id: string): Promise<void> {
  await getDb().goals.delete(id);
}

// ---------------------------------------------------------------------------
// Key-value (drafts, UI preferences, bank mappings, error log)

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const entry = await getDb().kv.get(key);
  return entry?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await getDb().kv.put({ key, value });
}

export async function kvDelete(key: string): Promise<void> {
  await getDb().kv.delete(key);
}
