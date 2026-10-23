import {
  addPeriods,
  periodBounds,
  periodRange,
  type CivilDate,
  type Period,
} from '../common/civil-date';
import { labelKey } from '../common/text';
import { indexById, rootCategoryId } from '../categories/categories';
import type { Account, Category, Goal, Operation } from '../model/types';
import { isEffective } from '../operations/operations';
import { totalsByPeriod, type PeriodTotals } from './totals';

export interface CategorySeries {
  readonly categoryId: string;
  readonly values: readonly number[]; // per period, positive expenses
  readonly total: number;
}

export interface MonthlyMatrix {
  readonly periods: readonly Period[];
  readonly series: readonly CategorySeries[];
  readonly totals: readonly number[];
}

/** Expenses per root category over the given periods (12-month evolution, annual view). */
export function expenseMatrix(
  byPeriod: ReadonlyMap<Period, PeriodTotals>,
  categories: readonly Category[],
  periods: readonly Period[],
): MonthlyMatrix {
  const byId = indexById(categories);
  const series = new Map<string, number[]>();
  periods.forEach((p, i) => {
    const t = byPeriod.get(p);
    if (!t) return;
    for (const [id, amount] of t.expenseByCategory) {
      const root = id === '' ? '' : rootCategoryId(id, byId);
      let values = series.get(root);
      if (!values) {
        values = periods.map(() => 0);
        series.set(root, values);
      }
      values[i] = (values[i] ?? 0) + amount;
    }
  });
  const order = new Map(categories.map((c) => [c.id, c.order]));
  const list = [...series.entries()]
    .map(([categoryId, values]) => ({
      categoryId,
      values,
      total: values.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => (order.get(a.categoryId) ?? 999) - (order.get(b.categoryId) ?? 999));
  return {
    periods,
    series: list,
    totals: periods.map((p) => byPeriod.get(p)?.expenseMinor ?? 0),
  };
}

export interface IncomeExpensePoint {
  readonly period: Period;
  readonly incomeMinor: number;
  readonly expenseMinor: number;
  readonly resultMinor: number;
  readonly savingsRate: number | null;
}

export function incomeExpenseSeries(
  byPeriod: ReadonlyMap<Period, PeriodTotals>,
  periods: readonly Period[],
): IncomeExpensePoint[] {
  return periods.map((period) => {
    const t = byPeriod.get(period);
    const income = t?.incomeMinor ?? 0;
    const expense = t?.expenseMinor ?? 0;
    const result = t?.resultMinor ?? 0;
    return {
      period,
      incomeMinor: income,
      expenseMinor: expense,
      resultMinor: result,
      savingsRate: income > 0 ? result / income : null,
    };
  });
}

export function lastPeriods(end: Period, count: number): Period[] {
  return periodRange(addPeriods(end, -(count - 1)), end);
}

export function yearPeriods(year: number): Period[] {
  return periodRange(`${year}-01`, `${year}-12`);
}

export interface TopLabel {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly totalMinor: number; // signed
}

export function topLabels(
  ops: readonly Operation[],
  from: Period,
  to: Period,
  limit = 10,
  kind: 'expense' | 'income' = 'expense',
): TopLabel[] {
  const map = new Map<string, { label: string; count: number; total: number }>();
  for (const op of ops) {
    if (!isEffective(op) || op.kind !== kind || op.period < from || op.period > to) continue;
    const key = labelKey(op.label) || '—';
    const acc = map.get(key) ?? { label: op.label || '—', count: 0, total: 0 };
    acc.count += 1;
    acc.total += op.amountMinor;
    map.set(key, acc);
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count, totalMinor: v.total }))
    .sort((a, b) => Math.abs(b.totalMinor) - Math.abs(a.totalMinor))
    .slice(0, limit);
}

