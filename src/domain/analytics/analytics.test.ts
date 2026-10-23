import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { account, category, operation } from '@/test/factories';
import {
  accountBalances,
  balanceSeries,
  categoryShares,
  closingBalance,
  compareExpenses,
  openingTotal,
  savingsRate,
  totalsByPeriod,
  totalsForPeriod,
} from './totals';
import {
  expenseMatrix,
  forecastPeriod,
  goalProgress,
  incomeExpenseSeries,
  lastPeriods,
  tagSeries,
  topLabels,
  yearPeriods,
} from './series';

const main = account({ openingBalanceMinor: 0 });
const savings = account({ name: 'Livret', type: 'savings', openingBalanceMinor: 100000 });
const food = category({ name: 'Alimentation', order: 1 });
const coffee = category({ name: 'Café', parentId: food.id, order: 2 });
const housing = category({ name: 'Logement', order: 0 });
const income = category({ name: 'Revenu', kind: 'income', order: 3 });

const ops = [
  operation({
    accountId: main.id,
    period: '2026-09',
    date: '2026-09-29',
    kind: 'income',
    categoryId: income.id,
    amountMinor: 124000,
  }),
  operation({
    accountId: main.id,
    period: '2026-09',
    date: '2026-09-30',
    categoryId: food.id,
    amountMinor: -3500,
  }),
  operation({
    accountId: main.id,
    period: '2026-10',
    date: null,
    categoryId: housing.id,
    amountMinor: -55000,
    label: 'Loyer',
  }),
  operation({
    accountId: main.id,
    period: '2026-10',
    categoryId: coffee.id,
    amountMinor: -250,
    label: 'Café',
  }),
  operation({
    accountId: main.id,
    period: '2026-10',
    categoryId: food.id,
    amountMinor: 1000,
    label: 'Remboursement',
  }),
  operation({
    accountId: main.id,
    period: '2026-10',
    categoryId: food.id,
    amountMinor: -9999,
    status: 'planned',
  }),
  operation({
    accountId: main.id,
    period: '2026-10',
    categoryId: food.id,
    amountMinor: -7777,
    deletedAt: '2026-10-02T00:00:00.000Z',
  }),
  // transfer of 200 € to the savings account
  operation({
    accountId: main.id,
    period: '2026-10',
    kind: 'transfer',
    amountMinor: -20000,
    transferGroupId: 'g',
  }),
  operation({
    accountId: savings.id,
    period: '2026-10',
    kind: 'transfer',
    amountMinor: 20000,
    transferGroupId: 'g',
  }),
];

describe('period totals', () => {
  const byPeriod = totalsByPeriod(ops);

  it('excludes transfers, planned and trashed operations; refunds reduce expenses', () => {
    const oct = byPeriod.get('2026-10');
    expect(oct?.expenseMinor).toBe(55000 + 250 - 1000);
    expect(oct?.incomeMinor).toBe(0);
    expect(oct?.resultMinor).toBe(-54250);
    expect(oct?.expenseByCategory.get(food.id)).toBe(-1000);
    expect(byPeriod.get('2026-09')?.resultMinor).toBe(120500);
  });

  it('includes planned operations on request and filters accounts', () => {
    expect(totalsByPeriod(ops, { includePlanned: true }).get('2026-10')?.expenseMinor).toBe(
      54250 + 9999,
    );
    expect(
      totalsByPeriod(ops, { accountIds: new Set([savings.id]) }).get('2026-10')?.resultMinor,
    ).toBe(0);
    expect(totalsForPeriod(ops, '2030-01').count).toBe(0);
  });

  it('computes category shares rolled up to the root, summing to 100 %', () => {
    const shares = categoryShares(byPeriod.get('2026-10') as never, [
      food,
      coffee,
      housing,
      income,
    ]);
    expect(shares.map((s) => [s.categoryId, s.amountMinor])).toEqual([
      [housing.id, 55000],
      [food.id, -750],
    ]);
    expect(shares[0]?.percent).toBe(100);
    expect(shares[1]?.percent).toBe(0);
  });

  it('savings rate and comparisons', () => {
    expect(savingsRate({ incomeMinor: 0, resultMinor: 10 })).toBeNull();
    expect(savingsRate({ incomeMinor: 1000, resultMinor: 250 })).toBe(0.25);
    const cmp = compareExpenses(byPeriod, '2026-10', null);
    expect(cmp).toEqual({
      period: '2026-10',
      currentMinor: 54250,
      previousMinor: 3500,
      average3Minor: 1167,
    });
    expect(compareExpenses(byPeriod, '2026-10', new Set([housing.id])).currentMinor).toBe(55000);
  });
});

