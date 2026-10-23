/**
 * Entry form model: pure helpers to build, validate and convert the form state.
 * Kept outside the component so it can be unit tested without a DOM.
 */
import { addPeriods, isCivilDate, isPeriod, periodOfDate } from '@/domain/common/civil-date';
import { evaluateAmountExpression, type ExpressionErrorCode } from '@/domain/money/expression';
import { currencyExponent } from '@/domain/money/money';
import type { Operation, OperationKind } from '@/domain/model';
import { signedAmount } from '@/domain/operations/operations';

export interface EntryForm {
  readonly kind: OperationKind;
  readonly amountText: string;
  readonly label: string;
  readonly categoryId: string | null;
  readonly categoryTouched: boolean;
  readonly date: string;
  readonly undated: boolean;
  readonly period: string;
  readonly accountId: string;
  readonly toAccountId: string;
  readonly note: string;
  readonly tagIds: readonly string[];
  readonly refund: boolean;
  readonly planned: boolean;
}

export function emptyForm(
  today: string,
  accountId: string,
  startDay: number,
  period?: string,
): EntryForm {
  const todayPeriod = periodOfDate(today, startDay);
  const usePeriod = period && period !== todayPeriod ? period : null;
  return {
    kind: 'expense',
    amountText: '',
    label: '',
    categoryId: null,
    categoryTouched: false,
    // Entering into another month: undated by default in that month.
    date: usePeriod ? '' : today,
    undated: Boolean(usePeriod),
    period: usePeriod ?? todayPeriod,
    accountId,
    toAccountId: '',
    note: '',
    tagIds: [],
    refund: false,
    planned: false,
  };
}

export function formFromOperation(
  op: Operation,
  counterpart: Operation | undefined,
  formatAbs: (minor: number) => string,
): EntryForm {
  const expression = op.amountExpression ? op.amountExpression.replace(/^=/, '') : null;
  const isTransfer = op.kind === 'transfer';
  const outgoing = !isTransfer || op.amountMinor < 0;
  return {
    kind: op.kind,
    amountText: expression ?? formatAbs(op.amountMinor),
    label: op.label,
    categoryId: op.categoryId,
    categoryTouched: true,
    date: op.date ?? '',
    undated: op.date === null,
    period: op.period,
    accountId: isTransfer && !outgoing && counterpart ? counterpart.accountId : op.accountId,
    toAccountId: isTransfer ? (outgoing ? (counterpart?.accountId ?? '') : op.accountId) : '',
    note: op.note,
    tagIds: op.tagIds,
    refund:
      (op.kind === 'expense' && op.amountMinor > 0) || (op.kind === 'income' && op.amountMinor < 0),
    planned: op.status === 'planned',
  };
}

export type EntryError =
  | { readonly field: 'amount'; readonly code: ExpressionErrorCode | 'zero' }
  | { readonly field: 'category'; readonly code: 'required' }
  | { readonly field: 'date'; readonly code: 'invalid' }
  | { readonly field: 'period'; readonly code: 'invalid' }
  | { readonly field: 'toAccount'; readonly code: 'required' | 'same' };

export interface ValidEntry {
  readonly amountMinor: number; // signed (absolute for transfers)
  readonly amountExpression: string | null;
  readonly date: string | null;
  readonly period: string;
}

export function validateForm(
  form: EntryForm,
  currency: string,
  startDay: number,
): { errors: EntryError[]; value: ValidEntry | null } {
  const errors: EntryError[] = [];
  const evaluated = evaluateAmountExpression(form.amountText, currencyExponent(currency));
  let amountMinor = 0;
  if (!evaluated.ok) errors.push({ field: 'amount', code: evaluated.error.code });
  else if (evaluated.minor === 0) errors.push({ field: 'amount', code: 'zero' });
  else {
    const abs = Math.abs(evaluated.minor);
    amountMinor = form.kind === 'transfer' ? abs : signedAmount(abs, form.kind, form.refund);
  }
  if (form.kind !== 'transfer' && !form.categoryId)
    errors.push({ field: 'category', code: 'required' });
  if (form.kind === 'transfer') {
    if (!form.toAccountId) errors.push({ field: 'toAccount', code: 'required' });
    else if (form.toAccountId === form.accountId) errors.push({ field: 'toAccount', code: 'same' });
  }
  let date: string | null = null;
  let period = form.period;
  if (form.undated) {
    if (!isPeriod(form.period)) errors.push({ field: 'period', code: 'invalid' });
  } else if (!isCivilDate(form.date)) {
    errors.push({ field: 'date', code: 'invalid' });
  } else {
    date = form.date;
    period = periodOfDate(form.date, startDay);
  }
  if (errors.length > 0) return { errors, value: null };
  return {
    errors,
    value: {
      amountMinor,
      amountExpression: evaluated.ok && evaluated.isExpression ? evaluated.normalized : null,
      date,
      period,
    },
  };
}

/** Months offered for an undated charge: 6 before to 3 after the reference. */
export function periodChoices(reference: string): string[] {
  return Array.from({ length: 10 }, (_, i) => addPeriods(reference, i - 6));
}

/** Inserts text at the caret of the amount field. */
export function insertAt(
  text: string,
  insert: string,
  start: number,
  end: number,
): { text: string; caret: number } {
  const next = text.slice(0, start) + insert + text.slice(end);
  return { text: next, caret: start + insert.length };
}
