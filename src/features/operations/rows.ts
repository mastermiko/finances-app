import type { Operation } from '@/domain/model';
import {
  selectionTotals,
  sortOperations,
  type SelectionTotals,
  type SortDirection,
} from '@/domain/operations/operations';

export type ListRow =
  | {
      readonly type: 'month';
      readonly key: string;
      readonly period: string;
      readonly totals: SelectionTotals;
    }
  | {
      readonly type: 'day';
      readonly key: string;
      readonly period: string;
      readonly date: string | null;
      readonly totalMinor: number;
    }
  | {
      readonly type: 'op';
      readonly key: string;
      readonly op: Operation;
      readonly position: number;
    };

/**
 * Flattens operations into virtual-list rows: month header, then undated
 * charges first, then one group per day.
 */
export function buildRows(
  ops: readonly Operation[],
  direction: SortDirection,
  showMonthHeaders: boolean,
): ListRow[] {
  const sorted = sortOperations(ops, direction);
  const rows: ListRow[] = [];
  let position = 0;
  let i = 0;
  while (i < sorted.length) {
    const period = sorted[i]?.period ?? '';
    let j = i;
    while (j < sorted.length && sorted[j]?.period === period) j += 1;
    const monthOps = sorted.slice(i, j);
    if (showMonthHeaders)
      rows.push({ type: 'month', key: `m-${period}`, period, totals: selectionTotals(monthOps) });
    let k = 0;
    while (k < monthOps.length) {
      const date = monthOps[k]?.date ?? null;
      let l = k;
      while (l < monthOps.length && (monthOps[l]?.date ?? null) === date) l += 1;
      const dayOps = monthOps.slice(k, l);
      rows.push({
        type: 'day',
        key: `d-${period}-${date ?? 'none'}`,
        period,
        date,
        totalMinor: dayOps.reduce((s, o) => s + (o.kind === 'transfer' ? 0 : o.amountMinor), 0),
      });
      for (const op of dayOps) {
        position += 1;
        rows.push({ type: 'op', key: op.id, op, position });
      }
      k = l;
    }
    i = j;
  }
  return rows;
}
