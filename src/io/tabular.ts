/**
 * Tabular projections of the data, shared by the CSV and XLSX exports.
 */
import { indexById } from '@/domain/categories/categories';
import { balanceSeries, totalsByPeriod } from '@/domain/analytics/totals';
import { minorToDecimalString, minorToNumber } from '@/domain/money/money';
import type { Account, Category, Operation, Tag } from '@/domain/model';
import { periodRange } from '@/domain/common/civil-date';
import type { XlsxCell, XlsxSheet } from './xlsx/xlsx-writer';

export interface TabularContext {
  readonly categories: readonly Category[];
  readonly accounts: readonly Account[];
  readonly tags: readonly Tag[];
  readonly currency: string;
}

/** Stable, documented column names of the CSV format (see docs/formats.md). */
export const CSV_COLUMNS = [
  'Date',
  'Période',
  'Montant',
  'Devise',
  'Type',
  'Catégorie',
  'Catégorie parente',
  'Libellé',
  'Compte',
  'Tags',
  'Note',
  'Statut',
  'Expression',
  'Identifiant',
  'Groupe virement',
  'Créé le',
  'Modifié le',
] as const;

export const KIND_LABELS = { expense: 'Dépense', income: 'Revenu', transfer: 'Virement' } as const;
export const STATUS_LABELS = { cleared: 'Validée', planned: 'Prévue' } as const;

interface OperationRecord {
  readonly date: string;
  readonly period: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly kind: string;
  readonly category: string;
  readonly parentCategory: string;
  readonly label: string;
  readonly account: string;
  readonly tags: string;
  readonly note: string;
  readonly status: string;
  readonly expression: string;
  readonly id: string;
  readonly transferGroup: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function operationRecords(
  ops: readonly Operation[],
  ctx: TabularContext,
): OperationRecord[] {
  const cats = indexById(ctx.categories);
  const accounts = indexById(ctx.accounts);
  const tags = indexById(ctx.tags);
  return ops.map((op) => {
    const cat = op.categoryId ? cats.get(op.categoryId) : undefined;
    const parent = cat?.parentId ? cats.get(cat.parentId) : undefined;
    return {
      date: op.date ?? '',
      period: op.period,
      amountMinor: op.amountMinor,
      currency: op.currency,
      kind: KIND_LABELS[op.kind],
      category: cat?.name ?? '',
      parentCategory: parent?.name ?? '',
      label: op.label,
      account: accounts.get(op.accountId)?.name ?? '',
      tags: op.tagIds
        .map((id) => tags.get(id)?.name)
        .filter((n): n is string => Boolean(n))
        .join(', '),
      note: op.note,
      status: STATUS_LABELS[op.status],
      expression: op.amountExpression ?? '',
      id: op.id,
      transferGroup: op.transferGroupId ?? '',
      createdAt: op.createdAt,
      updatedAt: op.updatedAt,
    };
  });
}

export function operationsSheet(
  ops: readonly Operation[],
  ctx: TabularContext,
  name = 'Opérations',
): XlsxSheet {
  const text = (v: string): XlsxCell => (v === '' ? null : { t: 'text', v });
  return {
    name,
    columns: CSV_COLUMNS.map((header) => ({
      header,
      width:
        header === 'Libellé' || header === 'Note'
          ? 32
          : header === 'Identifiant' || header === 'Groupe virement'
            ? 38
            : 14,
    })),
    rows: operationRecords(ops, ctx).map((r) => [
      r.date ? { t: 'date', v: r.date } : null,
      text(r.period),
      { t: 'money', v: minorToNumber(r.amountMinor, r.currency) },
      text(r.currency),
      text(r.kind),
      text(r.category),
      text(r.parentCategory),
      text(r.label),
      text(r.account),
      text(r.tags),
      text(r.note),
      text(r.status),
      text(r.expression),
      text(r.id),
      text(r.transferGroup),
      text(r.createdAt),
      text(r.updatedAt),
    ]),
  };
}

export function monthlySummarySheet(ops: readonly Operation[], ctx: TabularContext): XlsxSheet {
  const byPeriod = totalsByPeriod(ops);
  const periods = [...byPeriod.keys()].sort();
  const first = periods[0];
  const last = periods[periods.length - 1];
  const range = first && last ? periodRange(first, last) : [];
  const balances = first && last ? balanceSeries(ops, ctx.accounts, first, last) : [];
  const topCategories = ctx.categories
    .filter((c) => c.parentId === null && c.kind === 'expense')
    .sort((a, b) => a.order - b.order);
  const byId = indexById(ctx.categories);
  const rootOf = (id: string): string => {
    let c = byId.get(id);
    const seen = new Set<string>();
    while (c?.parentId && !seen.has(c.id)) {
      seen.add(c.id);
      c = byId.get(c.parentId);
    }
    return c?.id ?? id;
  };
  const money = (minor: number): XlsxCell => ({
    t: 'money',
    v: minorToNumber(minor, ctx.currency),
  });
  return {
    name: 'Récapitulatif mensuel',
    columns: [
      { header: 'Période', width: 10 },
      { header: 'Revenus' },
      { header: 'Dépenses' },
      { header: 'Résultat' },
      { header: 'Solde reporté' },
      { header: "Taux d'épargne" },
      ...topCategories.map((c) => ({ header: c.name })),
    ],
    rows: range.map((period, i) => {
      const t = byPeriod.get(period);
      const perRoot = new Map<string, number>();
      for (const [id, v] of t?.expenseByCategory ?? [])
        perRoot.set(rootOf(id), (perRoot.get(rootOf(id)) ?? 0) + v);
      const income = t?.incomeMinor ?? 0;
      const result = t?.resultMinor ?? 0;
      return [
        { t: 'text', v: period },
        money(income),
        money(t?.expenseMinor ?? 0),
        money(result),
        money(balances[i]?.closingMinor ?? 0),
        income > 0 ? { t: 'percent', v: result / income } : null,
        ...topCategories.map((c) => money(perRoot.get(c.id) ?? 0)),
      ];
    }),
  };
}

export function categoriesSheet(ops: readonly Operation[], ctx: TabularContext): XlsxSheet {
  const counts = new Map<string, number>();
  for (const op of ops)
    if (op.categoryId) counts.set(op.categoryId, (counts.get(op.categoryId) ?? 0) + 1);
  const byId = indexById(ctx.categories);
  return {
    name: 'Catégories',
    columns: [
      { header: 'Catégorie', width: 24 },
      { header: 'Catégorie parente', width: 24 },
      { header: 'Type' },
      { header: 'Couleur' },
      { header: 'Archivée' },
      { header: 'Opérations' },
    ],
    rows: [...ctx.categories]
      .sort((a, b) => a.order - b.order)
      .map((c) => [
        { t: 'text', v: c.name },
        c.parentId ? { t: 'text', v: byId.get(c.parentId)?.name ?? '' } : null,
        { t: 'text', v: c.kind === 'income' ? 'Revenu' : 'Dépense' },
        { t: 'text', v: c.color },
        { t: 'text', v: c.archived ? 'Oui' : 'Non' },
        { t: 'number', v: counts.get(c.id) ?? 0 },
      ]),
  };
}

/** Decimal with comma for French spreadsheets: -12,50 */
export function frenchDecimal(minor: number, currency: string): string {
  return minorToDecimalString(minor, currency).replace('.', ',');
}
