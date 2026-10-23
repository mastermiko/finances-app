/**
 * Derived figures. Nothing here is ever stored: balances, totals, shares and
 * carry-overs are recomputed from operations (single source of truth).
 *
 *   Result(M)  = Σ amounts of month M, transfers excluded
 *   S(M)       = S(M-1) + Result(M),  S(0) = Σ opening balances
 *   Share(c,M) = expenses of c / total expenses of M (absolute values)
 */
import { addPeriods, periodRange, type Period } from '../common/civil-date';
import { indexById, rootCategoryId } from '../categories/categories';
import { percentagesLargestRemainder } from '../money/money';
import type { Account, Category, Operation } from '../model/types';
import { isEffective } from '../operations/operations';

export interface PeriodTotals {
  readonly period: Period;
  /** Σ income-kind amounts (signed: a negative income correction reduces it). */
  readonly incomeMinor: number;
  /** Positive number: −Σ expense-kind amounts (refunds reduce it). */
  readonly expenseMinor: number;
  /** incomeMinor − expenseMinor = Σ non-transfer amounts. */
  readonly resultMinor: number;
  /** Expenses per category id (positive numbers). */
  readonly expenseByCategory: ReadonlyMap<string, number>;
  /** Income per category id. */
  readonly incomeByCategory: ReadonlyMap<string, number>;
  readonly count: number;
}

function emptyTotals(period: Period): {
  period: Period;
  incomeMinor: number;
  expenseMinor: number;
  resultMinor: number;
  expenseByCategory: Map<string, number>;
  incomeByCategory: Map<string, number>;
  count: number;
} {
  return {
    period,
    incomeMinor: 0,
    expenseMinor: 0,
    resultMinor: 0,
    expenseByCategory: new Map(),
    incomeByCategory: new Map(),
    count: 0,
  };
}

export interface TotalsOptions {
  /** Include planned operations (forecast). Default false. */
  readonly includePlanned?: boolean;
  /** Restrict to these accounts. */
  readonly accountIds?: ReadonlySet<string>;
}

/** Totals per period for every period present in `ops`. */
export function totalsByPeriod(
  ops: readonly Operation[],
  options: TotalsOptions = {},
): Map<Period, PeriodTotals> {
  const out = new Map<Period, ReturnType<typeof emptyTotals>>();
  for (const op of ops) {
    if (op.deletedAt !== null) continue;
    if (op.status === 'planned' && !options.includePlanned) continue;
    if (options.accountIds && !options.accountIds.has(op.accountId)) continue;
    let t = out.get(op.period);
    if (!t) {
      t = emptyTotals(op.period);
      out.set(op.period, t);
    }
    t.count += 1;
    if (op.kind === 'transfer') continue;
    t.resultMinor += op.amountMinor;
    const cat = op.categoryId ?? '';
    if (op.kind === 'income') {
      t.incomeMinor += op.amountMinor;
      t.incomeByCategory.set(cat, (t.incomeByCategory.get(cat) ?? 0) + op.amountMinor);
    } else {
      t.expenseMinor -= op.amountMinor;
      t.expenseByCategory.set(cat, (t.expenseByCategory.get(cat) ?? 0) - op.amountMinor);
    }
  }
  return out;
}

export function totalsForPeriod(
  ops: readonly Operation[],
  period: Period,
  options: TotalsOptions = {},
): PeriodTotals {
  return (
    totalsByPeriod(
      ops.filter((o) => o.period === period),
      options,
    ).get(period) ?? emptyTotals(period)
  );
}

export function openingTotal(
  accounts: readonly Account[],
  accountIds?: ReadonlySet<string>,
): number {
  return accounts
    .filter((a) => !accountIds || accountIds.has(a.id))
    .reduce((acc, a) => acc + a.openingBalanceMinor, 0);
}

export interface BalancePoint {
  readonly period: Period;
  readonly openingMinor: number; // S(M-1): "Budget initial" (G2)
  readonly resultMinor: number;
  readonly closingMinor: number; // S(M):   "Budget restant" (F2)
}

/**
 * Carried-over balance per period (spreadsheet F2 = G2 + ΣB, without manual copy).
 * Months without operations carry the balance unchanged. Transfers are excluded
 * from the result; when restricted to some accounts, transfers count (money moves
 * between the selected and the other accounts).
 */
