import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { account, category, operation } from '@/test/factories';
import {
  buildLabelIndex,
  buildOperation,
  buildTransfer,
  compareOperations,
  createOperationPredicate,
  duplicateKey,
  duplicateOperation,
  expandCategoryIds,
  filterOperations,
  findDuplicates,
  isEffective,
  isLive,
  recentCategoryOrder,
  resolvePeriod,
  selectionTotals,
  signedAmount,
  sortOperations,
  suggestLabels,
} from './operations';

const acc = account();

describe('sorting', () => {
  it('puts undated charges first in each month, then chronological order', () => {
    const a = operation({ accountId: acc.id, date: '2026-10-05', label: 'a' });
    const b = operation({ accountId: acc.id, date: null, label: 'b' });
    const c = operation({ accountId: acc.id, date: '2026-10-01', label: 'c' });
    const d = operation({ accountId: acc.id, date: '2026-09-30', period: '2026-09', label: 'd' });
    expect(sortOperations([a, b, c, d]).map((o) => o.label)).toEqual(['d', 'b', 'c', 'a']);
    expect(sortOperations([a, b, c, d], 'desc').map((o) => o.label)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('is a stable total order (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            day: fc.integer({ min: 0, max: 28 }),
            month: fc.integer({ min: 1, max: 3 }),
          }),
          { maxLength: 30 },
        ),
        (specs) => {
          const ops = specs.map((s) =>
            operation({
              accountId: acc.id,
              period: `2026-0${s.month}`,
              date: s.day === 0 ? null : `2026-0${s.month}-${String(s.day).padStart(2, '0')}`,
            }),
          );
          const sorted = sortOperations(ops);
          for (let i = 1; i < sorted.length; i += 1) {
            expect(
              compareOperations(sorted[i - 1] as never, sorted[i] as never),
            ).toBeLessThanOrEqual(0);
          }
        },
      ),
    );
  });
});

describe('filters', () => {
  const food = category({ name: 'Alimentation' });
  const coffee = category({ name: 'Café', parentId: food.id });
  const transport = category({ name: 'Transport' });
  const ops = [
    operation({
      accountId: acc.id,
      categoryId: food.id,
      amountMinor: -1500,
      label: 'Courses',
      period: '2026-09',
      date: '2026-09-10',
    }),
    operation({
      accountId: acc.id,
      categoryId: coffee.id,
      amountMinor: -250,
      label: 'Café aéroport',
      note: 'voyage',
    }),
    operation({
      accountId: acc.id,
      categoryId: transport.id,
      amountMinor: -4000,
      label: 'Essence',
      date: null,
      status: 'planned',
    }),
    operation({
      accountId: 'other',
      kind: 'income',
      categoryId: food.id,
      amountMinor: 50000,
      label: 'Salaire',
    }),
    operation({
      accountId: acc.id,
      categoryId: food.id,
      label: 'Supprimée',
      deletedAt: '2026-10-01T00:00:00.000Z',
    }),
  ];

  it('expands sub-categories', () => {
    expect(expandCategoryIds([food.id], [food, coffee, transport])).toEqual(
      new Set([food.id, coffee.id]),
    );
  });

  it('combines period, category, account, kind, status, amount and text', () => {
    const all = [food, coffee, transport];
    expect(filterOperations(ops, {}, all)).toHaveLength(4);
    expect(filterOperations(ops, { periodFrom: '2026-10', periodTo: '2026-10' }, all)).toHaveLength(
      3,
    );
    expect(filterOperations(ops, { categoryIds: [food.id] }, all).map((o) => o.label)).toEqual([
      'Courses',
      'Café aéroport',
      'Salaire',
    ]);
    expect(filterOperations(ops, { accountIds: ['other'] }, all)).toHaveLength(1);
    expect(filterOperations(ops, { kinds: ['income'] }, all)).toHaveLength(1);
    expect(filterOperations(ops, { statuses: ['planned'] }, all)).toHaveLength(1);
    expect(filterOperations(ops, { minAbs: 1000, maxAbs: 5000 }, all).map((o) => o.label)).toEqual([
      'Courses',
      'Essence',
    ]);
    expect(filterOperations(ops, { text: 'CAFE' }, all)).toHaveLength(1);
    expect(filterOperations(ops, { text: 'voyage' }, all)).toHaveLength(1);
    expect(filterOperations(ops, { undatedOnly: true }, all)).toHaveLength(1);
    expect(filterOperations(ops, { tagIds: ['x'] }, all)).toHaveLength(0);
  });

  it('computes selection totals', () => {
    const t = selectionTotals(ops.slice(0, 4));
    expect(t).toEqual({ count: 4, totalMinor: 44250, incomeMinor: 50000, expenseMinor: 5750 });
  });

  it('live / effective helpers', () => {
    expect(isLive(ops[4] as never)).toBe(false);
    expect(isEffective(ops[2] as never)).toBe(false);
    expect(isEffective(ops[0] as never)).toBe(true);
    expect(createOperationPredicate({})(ops[4] as never)).toBe(false);
  });
});

