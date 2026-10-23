/**
 * Monthly envelopes (global and per category) with optional carry-over.
 *
 *   Remaining(c, M) = Envelope(c, M) + (rollover ? Remaining(c, M-1) : 0) − Spent(c, M)
 *
 * With `autoRenew`, a month without its own envelope for c inherits the latest
 * previous envelope (so budgets do not have to be re-entered every month).
 */
import { addPeriods, type Period } from '../common/civil-date';
import { expandCategoryIds } from '../operations/operations';
import type { Budget, Category } from '../model/types';
import type { PeriodTotals } from '../analytics/totals';

export const ALERT_WARN_RATIO = 0.8;
export const ALERT_OVER_RATIO = 1;

export type AlertLevel = 'none' | 'ok' | 'warn' | 'over';

export interface BudgetLine {
  /** null = global envelope */
  readonly categoryId: string | null;
  readonly envelopeMinor: number;
  readonly carryMinor: number;
  readonly spentMinor: number;
  readonly availableMinor: number; // envelope + carry
  readonly remainingMinor: number; // available − spent
  /** spent / available (0 when available ≤ 0 and nothing spent) */
  readonly ratio: number;
  readonly level: AlertLevel;
  readonly rollover: boolean;
  /** Envelope inherited from a previous month (auto-renew) instead of defined for this month. */
  readonly inherited: boolean;
  readonly sourcePeriod: Period | null;
}

const key = (categoryId: string | null): string => categoryId ?? '__global__';

/** Effective envelope for (period, category): exact record, else latest previous one when autoRenew. */
export function effectiveBudget(
  budgets: readonly Budget[],
  period: Period,
  categoryId: string | null,
  autoRenew: boolean,
): Budget | null {
  let best: Budget | null = null;
  for (const b of budgets) {
    if (b.categoryId !== categoryId) continue;
    if (b.period === period) return b;
    if (autoRenew && b.period < period && (best === null || b.period > best.period)) best = b;
  }
  return best;
}

export function alertLevel(spent: number, available: number): AlertLevel {
  if (available <= 0) return spent > 0 ? 'over' : 'none';
  const ratio = spent / available;
  if (ratio >= ALERT_OVER_RATIO) return 'over';
  if (ratio >= ALERT_WARN_RATIO) return 'warn';
  return 'ok';
}

function spentFor(
  totals: PeriodTotals | undefined,
  categoryIds: ReadonlySet<string> | null,
): number {
  if (!totals) return 0;
  if (categoryIds === null) return totals.expenseMinor;
  let sum = 0;
  for (const [id, v] of totals.expenseByCategory) if (categoryIds.has(id)) sum += v;
  return sum;
}

export interface BudgetComputationInput {
  readonly budgets: readonly Budget[];
  readonly categories: readonly Category[];
  readonly totalsByPeriod: ReadonlyMap<Period, PeriodTotals>;
  readonly autoRenew: boolean;
}

/** Maximum number of months walked back to compute a carry-over chain. */
const MAX_CARRY_DEPTH = 240;

function computeLine(
  input: BudgetComputationInput,
  period: Period,
  categoryId: string | null,
): BudgetLine | null {
  const budget = effectiveBudget(input.budgets, period, categoryId, input.autoRenew);
  if (!budget) return null;
  const ids = categoryId === null ? null : expandCategoryIds([categoryId], input.categories);
  // Walk back while rollover chains, then forward to accumulate.
  const chain: { period: Period; budget: Budget }[] = [{ period, budget }];
  let cursor = period;
  let current = budget;
  for (let depth = 0; current.rollover && depth < MAX_CARRY_DEPTH; depth += 1) {
    const prevPeriod = addPeriods(cursor, -1);
    const prev = effectiveBudget(input.budgets, prevPeriod, categoryId, input.autoRenew);
    if (!prev) break;
    chain.unshift({ period: prevPeriod, budget: prev });
    cursor = prevPeriod;
    current = prev;
  }
  let carry = 0;
  let last: BudgetLine | null = null;
  chain.forEach((step, i) => {
    const envelope = step.budget.amountMinor;
    const stepCarry = i === 0 ? 0 : step.budget.rollover ? carry : 0;
    const spent = spentFor(input.totalsByPeriod.get(step.period), ids);
    const available = envelope + stepCarry;
    const remaining = available - spent;
    last = {
      categoryId,
      envelopeMinor: envelope,
      carryMinor: stepCarry,
      spentMinor: spent,
      availableMinor: available,
      remainingMinor: remaining,
      ratio: available > 0 ? spent / available : spent > 0 ? Infinity : 0,
      level: alertLevel(spent, available),
      rollover: step.budget.rollover,
      inherited: step.budget.period !== step.period,
      sourcePeriod: step.budget.period,
    };
    carry = remaining;
  });
  return last;
}