/** Net amount carrying a tag, per period (negative = spent). Transfers excluded. */
export function tagSeries(
  ops: readonly Operation[],
  tagId: string,
  periods: readonly Period[],
): number[] {
  const index = new Map(periods.map((p, i) => [p, i]));
  const values = periods.map(() => 0);
  for (const op of ops) {
    if (!isEffective(op) || op.kind === 'transfer' || !op.tagIds.includes(tagId)) continue;
    const i = index.get(op.period);
    if (i !== undefined) values[i] = (values[i] ?? 0) + op.amountMinor;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Forecast (V2)

export interface Forecast {
  readonly period: Period;
  readonly clearedResultMinor: number;
  readonly plannedRemainingMinor: number;
  /** Expected additional variable expenses (≥ 0), from the 3-month average. */
  readonly expectedVariableMinor: number;
  readonly averageVariableMinor: number;
  readonly projectedResultMinor: number;
  readonly projectedClosingMinor: number;
}

/**
 * End-of-month projection = cleared result so far + planned operations still to
 * come − the part of the 3-month average of variable expenses not yet spent.
 * Variable expenses = expenses that do not come from a recurrence.
 */
export function forecastPeriod(
  ops: readonly Operation[],
  period: Period,
  today: CivilDate,
  startDay: number,
  openingMinor: number,
): Forecast {
  const variableOf = (p: Period): number => {
    let sum = 0;
    for (const op of ops) {
      if (isEffective(op) && op.period === p && op.kind === 'expense' && op.recurrenceId === null)
        sum -= op.amountMinor;
    }
    return sum;
  };
  const average = Math.round(
    [1, 2, 3].map((i) => variableOf(addPeriods(period, -i))).reduce((a, b) => a + b, 0) / 3,
  );
  let cleared = 0;
  let planned = 0;
  for (const op of ops) {
    if (op.deletedAt !== null || op.period !== period || op.kind === 'transfer') continue;
    if (op.status === 'cleared') cleared += op.amountMinor;
    else planned += op.amountMinor;
  }
  const spentVariable = variableOf(period);
  const { end } = periodBounds(period, startDay);
  // "You usually spend X on variable items; Y is already spent: expect X − Y more."
  const expectedVariable = today > end ? 0 : Math.max(0, average - spentVariable);
  const projected = cleared + planned - expectedVariable;
  return {
    period,
    clearedResultMinor: cleared,
    plannedRemainingMinor: planned,
    expectedVariableMinor: expectedVariable,
    averageVariableMinor: average,
    projectedResultMinor: projected,
    projectedClosingMinor: openingMinor + projected,
  };
}

// ---------------------------------------------------------------------------
// Savings goals (V2)

export interface GoalProgress {
  readonly goal: Goal;
  readonly currentMinor: number;
  readonly ratio: number;
  readonly remainingMinor: number;
  readonly monthsLeft: number | null;
  /** Monthly effort needed to reach the target by the due date. */
  readonly monthlyEffortMinor: number | null;
  readonly reached: boolean;
}

export function goalProgress(
  goal: Goal,
  balances: ReadonlyMap<string, number>,
  today: CivilDate,
  accounts: readonly Account[],
): GoalProgress {
  const current = goal.accountId
    ? (balances.get(goal.accountId) ?? 0)
    : accounts
        .filter((a) => a.type === 'savings')
        .reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
  const remaining = Math.max(0, goal.targetMinor - current);
  let monthsLeft: number | null = null;
  let effort: number | null = null;
  if (goal.dueDate) {
    const [ty, tm] = today.split('-').map(Number);
    const [dy, dm] = goal.dueDate.split('-').map(Number);
    monthsLeft = Math.max(0, ((dy ?? 0) - (ty ?? 0)) * 12 + ((dm ?? 0) - (tm ?? 0)));
    effort = remaining === 0 ? 0 : Math.ceil(remaining / Math.max(1, monthsLeft));
  }
  return {
    goal,
    currentMinor: current,
    ratio: goal.targetMinor > 0 ? Math.min(1, Math.max(0, current / goal.targetMinor)) : 0,
    remainingMinor: remaining,
    monthsLeft,
    monthlyEffortMinor: effort,
    reached: current >= goal.targetMinor,
  };
}

export { totalsByPeriod };
