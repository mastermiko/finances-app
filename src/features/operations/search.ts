import { addPeriods, type Period } from '@/domain/common/civil-date';
import type { OperationFilter } from '@/domain/operations/operations';
import type { OperationKind, OperationStatus } from '@/domain/model';
import {
  compact,
  optBoolean,
  optEnum,
  optNonNegative,
  optPeriod,
  optString,
  type RawSearch,
} from '../shared/search-params';

export const PRESETS = ['month', 'previous', 'last3', 'year', 'all', 'custom'] as const;
export type Preset = (typeof PRESETS)[number];

const LIST_MAX = 4000;

/** Filters of the operations screen, stored in the URL (shareable, back button). */
export interface OperationsSearch {
  preset?: Preset | undefined;
  from?: Period | undefined;
  to?: Period | undefined;
  /** Comma-separated identifiers. */
  cat?: string | undefined;
  acc?: string | undefined;
  kind?: string | undefined;
  status?: string | undefined;
  tag?: string | undefined;
  /** Absolute amounts in minor units. */
  min?: number | undefined;
  max?: number | undefined;
  q?: string | undefined;
  undated?: boolean | undefined;
  sort?: 'asc' | 'desc' | undefined;
  /** Operation shown in the detail panel. */
  sel?: string | undefined;
}

export function validateOperationsSearch(search: RawSearch): OperationsSearch {
  return compact({
    preset: optEnum(search.preset, PRESETS),
    from: optPeriod(search.from),
    to: optPeriod(search.to),
    cat: optString(search.cat, LIST_MAX),
    acc: optString(search.acc, LIST_MAX),
    kind: optString(search.kind, LIST_MAX),
    status: optString(search.status, LIST_MAX),
    tag: optString(search.tag, LIST_MAX),
    min: optNonNegative(search.min),
    max: optNonNegative(search.max),
    q: optString(search.q, 120),
    undated: optBoolean(search.undated),
    sort: optEnum(search.sort, ['asc', 'desc'] as const),
    sel: optString(search.sel, 64),
  });
}

export function splitList(value: string | undefined): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

export function joinList(values: readonly string[]): string | undefined {
  return values.length > 0 ? values.join(',') : undefined;
}

/** Period range of a preset, relative to the current budget period. */
export function presetRange(
  preset: Preset,
  current: Period,
  search: OperationsSearch,
): { from?: Period; to?: Period } {
  switch (preset) {
    case 'month':
      return { from: search.from ?? current, to: search.from ?? current };
    case 'previous':
      return { from: addPeriods(current, -1), to: addPeriods(current, -1) };
    case 'last3':
      return { from: addPeriods(current, -2), to: current };
    case 'year':
      return { from: `${current.slice(0, 4)}-01`, to: `${current.slice(0, 4)}-12` };
    case 'all':
      return {};
    case 'custom':
      return {
        ...(search.from ? { from: search.from } : {}),
        ...(search.to ? { to: search.to } : {}),
      };
    default:
      return { from: current, to: current };
  }
}

/** Euros typed in the filter form are stored in minor units in the URL. */
export function toFilter(search: OperationsSearch, current: Period): OperationFilter {
  const preset = search.preset ?? (search.from || search.to ? 'custom' : 'month');
  const range = presetRange(preset, current, search);
  return {
    periodFrom: range.from,
    periodTo: range.to,
    categoryIds: splitList(search.cat),
    accountIds: splitList(search.acc),
    kinds: splitList(search.kind) as OperationKind[],
    statuses: splitList(search.status) as OperationStatus[],
    tagIds: splitList(search.tag),
    minAbs: search.min,
    maxAbs: search.max,
    text: search.q,
    undatedOnly: search.undated,
  };
}

export function activeFilterCount(search: OperationsSearch): number {
  return (
    splitList(search.cat).length +
    splitList(search.acc).length +
    splitList(search.kind).length +
    splitList(search.status).length +
    splitList(search.tag).length +
    (search.min !== undefined ? 1 : 0) +
    (search.max !== undefined ? 1 : 0) +
    (search.undated ? 1 : 0)
  );
}
