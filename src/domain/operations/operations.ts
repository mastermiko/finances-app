import { periodOfDate, type CivilDate, type Period } from '../common/civil-date';
import { cleanLabel, labelKey, matchesText } from '../common/text';
import { uuidv7 } from '../common/uuid';
import type { Category, Operation, OperationKind, OperationStatus } from '../model/types';

/** An operation is "live" when it is not in the trash. */
export function isLive(op: Pick<Operation, 'deletedAt'>): boolean {
  return op.deletedAt === null;
}

/** Live and cleared: counts in real balances (planned operations only feed the forecast). */
export function isEffective(op: Pick<Operation, 'deletedAt' | 'status'>): boolean {
  return op.deletedAt === null && op.status === 'cleared';
}

export type SortDirection = 'asc' | 'desc';

/**
 * Default order (spreadsheet "TrierOperations" macro): by period, undated charges
 * first, then chronological, then creation order. `desc` reverses everything.
 */
export function compareOperations(
  a: Operation,
  b: Operation,
  direction: SortDirection = 'asc',
): number {
  const factor = direction === 'asc' ? 1 : -1;
  if (a.period !== b.period) return (a.period < b.period ? -1 : 1) * factor;
  if (a.date === null && b.date !== null) return -1;
  if (a.date !== null && b.date === null) return 1;
  if (a.date !== null && b.date !== null && a.date !== b.date)
    return (a.date < b.date ? -1 : 1) * factor;
  if (a.createdAt !== b.createdAt) return (a.createdAt < b.createdAt ? -1 : 1) * factor;
  return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * factor;
}

export function sortOperations(
  ops: readonly Operation[],
  direction: SortDirection = 'asc',
): Operation[] {
  return [...ops].sort((a, b) => compareOperations(a, b, direction));
}

// ---------------------------------------------------------------------------
// Filters

export interface OperationFilter {
  readonly periodFrom?: Period | undefined;
  readonly periodTo?: Period | undefined;
  readonly categoryIds?: readonly string[] | undefined;
  readonly accountIds?: readonly string[] | undefined;
  readonly kinds?: readonly OperationKind[] | undefined;
  readonly statuses?: readonly OperationStatus[] | undefined;
  readonly tagIds?: readonly string[] | undefined;
  /** Absolute amount bounds, minor units, inclusive. */
  readonly minAbs?: number | undefined;
  readonly maxAbs?: number | undefined;
  readonly text?: string | undefined;
  readonly undatedOnly?: boolean | undefined;
}

/** Category ids including every descendant (sub-categories). */
export function expandCategoryIds(
  ids: readonly string[],
  categories: readonly Category[],
): Set<string> {
  const result = new Set(ids);
  let added = true;
  while (added) {
    added = false;
    for (const c of categories) {
      if (c.parentId !== null && result.has(c.parentId) && !result.has(c.id)) {
        result.add(c.id);
        added = true;
      }
    }
  }
  return result;
}

export function createOperationPredicate(
  filter: OperationFilter,
  categories: readonly Category[] = [],
): (op: Operation) => boolean {
  const categorySet =
    filter.categoryIds && filter.categoryIds.length > 0
      ? expandCategoryIds(filter.categoryIds, categories)
      : null;
  const accountSet =
    filter.accountIds && filter.accountIds.length > 0 ? new Set(filter.accountIds) : null;
  const kindSet = filter.kinds && filter.kinds.length > 0 ? new Set(filter.kinds) : null;
  const statusSet = filter.statuses && filter.statuses.length > 0 ? new Set(filter.statuses) : null;
  const tagSet = filter.tagIds && filter.tagIds.length > 0 ? new Set(filter.tagIds) : null;
  const needle = filter.text ? labelKey(filter.text) : '';
  return (op) => {
    if (op.deletedAt !== null) return false;
    if (filter.periodFrom && op.period < filter.periodFrom) return false;
    if (filter.periodTo && op.period > filter.periodTo) return false;
    if (categorySet && (op.categoryId === null || !categorySet.has(op.categoryId))) return false;
    if (accountSet && !accountSet.has(op.accountId)) return false;
    if (kindSet && !kindSet.has(op.kind)) return false;
    if (statusSet && !statusSet.has(op.status)) return false;
    if (tagSet && !op.tagIds.some((t) => tagSet.has(t))) return false;
    const abs = Math.abs(op.amountMinor);
    if (filter.minAbs !== undefined && abs < filter.minAbs) return false;
    if (filter.maxAbs !== undefined && abs > filter.maxAbs) return false;
    if (filter.undatedOnly && op.date !== null) return false;
    if (needle !== '' && !matchesText(`${op.label} ${op.note}`, needle)) return false;
    return true;
  };
}

export function filterOperations(
  ops: readonly Operation[],
  filter: OperationFilter,
  categories: readonly Category[] = [],
): Operation[] {
  return ops.filter(createOperationPredicate(filter, categories));
}

