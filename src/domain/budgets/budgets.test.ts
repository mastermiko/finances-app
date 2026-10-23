import { describe, expect, it } from 'vitest';
import { account, budget, category, operation } from '@/test/factories';
import { totalsByPeriod } from '../analytics/totals';
import {
  alertLevel,
  budgetAlerts,
  budgetKey,
  budgetOverview,
  copyBudgets,
  crossedThreshold,
  effectiveBudget,
} from './budgets';

const acc = account();
const food = category({ name: 'Alimentation', order: 1 });
const coffee = category({ name: 'Café', parentId: food.id, order: 2 });
const transport = category({ name: 'Transport', order: 0 });

const spend = (period: string, categoryId: string, amount: number) =>
  operation({ accountId: acc.id, period, categoryId, amountMinor: -amount });

describe('effective budget', () => {
  const budgets = [
    budget({ period: '2026-08', amountMinor: 1000 }),
    budget({ period: '2026-10', amountMinor: 3000 }),
  ];
  it('uses the exact month, else the latest previous one when auto-renew is on', () => {
    expect(effectiveBudget(budgets, '2026-10', null, true)?.amountMinor).toBe(3000);
    expect(effectiveBudget(budgets, '2026-09', null, true)?.amountMinor).toBe(1000);
    expect(effectiveBudget(budgets, '2026-09', null, false)).toBeNull();
    expect(effectiveBudget(budgets, '2026-07', null, true)).toBeNull();
  });
});

describe('alert levels', () => {
  it('warns at 80 % and alerts at 100 %', () => {
    expect(alertLevel(79, 100)).toBe('ok');
    expect(alertLevel(80, 100)).toBe('warn');
    expect(alertLevel(100, 100)).toBe('over');
    expect(alertLevel(0, 0)).toBe('none');
    expect(alertLevel(1, 0)).toBe('over');
    expect(crossedThreshold('ok', 'warn')).toBe('warn');
    expect(crossedThreshold('warn', 'over')).toBe('over');
    expect(crossedThreshold('over', 'warn')).toBeNull();
    expect(crossedThreshold('none', 'ok')).toBeNull();
    expect(budgetKey(null)).toBe('__global__');
  });
});

describe('overview with carry-over', () => {
  const budgets = [
    budget({ period: '2026-08', categoryId: food.id, amountMinor: 20000, rollover: false }),
    budget({ period: '2026-09', categoryId: food.id, amountMinor: 20000, rollover: true }),
    budget({ period: '2026-10', categoryId: food.id, amountMinor: 20000, rollover: true }),
    budget({ period: '2026-10', categoryId: null, amountMinor: 50000, rollover: false }),
    budget({ period: '2026-10', categoryId: transport.id, amountMinor: 0, rollover: false }),
  ];
  const ops = [
    spend('2026-08', food.id, 25000), // over by 5 000, carried into September (September has rollover)
    spend('2026-09', food.id, 15000),
    spend('2026-10', coffee.id, 30000), // sub-category counts in its parent
  ];
  const input = {
    budgets,
    categories: [food, coffee, transport],
    totalsByPeriod: totalsByPeriod(ops),
    autoRenew: true,
  };

  it('remaining = envelope + carry − spent, sub-categories included', () => {
    const o = budgetOverview(input, '2026-10');
    const line = o.categories.find((l) => l.categoryId === food.id);
    // Aug: 20 000 − 25 000 = −5 000 → Sep: 20 000 − 5 000 − 15 000 = 0 → Oct: 20 000 + 0 − 30 000
    expect(line).toMatchObject({
      envelopeMinor: 20000,
      carryMinor: 0,
      spentMinor: 30000,
      remainingMinor: -10000,
      level: 'over',
    });
    expect(o.global).toMatchObject({
      availableMinor: 50000,
      spentMinor: 30000,
      remainingMinor: 20000,
      level: 'ok',
    });
    expect(o.totalEnvelopeMinor).toBe(20000);
    expect(o.categories.some((l) => l.categoryId === transport.id)).toBe(false);
  });

  it('marks inherited envelopes and produces sorted alerts', () => {
    const o = budgetOverview(input, '2026-11');
    expect(o.categories[0]).toMatchObject({
      inherited: true,
      sourcePeriod: '2026-10',
      carryMinor: -10000,
    });
    const alerts = budgetAlerts(budgetOverview(input, '2026-10'));
    expect(alerts.map((a) => a.categoryId)).toEqual([food.id]);
  });

  it('copies the envelopes of a month', () => {
    expect(copyBudgets(budgets, '2026-10', '2026-11')).toHaveLength(3);
    expect(copyBudgets(budgets, '2026-10', '2026-11')[0]).toMatchObject({ period: '2026-11' });
  });
});