export function balanceSeries(
  ops: readonly Operation[],
  accounts: readonly Account[],
  from: Period,
  to: Period,
  accountIds?: ReadonlySet<string>,
): BalancePoint[] {
  let running = openingTotal(accounts, accountIds);
  const perPeriod = new Map<Period, number>();
  for (const op of ops) {
    if (!isEffective(op)) continue;
    if (accountIds) {
      if (!accountIds.has(op.accountId)) continue;
    } else if (op.kind === 'transfer') continue;
    perPeriod.set(op.period, (perPeriod.get(op.period) ?? 0) + op.amountMinor);
  }
  // Everything before `from` is folded into the opening balance.
  for (const [period, sum] of perPeriod) if (period < from) running += sum;
  const out: BalancePoint[] = [];
  for (const period of periodRange(from, to)) {
    const result = perPeriod.get(period) ?? 0;
    out.push({
      period,
      openingMinor: running,
      resultMinor: result,
      closingMinor: running + result,
    });
    running += result;
  }
  return out;
}

/** S(M) for a single period. */
export function closingBalance(
  ops: readonly Operation[],
  accounts: readonly Account[],
  period: Period,
  accountIds?: ReadonlySet<string>,
): number {
  return balanceSeries(ops, accounts, period, period, accountIds)[0]?.closingMinor ?? 0;
}

/** Current balance of each account (all effective operations, transfers included). */
export function accountBalances(
  ops: readonly Operation[],
  accounts: readonly Account[],
): Map<string, number> {
  const out = new Map(accounts.map((a) => [a.id, a.openingBalanceMinor]));
  for (const op of ops) {
    if (!isEffective(op)) continue;
    out.set(op.accountId, (out.get(op.accountId) ?? 0) + op.amountMinor);
  }
  return out;
}

export interface CategoryShare {
  readonly categoryId: string;
  readonly amountMinor: number;
  /** Percentage of the month's expenses; the shares of a month add up to exactly 100. */
  readonly percent: number;
}

/**
 * Expense share per category for a period. Sub-categories are rolled up to their
 * root when `rollUp` is true. Categories with a non-positive net (refunds only) get 0 %.
 */
export function categoryShares(
  totals: PeriodTotals,
  categories: readonly Category[],
  rollUp = true,
): CategoryShare[] {
  const byId = indexById(categories);
  const amounts = new Map<string, number>();
  for (const [id, amount] of totals.expenseByCategory) {
    const key = rollUp && id !== '' ? rootCategoryId(id, byId) : id;
    amounts.set(key, (amounts.get(key) ?? 0) + amount);
  }
  const entries = [...amounts.entries()].sort((a, b) => b[1] - a[1]);
  const percents = percentagesLargestRemainder(entries.map(([, v]) => v));
  return entries.map(([categoryId, amountMinor], i) => ({
    categoryId,
    amountMinor,
    percent: percents[i] ?? 0,
  }));
}

/** Savings rate = result / income, null when there is no income. */
export function savingsRate(
  totals: Pick<PeriodTotals, 'incomeMinor' | 'resultMinor'>,
): number | null {
  if (totals.incomeMinor <= 0) return null;
  return totals.resultMinor / totals.incomeMinor;
}

export interface MonthComparison {
  readonly period: Period;
  readonly currentMinor: number;
  readonly previousMinor: number;
  readonly average3Minor: number;
}

/** Expenses of a category (or all when null) in M vs M-1 vs the average of M-3..M-1. */
export function compareExpenses(
  byPeriod: ReadonlyMap<Period, PeriodTotals>,
  period: Period,
  categoryIds: ReadonlySet<string> | null,
): MonthComparison {
  const expensesOf = (p: Period): number => {
    const t = byPeriod.get(p);
    if (!t) return 0;
    if (categoryIds === null) return t.expenseMinor;
    let sum = 0;
    for (const [id, v] of t.expenseByCategory) if (categoryIds.has(id)) sum += v;
    return sum;
  };
  const prev = [1, 2, 3].map((i) => expensesOf(addPeriods(period, -i)));
  return {
    period,
    currentMinor: expensesOf(period),
    previousMinor: prev[0] ?? 0,
    average3Minor: Math.round(prev.reduce((a, b) => a + b, 0) / 3),
  };
}