export interface SelectionTotals {
  readonly count: number;
  readonly totalMinor: number;
  readonly incomeMinor: number;
  readonly expenseMinor: number;
}

/** Totals of a selection. Transfers count in `totalMinor` only. */
export function selectionTotals(ops: readonly Operation[]): SelectionTotals {
  let total = 0;
  let income = 0;
  let expense = 0;
  for (const op of ops) {
    total += op.amountMinor;
    if (op.kind === 'income') income += op.amountMinor;
    else if (op.kind === 'expense') expense -= op.amountMinor;
  }
  return { count: ops.length, totalMinor: total, incomeMinor: income, expenseMinor: expense };
}

// ---------------------------------------------------------------------------
// Duplicates

/** Duplicate key: same date (or period when undated), amount, normalised label and account. */
export function duplicateKey(
  op: Pick<Operation, 'date' | 'period' | 'amountMinor' | 'label' | 'accountId'>,
): string {
  return [op.date ?? `P${op.period}`, op.amountMinor, labelKey(op.label), op.accountId].join('|');
}

export interface DuplicateMatch {
  readonly incomingIndex: number;
  readonly existingIds: readonly string[];
}

export function findDuplicates(
  incoming: readonly Pick<Operation, 'date' | 'period' | 'amountMinor' | 'label' | 'accountId'>[],
  existing: readonly Operation[],
): DuplicateMatch[] {
  const index = new Map<string, string[]>();
  for (const op of existing) {
    if (op.deletedAt !== null) continue;
    const key = duplicateKey(op);
    const list = index.get(key);
    if (list) list.push(op.id);
    else index.set(key, [op.id]);
  }
  const matches: DuplicateMatch[] = [];
  incoming.forEach((op, incomingIndex) => {
    const ids = index.get(duplicateKey(op));
    if (ids) matches.push({ incomingIndex, existingIds: ids });
  });
  return matches;
}

// ---------------------------------------------------------------------------
// Construction

export interface OperationDraft {
  readonly accountId: string;
  readonly date: CivilDate | null;
  /** Required when date is null; otherwise derived from date unless explicitly overridden. */
  readonly period?: Period | null | undefined;
  readonly amountMinor: number;
  readonly currency: string;
  readonly kind: OperationKind;
  readonly categoryId: string | null;
  readonly label: string;
  readonly amountExpression?: string | null | undefined;
  readonly note?: string | undefined;
  readonly tagIds?: readonly string[] | undefined;
  readonly status?: OperationStatus | undefined;
  readonly recurrenceId?: string | null | undefined;
  readonly recurrenceKey?: string | null | undefined;
  readonly transferGroupId?: string | null | undefined;
  readonly importBatchId?: string | null | undefined;
}

export function resolvePeriod(
  date: CivilDate | null,
  period: Period | null | undefined,
  startDay: number,
): Period {
  if (period) return period;
  if (date === null) throw new RangeError('An undated operation needs an explicit period');
  return periodOfDate(date, startDay);
}

export function buildOperation(
  draft: OperationDraft,
  startDay: number,
  nowIso: string,
  id: string = uuidv7(),
): Operation {
  return {
    id,
    accountId: draft.accountId,
    date: draft.date,
    period: resolvePeriod(draft.date, draft.period, startDay),
    amountMinor: draft.amountMinor,
    currency: draft.currency,
    kind: draft.kind,
    categoryId: draft.kind === 'transfer' ? null : draft.categoryId,
    label: cleanLabel(draft.label),
    amountExpression: draft.amountExpression ?? null,
    note: (draft.note ?? '').trim(),
    tagIds: [...(draft.tagIds ?? [])],
    status: draft.status ?? 'cleared',
    recurrenceId: draft.recurrenceId ?? null,
    recurrenceKey: draft.recurrenceKey ?? null,
    transferGroupId: draft.transferGroupId ?? null,
    importBatchId: draft.importBatchId ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
  };
}

/** Signs an absolute amount according to the operation kind (expenses are negative). */
export function signedAmount(
  absoluteMinor: number,
  kind: Exclude<OperationKind, 'transfer'>,
  refund = false,
): number {
  const abs = Math.abs(absoluteMinor);
  const negative = kind === 'expense' ? !refund : refund;
  return negative ? -abs : abs;
}

export interface TransferDraft {
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amountMinor: number; // absolute
  readonly currency: string;
  readonly date: CivilDate | null;
  readonly period?: Period | null | undefined;
  readonly label: string;
  readonly note?: string | undefined;
  readonly tagIds?: readonly string[] | undefined;
  readonly status?: OperationStatus | undefined;
  readonly recurrenceId?: string | null | undefined;
  readonly recurrenceKey?: string | null | undefined;
  readonly importBatchId?: string | null | undefined;
}