describe('duplicates', () => {
  it('matches same date, amount, normalised label and account, never removes', () => {
    const existing = [operation({ accountId: acc.id, label: 'Café', amountMinor: -250 })];
    const incoming = [
      operation({ accountId: acc.id, label: 'café ', amountMinor: -250 }),
      operation({ accountId: acc.id, label: 'Café', amountMinor: -300 }),
      operation({ accountId: 'x', label: 'Café', amountMinor: -250 }),
    ];
    const dups = findDuplicates(incoming, existing);
    expect(dups).toEqual([{ incomingIndex: 0, existingIds: [existing[0]?.id] }]);
    expect(
      duplicateKey({ date: null, period: '2026-10', amountMinor: 1, label: 'A', accountId: 'b' }),
    ).toBe('P2026-10|1|a|b');
  });

  it('ignores trashed operations', () => {
    const existing = [operation({ accountId: acc.id, deletedAt: '2026-10-01T00:00:00.000Z' })];
    expect(findDuplicates([operation({ accountId: acc.id })], existing)).toEqual([]);
  });
});

describe('construction', () => {
  it('derives the period from the date and the month start day', () => {
    const op = buildOperation(
      {
        accountId: acc.id,
        date: '2025-10-30',
        amountMinor: 12104,
        currency: 'EUR',
        kind: 'income',
        categoryId: 'c',
        label: '  Pension  ',
      },
      26,
      '2026-10-23T00:00:00.000Z',
    );
    expect(op.period).toBe('2025-11');
    expect(op.label).toBe('Pension');
    expect(op.status).toBe('cleared');
    expect(resolvePeriod(null, '2026-01', 1)).toBe('2026-01');
    expect(() => resolvePeriod(null, null, 1)).toThrow(RangeError);
  });

  it('signs amounts from the kind, refunds invert', () => {
    expect(signedAmount(500, 'expense')).toBe(-500);
    expect(signedAmount(-500, 'income')).toBe(500);
    expect(signedAmount(500, 'expense', true)).toBe(500);
    expect(signedAmount(500, 'income', true)).toBe(-500);
  });

  it('builds a transfer as two linked operations summing to zero', () => {
    const [out, inn] = buildTransfer(
      {
        fromAccountId: 'a',
        toAccountId: 'b',
        amountMinor: -2000,
        currency: 'EUR',
        date: '2026-10-01',
        label: 'Recharge Izly',
      },
      1,
      '2026-10-23T00:00:00.000Z',
    );
    expect(out.amountMinor + inn.amountMinor).toBe(0);
    expect(out.transferGroupId).toBe(inn.transferGroupId);
    expect(out.categoryId).toBeNull();
    expect(() =>
      buildTransfer(
        {
          fromAccountId: 'a',
          toAccountId: 'a',
          amountMinor: 1,
          currency: 'EUR',
          date: null,
          period: '2026-10',
          label: '',
        },
        1,
        '',
      ),
    ).toThrow(RangeError);
  });

  it('duplicates with a new id and no import / recurrence links', () => {
    const op = operation({
      accountId: acc.id,
      importBatchId: 'x',
      recurrenceId: 'y',
      status: 'planned',
    });
    const copy = duplicateOperation(op, '2026-10-24T00:00:00.000Z');
    expect(copy.id).not.toBe(op.id);
    expect(copy).toMatchObject({
      importBatchId: null,
      recurrenceId: null,
      status: 'cleared',
      createdAt: '2026-10-24T00:00:00.000Z',
    });
  });
});

describe('label autocomplete', () => {
  const food = category({ name: 'Alimentation' });
  const leisure = category({ name: 'Loisirs' });
  const ops = [
    operation({ accountId: acc.id, label: 'Café', categoryId: food.id, date: '2026-10-01' }),
    operation({ accountId: acc.id, label: 'café', categoryId: food.id, date: '2026-10-02' }),
    operation({ accountId: acc.id, label: 'Café', categoryId: leisure.id, date: '2026-10-03' }),
    operation({ accountId: acc.id, label: 'Carte BDE', categoryId: leisure.id }),
    operation({ accountId: acc.id, label: 'Le petit café', categoryId: food.id }),
    operation({ accountId: acc.id, label: '', categoryId: food.id }),
    operation({ accountId: acc.id, kind: 'transfer', label: 'Virement' }),
  ];
  const index = buildLabelIndex(ops);

  it('groups by normalised label with the habitual category and the latest spelling', () => {
    const cafe = index.find((s) => s.key === 'cafe');
    expect(cafe).toMatchObject({ count: 3, categoryId: food.id, label: 'Café' });
    expect(index.some((s) => s.key === 'virement')).toBe(false);
  });

  it('ranks prefix matches before word and substring matches', () => {
    expect(suggestLabels(index, 'ca').map((s) => s.label)).toEqual([
      'Café',
      'Carte BDE',
      'Le petit café',
    ]);
    expect(suggestLabels(index, 'petit').map((s) => s.label)).toEqual(['Le petit café']);
    expect(suggestLabels(index, '')).toEqual([]);
  });

  it('orders categories by recent use', () => {
    const order = recentCategoryOrder(ops, [
      leisure,
      food,
      category({ name: 'Archivée', archived: true }),
    ]);
    expect(order.map((c) => c.name)).toEqual(['Alimentation', 'Loisirs']);
  });
});