export interface BudgetOverview {
  readonly period: Period;
  readonly global: BudgetLine | null;
  readonly categories: readonly BudgetLine[];
  /** Σ envelopes of top-level categories (for the "total" line). */
  readonly totalEnvelopeMinor: number;
  readonly totalSpentMinor: number;
}

export function budgetOverview(input: BudgetComputationInput, period: Period): BudgetOverview {
  const global = computeLine(input, period, null);
  const categoryIds = new Set<string>();
  for (const b of input.budgets) if (b.categoryId !== null) categoryIds.add(b.categoryId);
  const lines: BudgetLine[] = [];
  for (const id of categoryIds) {
    const line = computeLine(input, period, id);
    if (line && (line.envelopeMinor > 0 || line.carryMinor !== 0 || line.spentMinor > 0))
      lines.push(line);
  }
  const order = new Map(input.categories.map((c) => [c.id, c.order]));
  lines.sort((a, b) => (order.get(a.categoryId ?? '') ?? 0) - (order.get(b.categoryId ?? '') ?? 0));
  const byId = new Map(input.categories.map((c) => [c.id, c]));
  const topLevel = lines.filter((l) => {
    const c = l.categoryId ? byId.get(l.categoryId) : undefined;
    return !c || c.parentId === null || !categoryIds.has(c.parentId);
  });
  return {
    period,
    global,
    categories: lines,
    totalEnvelopeMinor: topLevel.reduce((a, l) => a + l.envelopeMinor, 0),
    totalSpentMinor: input.totalsByPeriod.get(period)?.expenseMinor ?? 0,
  };
}

export interface BudgetAlert {
  readonly categoryId: string | null;
  readonly level: Exclude<AlertLevel, 'none' | 'ok'>;
  readonly ratio: number;
  readonly remainingMinor: number;
}

export function budgetAlerts(overview: BudgetOverview): BudgetAlert[] {
  const lines = [overview.global, ...overview.categories].filter(
    (l): l is BudgetLine => l !== null,
  );
  return lines
    .filter(
      (l): l is BudgetLine & { level: 'warn' | 'over' } => l.level === 'warn' || l.level === 'over',
    )
    .map((l) => ({
      categoryId: l.categoryId,
      level: l.level,
      ratio: l.ratio,
      remainingMinor: l.remainingMinor,
    }))
    .sort((a, b) => b.ratio - a.ratio);
}

/** Crossing detection used after saving an operation (toast "80 % du budget consommé"). */
export function crossedThreshold(before: AlertLevel, after: AlertLevel): 'warn' | 'over' | null {
  const rank: Record<AlertLevel, number> = { none: 0, ok: 0, warn: 1, over: 2 };
  if (rank[after] > rank[before]) return after === 'over' ? 'over' : 'warn';
  return null;
}

/** Copies the envelopes of `from` into `to` (returns drafts without ids/timestamps). */
export function copyBudgets(
  budgets: readonly Budget[],
  from: Period,
  to: Period,
): Pick<Budget, 'period' | 'categoryId' | 'amountMinor' | 'rollover'>[] {
  return budgets
    .filter((b) => b.period === from)
    .map((b) => ({
      period: to,
      categoryId: b.categoryId,
      amountMinor: b.amountMinor,
      rollover: b.rollover,
    }));
}

export { key as budgetKey };