/** A transfer is two linked operations (out and in), excluded from income and expenses. */
export function buildTransfer(
  draft: TransferDraft,
  startDay: number,
  nowIso: string,
): [Operation, Operation] {
  if (draft.fromAccountId === draft.toAccountId)
    throw new RangeError('Transfer accounts must differ');
  const groupId = uuidv7();
  const abs = Math.abs(draft.amountMinor);
  const common = {
    date: draft.date,
    period: draft.period,
    currency: draft.currency,
    kind: 'transfer' as const,
    categoryId: null,
    label: draft.label,
    note: draft.note,
    tagIds: draft.tagIds,
    status: draft.status,
    recurrenceId: draft.recurrenceId,
    recurrenceKey: draft.recurrenceKey,
    transferGroupId: groupId,
    importBatchId: draft.importBatchId,
  };
  return [
    buildOperation(
      { ...common, accountId: draft.fromAccountId, amountMinor: -abs },
      startDay,
      nowIso,
    ),
    buildOperation({ ...common, accountId: draft.toAccountId, amountMinor: abs }, startDay, nowIso),
  ];
}

/** Copy of an operation with a new id and fresh timestamps (transfer links are not copied). */
export function duplicateOperation(op: Operation, nowIso: string): Operation {
  return {
    ...op,
    id: uuidv7(),
    status: 'cleared',
    recurrenceId: null,
    recurrenceKey: null,
    importBatchId: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Label autocompletion

export interface LabelSuggestion {
  readonly label: string;
  readonly key: string;
  readonly categoryId: string | null;
  readonly kind: OperationKind;
  readonly count: number;
  readonly lastUsed: string;
  readonly lastAmountMinor: number;
}

/**
 * Builds the autocomplete index from history: one entry per normalised label with
 * its most frequent category ("habitual category") and most recent spelling.
 */
export function buildLabelIndex(ops: readonly Operation[]): LabelSuggestion[] {
  interface Acc {
    label: string;
    lastUsed: string;
    count: number;
    lastAmountMinor: number;
    kind: OperationKind;
    categories: Map<string, number>;
  }
  const map = new Map<string, Acc>();
  for (const op of ops) {
    if (op.deletedAt !== null || op.label === '' || op.kind === 'transfer') continue;
    const key = labelKey(op.label);
    if (key === '') continue;
    const stamp = `${op.date ?? `${op.period}-00`}|${op.createdAt}`;
    let acc = map.get(key);
    if (!acc) {
      acc = {
        label: op.label,
        lastUsed: stamp,
        count: 0,
        lastAmountMinor: op.amountMinor,
        kind: op.kind,
        categories: new Map(),
      };
      map.set(key, acc);
    }
    acc.count += 1;
    if (stamp >= acc.lastUsed) {
      acc.lastUsed = stamp;
      acc.label = op.label;
      acc.lastAmountMinor = op.amountMinor;
      acc.kind = op.kind;
    }
    if (op.categoryId)
      acc.categories.set(op.categoryId, (acc.categories.get(op.categoryId) ?? 0) + 1);
  }
  const out: LabelSuggestion[] = [];
  for (const [key, acc] of map) {
    let best: string | null = null;
    let bestCount = 0;
    for (const [id, count] of acc.categories) {
      if (count > bestCount) {
        best = id;
        bestCount = count;
      }
    }
    out.push({
      label: acc.label,
      key,
      categoryId: best,
      kind: acc.kind,
      count: acc.count,
      lastUsed: acc.lastUsed,
      lastAmountMinor: acc.lastAmountMinor,
    });
  }
  return out.sort((a, b) => b.count - a.count || (a.lastUsed < b.lastUsed ? 1 : -1));
}

/** Prefix matches first, then word-prefix, then substring; by frequency. */
export function suggestLabels(
  index: readonly LabelSuggestion[],
  query: string,
  limit = 6,
): LabelSuggestion[] {
  const q = labelKey(query);
  if (q === '') return [];
  const scored: { s: LabelSuggestion; score: number }[] = [];
  for (const s of index) {
    let score = -1;
    if (s.key.startsWith(q)) score = 3;
    else if (s.key.split(' ').some((w) => w.startsWith(q))) score = 2;
    else if (s.key.includes(q)) score = 1;
    if (score >= 0 && s.key !== q) scored.push({ s, score });
    else if (score >= 0) scored.push({ s, score: 4 });
  }
  return scored
    .sort((a, b) => b.score - a.score || b.s.count - a.s.count)
    .slice(0, limit)
    .map((x) => x.s);
}

/** Most recently used categories first (for the entry grid). */
export function recentCategoryOrder(
  ops: readonly Operation[],
  categories: readonly Category[],
  sampleSize = 200,
): Category[] {
  const recent = [...ops]
    .filter((op) => op.deletedAt === null && op.categoryId !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, sampleSize);
  const score = new Map<string, number>();
  recent.forEach((op, i) => {
    if (op.categoryId) score.set(op.categoryId, (score.get(op.categoryId) ?? 0) + (sampleSize - i));
  });
  return [...categories]
    .filter((c) => !c.archived)
    .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || a.order - b.order);
}