describe('carried-over balance (F2 = G2 + ΣB)', () => {
  it('chains months, skips gaps and starts from the opening balances', () => {
    const series = balanceSeries(ops, [main], '2026-08', '2026-11');
    expect(series.map((p) => [p.period, p.openingMinor, p.closingMinor])).toEqual([
      ['2026-08', 0, 0],
      ['2026-09', 0, 120500],
      ['2026-10', 120500, 66250],
      ['2026-11', 66250, 66250],
    ]);
    expect(closingBalance(ops, [main], '2026-10')).toBe(66250);
    expect(openingTotal([main, savings])).toBe(100000);
  });

  it('per account, transfers count', () => {
    expect(closingBalance(ops, [main, savings], '2026-10', new Set([savings.id]))).toBe(120000);
    const balances = accountBalances(ops, [main, savings]);
    expect(balances.get(main.id)).toBe(46250);
    expect(balances.get(savings.id)).toBe(120000);
  });

  it('S(M) = S(M-1) + result(M) for random histories (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 1, max: 12 }),
            fc.integer({ min: -100000, max: 100000 }).filter((n) => n !== 0),
          ),
          { maxLength: 60 },
        ),
        fc.integer({ min: -50000, max: 50000 }),
        (items, opening) => {
          const acc = account({ openingBalanceMinor: opening });
          const list = items.map(([m, amount]) =>
            operation({
              accountId: acc.id,
              period: `2026-${String(m).padStart(2, '0')}`,
              amountMinor: amount,
              kind: amount > 0 ? 'income' : 'expense',
            }),
          );
          const series = balanceSeries(list, [acc], '2026-01', '2026-12');
          let running = opening;
          for (const point of series) {
            expect(point.openingMinor).toBe(running);
            running += list
              .filter((o) => o.period === point.period)
              .reduce((s, o) => s + o.amountMinor, 0);
            expect(point.closingMinor).toBe(running);
          }
        },
      ),
    );
  });
});

describe('series', () => {
  const byPeriod = totalsByPeriod(ops);

  it('builds the 12-month matrix by root category', () => {
    const matrix = expenseMatrix(byPeriod, [food, coffee, housing, income], ['2026-09', '2026-10']);
    expect(matrix.series.map((s) => [s.categoryId, s.values])).toEqual([
      [housing.id, [0, 55000]],
      [food.id, [3500, -750]],
    ]);
    expect(matrix.totals).toEqual([3500, 54250]);
  });

  it('income / expense series and period helpers', () => {
    const points = incomeExpenseSeries(byPeriod, ['2026-09', '2026-10']);
    expect(points[0]).toMatchObject({ incomeMinor: 124000, expenseMinor: 3500 });
    expect(points[1]?.savingsRate).toBeNull();
    expect(lastPeriods('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(yearPeriods(2026)).toHaveLength(12);
  });

  it('top labels and tag series', () => {
    const tagged = ops.map((o, i) => (i === 3 ? { ...o, tagIds: ['t'] } : o));
    expect(topLabels(ops, '2026-10', '2026-10', 2).map((l) => l.label)).toEqual([
      'Loyer',
      'Remboursement',
    ]);
    expect(tagSeries(tagged, 't', ['2026-09', '2026-10'])).toEqual([0, -250]);
  });

  it('forecasts the end of month from planned items and the 3-month variable average', () => {
    const history = [
      operation({ accountId: main.id, period: '2026-07', amountMinor: -30000 }),
      operation({ accountId: main.id, period: '2026-08', amountMinor: -30000 }),
      operation({ accountId: main.id, period: '2026-09', amountMinor: -30000 }),
      operation({ accountId: main.id, period: '2026-10', amountMinor: -10000 }),
      operation({
        accountId: main.id,
        period: '2026-10',
        amountMinor: -50000,
        status: 'planned',
        recurrenceId: 'r',
      }),
    ];
    const f = forecastPeriod(history, '2026-10', '2026-10-15', 1, 100000);
    expect(f).toMatchObject({
      averageVariableMinor: 30000,
      clearedResultMinor: -10000,
      plannedRemainingMinor: -50000,
      expectedVariableMinor: 20000,
    });
    expect(f.projectedClosingMinor).toBe(100000 - 10000 - 50000 - 20000);
    expect(forecastPeriod(history, '2026-10', '2026-11-02', 1, 0).expectedVariableMinor).toBe(0);
  });

  it('computes goal progress and the monthly effort', () => {
    const goal = {
      id: 'g',
      name: 'Ski',
      targetMinor: 160000,
      dueDate: '2027-02-01',
      accountId: savings.id,
      archived: false,
      createdAt: '',
      updatedAt: '',
    };
    const p = goalProgress(goal, new Map([[savings.id, 120000]]), '2026-10-23', [main, savings]);
    expect(p).toMatchObject({
      currentMinor: 120000,
      remainingMinor: 40000,
      monthsLeft: 4,
      monthlyEffortMinor: 10000,
      reached: false,
    });
    const all = goalProgress(
      { ...goal, accountId: null, dueDate: null },
      new Map([[savings.id, 200000]]),
      '2026-10-23',
      [main, savings],
    );
    expect(all).toMatchObject({ reached: true, ratio: 1, monthlyEffortMinor: null });
  });
});
