import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from 'react';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Copy, Trash2 } from 'lucide-react';
import { addDays, addPeriods } from '@/domain/common/civil-date';
import { evaluateAmountExpression } from '@/domain/money/expression';
import { currencyExponent } from '@/domain/money/money';
import {
  buildLabelIndex,
  recentCategoryOrder,
  suggestLabels,
  type LabelSuggestion,
} from '@/domain/operations/operations';
import { applyRules } from '@/domain/rules/rules';
import { budgetOverview, crossedThreshold, type AlertLevel } from '@/domain/budgets/budgets';
import { totalsByPeriod } from '@/domain/analytics/totals';
import type { Operation, OperationKind } from '@/domain/model';
import {
  addOperation,
  addTransfer,
  createTag,
  getOperation,
  kvDelete,
  kvGet,
  kvSet,
  softDeleteOperations,
  today,
  updateOperation,
} from '@/data';
import { T, useT, type MessageId } from '@/i18n';
import { useFormat } from '@/i18n/format';
import {
  Button,
  CategoryIcon,
  Checkbox,
  Combobox,
  Dialog,
  Field,
  Segmented,
  Select,
  TextArea,
  TextInput,
  toast,
} from '@/ui';
import { useUi } from '../shared/ui-store';
import { deleteWithUndo, duplicateWithUndo, reportError } from '../shared/actions';
import { CategoryPicker } from '../shared/CategoryPicker';
import { useAppData } from '../shared/app-data';
import styles from './EntrySheet.module.css';
import {
  emptyForm,
  formFromOperation,
  insertAt,
  periodChoices,
  validateForm,
  type EntryError,
  type EntryForm,
} from './entry-form';

const DRAFT_KEY = 'entryDraft';
const OPERATORS = [
  { insert: '+', label: '+' },
  { insert: '-', label: '−' },
  { insert: 'x', label: '×' },
  { insert: '/', label: '÷' },
  { insert: '(', label: '(' },
  { insert: ')', label: ')' },
] as const;

const AMOUNT_ERRORS: Record<string, MessageId> = {
  empty: 'entry.error.amountEmpty',
  zero: 'entry.error.amountZero',
  divisionByZero: 'entry.error.divisionByZero',
  unbalancedParentheses: 'entry.error.parentheses',
  outOfRange: 'entry.error.outOfRange',
};

export function EntrySheet(): ReactNode {
  const request = useUi((s) => s.entry);
  const close = useUi((s) => s.closeEntry);
  const t = useT();
  return (
    <Dialog
      open={request !== null}
      onClose={close}
      size="sheet"
      closeLabel={t('common.close')}
      title={request?.editId ? <T id="entry.editTitle" /> : <T id="entry.newTitle" />}
    >
      {request ? <EntryFormView key={request.editId ?? 'new'} /> : null}
    </Dialog>
  );
}

function EntryFormView(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const request = useUi((s) => s.entry);
  const close = useUi((s) => s.closeEntry);
  const { settings, accounts, categories, categoriesById } = data;
  const editId = request?.editId;
  const startDay = settings.budgetMonthStartDay;
  const formId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<EntryForm>(() =>
    emptyForm(today(), data.defaultAccountId, startDay, request?.period),
  );
  const [errors, setErrors] = useState<EntryError[]>([]);
  const [saving, setSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [editing, setEditing] = useState<{ op: Operation; counterpart?: Operation } | null>(null);
  const [newTag, setNewTag] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const loaded = useRef(false);

  // Load the operation to edit, a template, or the saved draft.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (editId) {
        const op = await getOperation(editId);
        if (!op || cancelled) return;
        const counterpart = op.transferGroupId
          ? data.operations.find((o) => o.transferGroupId === op.transferGroupId && o.id !== op.id)
          : undefined;
        setEditing(counterpart ? { op, counterpart } : { op });
        setForm(formFromOperation(op, counterpart, (m) => fmt.amountInput(m)));
        setMoreOpen(op.note !== '' || op.tagIds.length > 0 || op.status === 'planned');
      } else if (request?.template) {
        const tpl = request.template;
        setForm((f) => ({
          ...f,
          kind: tpl.kind ?? f.kind,
          amountText: tpl.amountMinor ? fmt.amountInput(tpl.amountMinor) : f.amountText,
          label: tpl.label ?? f.label,
          categoryId: tpl.categoryId ?? f.categoryId,
          categoryTouched: Boolean(tpl.categoryId),
          accountId: tpl.accountId ?? f.accountId,
          note: tpl.note ?? f.note,
          tagIds: tpl.tagIds ?? f.tagIds,
        }));
      } else {
        const draft = await kvGet<{ form: EntryForm; savedAt: string }>(DRAFT_KEY);
        if (!cancelled && draft && (draft.form.amountText || draft.form.label)) {
          setForm({
            ...draft.form,
            accountId: accounts.some((a) => a.id === draft.form.accountId)
              ? draft.form.accountId
              : data.defaultAccountId,
          });
          setDraftRestored(true);
        }
      }
      loaded.current = true;
      if (!cancelled) amountRef.current?.focus();
    })();
    return () => {
      cancelled = true;
    };
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist a draft of new entries (kept if the tab closes).
  useEffect(() => {
    if (editId || !loaded.current) return;
    const timer = window.setTimeout(() => {
      if (form.amountText || form.label || form.note)
        void kvSet(DRAFT_KEY, { form, savedAt: new Date().toISOString() });
      else void kvDelete(DRAFT_KEY);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form, editId]);

  const update = (patch: Partial<EntryForm>): void => {
    setForm((f) => ({ ...f, ...patch }));
    if (errors.length > 0) setErrors([]);
  };

  // Label suggestions from the last 24 months.
  const labelIndex = useMemo(() => {
    const from = addPeriods(data.currentPeriod, -24);
    return buildLabelIndex(data.operations.filter((o) => o.period >= from));
  }, [data.operations, data.currentPeriod]);
  const suggestions = useMemo(
    () =>
      form.kind === 'transfer'
        ? []
        : suggestLabels(labelIndex, form.label).filter(
            (s) => s.kind === form.kind || s.categoryId === null,
          ),
    [labelIndex, form.label, form.kind],
  );

  const kindCategories = useMemo(() => {
    if (form.kind === 'transfer') return [];
    const ofKind = categories.filter((c) => c.kind === form.kind && !c.archived);
    return recentCategoryOrder(
      data.operations.filter((o) => o.kind === form.kind).slice(-400),
      ofKind,
    );
  }, [categories, data.operations, form.kind]);

  const evaluated = useMemo(
    () =>
      form.amountText.trim()
        ? evaluateAmountExpression(form.amountText, currencyExponent(settings.currency))
        : null,
    [form.amountText, settings.currency],
  );

  const pickSuggestion = (s: LabelSuggestion): void => {
    setForm((f) => ({
      ...f,
      label: s.label,
      categoryId:
        !f.categoryTouched && s.categoryId && categoriesById.get(s.categoryId)?.kind === f.kind
          ? s.categoryId
          : f.categoryId,
    }));
  };

  const applyLabelRules = (): void => {
    if (form.kind === 'transfer' || form.categoryTouched || !form.label) return;
    const kinds = new Map(categories.map((c) => [c.id, c.kind]));
    const patch = applyRules(
      { label: form.label, categoryId: form.categoryId, tagIds: [...form.tagIds], kind: form.kind },
      data.rules,
      kinds,
    );
    if (patch.categoryId || patch.tagIds || patch.label) {
      setForm((f) => ({
        ...f,
        categoryId: patch.categoryId ?? f.categoryId,
        tagIds: patch.tagIds ?? f.tagIds,
        label: patch.label ?? f.label,
      }));
      return;
    }
    const exact = suggestions.find(
      (s) => s.key === form.label.trim().toLocaleLowerCase('fr') || s.label === form.label,
    );
    if (exact?.categoryId && categoriesById.get(exact.categoryId)?.kind === form.kind) {
      setForm((f) => ({ ...f, categoryId: exact.categoryId }));
    }
  };

  const insertOperator = (op: string): void => {
    const el = amountRef.current;
    const start = el?.selectionStart ?? form.amountText.length;
    const end = el?.selectionEnd ?? form.amountText.length;
    const { text, caret } = insertAt(form.amountText, op, start, end);
    update({ amountText: text });
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const levelsFor = (ops: readonly Operation[], period: string): Map<string | null, AlertLevel> => {
    const overview = budgetOverview(
      {
        budgets: data.budgets,
        categories,
        totalsByPeriod: totalsByPeriod(ops),
        autoRenew: settings.budgetAutoRenew,
      },
      period,
    );
    const map = new Map<string | null, AlertLevel>();
    if (overview.global) map.set(null, overview.global.level);
    for (const l of overview.categories) map.set(l.categoryId, l.level);
    return map;
  };

  const submit = async (mode: 'close' | 'new'): Promise<void> => {
    const { errors: found, value } = validateForm(form, settings.currency, startDay);
    setErrors(found);
    if (!value) {
      const first = found[0];
      if (first?.field === 'amount') amountRef.current?.focus();
      else if (first) document.getElementById(`${formId}-${first.field}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const before = levelsFor(data.operations, value.period);
      let saved: Operation[] = [];
      const common = {
        date: value.date,
        period: value.date ? null : value.period,
        label: form.label,
        note: form.note,
        tagIds: [...form.tagIds],
        status: form.planned ? ('planned' as const) : ('cleared' as const),
      };
      if (editing) {
        const target =
          editing.op.kind === 'transfer' && editing.op.amountMinor > 0 && editing.counterpart
            ? editing.counterpart
            : editing.op;
        const patch = {
          ...common,
          period: value.date ? undefined : value.period,
          amountExpression: value.amountExpression,
          ...(form.kind === 'transfer'
            ? {
                amountMinor: -Math.abs(value.amountMinor),
                accountId: form.accountId,
                counterpartAccountId: form.toAccountId,
              }
            : {
                amountMinor: value.amountMinor,
                kind: form.kind,
                categoryId: form.categoryId,
                accountId: form.accountId,
              }),
        };
        const { period: patchPeriod, ...rest } = patch;
        saved = [
          await updateOperation(target.id, patchPeriod ? { ...rest, period: patchPeriod } : rest),
        ];
        toast(t('toast.updated'), { tone: 'success' });
      } else if (form.kind === 'transfer') {
        saved = await addTransfer({
          ...common,
          fromAccountId: form.accountId,
          toAccountId: form.toAccountId,
          amountMinor: value.amountMinor,
          currency: settings.currency,
        });
      } else {
        saved = [
          await addOperation({
            ...common,
            accountId: form.accountId,
            amountMinor: value.amountMinor,
            amountExpression: value.amountExpression,
            currency: settings.currency,
            kind: form.kind,
            categoryId: form.categoryId,
          }),
        ];
      }
      if (!editing) {
        await kvDelete(DRAFT_KEY);
        const ids = saved.map((o) => o.id);
        toast(t('toast.saved', { amount: fmt.money(saved[0]?.amountMinor ?? 0) }), {
          tone: 'success',
          action: { label: t('common.undo'), onAction: () => void softDeleteOperations(ids) },
        });
      }
      // Budget thresholds (80 % / 100 %)
      if (form.kind === 'expense' && !form.planned) {
        const after = levelsFor(
          [...data.operations.filter((o) => !saved.some((s) => s.id === o.id)), ...saved],
          value.period,
        );
        const parentId = form.categoryId
          ? (categoriesById.get(form.categoryId)?.parentId ?? null)
          : null;
        const keys: (string | null)[] = [form.categoryId, ...(parentId ? [parentId] : []), null];
        for (const key of keys) {
          const crossed = crossedThreshold(before.get(key) ?? 'none', after.get(key) ?? 'none');
          if (crossed) {
            const name = key ? (categoriesById.get(key)?.name ?? '') : t('budget.global');
            toast(t(crossed === 'over' ? 'budget.alert.over' : 'budget.alert.warn', { name }), {
              tone: 'warning',
            });
            break;
          }
        }
      }
      if (mode === 'new' && !editing) {
        setForm((f) => ({
          ...emptyForm(today(), f.accountId, startDay),
          kind: f.kind,
          date: f.date,
          undated: f.undated,
          period: f.period,
        }));
        setDraftRestored(false);
        amountRef.current?.focus();
      } else {
        close();
      }
    } catch (error) {
      reportError(error, t);
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (e: SubmitEvent<HTMLFormElement>): void => {
    e.preventDefault();
    void submit('close');
  };

  const errorOf = (field: EntryError['field']): EntryError | undefined =>
    errors.find((e) => e.field === field);
  const amountError = errorOf('amount');
  const amountErrorText = amountError
    ? t(AMOUNT_ERRORS[amountError.code] ?? 'entry.error.amountInvalid')
    : undefined;
  const todayDate = today();
  const activeAccounts = accounts.filter(
    (a) => !a.archived || a.id === form.accountId || a.id === form.toAccountId,
  );
  const isTransferEdit = editing?.op.kind === 'transfer';
  const kindOptions = [
    {
      value: 'expense' as const,
      label: t('kind.expense'),
      icon: <ArrowDownRight aria-hidden="true" />,
    },
    {
      value: 'income' as const,
      label: t('kind.income'),
      icon: <ArrowUpRight aria-hidden="true" />,
    },
    ...(accounts.length > 1
      ? [
          {
            value: 'transfer' as const,
            label: t('kind.transfer'),
            icon: <ArrowLeftRight aria-hidden="true" />,
          },
        ]
      : []),
  ].filter((o) =>
    editing ? (isTransferEdit ? o.value === 'transfer' : o.value !== 'transfer') : true,
  );

  return (
    // Ctrl/Cmd+Enter shortcut; the same action is available through the "Save and new" button.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      id={formId}
      className={styles.form}
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !editing) {
          e.preventDefault();
          void submit('new');
        }
      }}
      noValidate
    >
      {draftRestored ? (
        <p className={styles.notice} role="status">
          <T id="entry.draftRestored" />{' '}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setForm(emptyForm(today(), data.defaultAccountId, startDay));
              setDraftRestored(false);
              void kvDelete(DRAFT_KEY);
              amountRef.current?.focus();
            }}
          >
            <T id="entry.draftDiscard" />
          </button>
        </p>
      ) : null}

      <Segmented<OperationKind>
        name={`${formId}-kind`}
        legend={t('entry.kind')}
        options={kindOptions}
        value={form.kind}
        onChange={(kind) =>
          update({ kind, categoryId: null, categoryTouched: false, refund: false })
        }
      />

      <div className={styles.amountBlock}>
        <Field
          label={<T id="entry.amount" />}
          hint={<T id="entry.amountHint" />}
          error={amountErrorText}
        >
          <TextInput
            ref={amountRef}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('entry.amountPlaceholder')}
            className={styles.amountInput}
            value={form.amountText}
            onChange={(e) => update({ amountText: e.target.value })}
          />
        </Field>
        <div className={styles.operators} role="group" aria-label={t('entry.operators')}>
          {OPERATORS.map((o) => (
            <button
              key={o.insert}
              type="button"
              className={styles.operator}
              onClick={() => insertOperator(o.insert)}
              aria-label={t('entry.insertOperator', { op: o.label })}
              tabIndex={-1}
            >
              {o.label}
            </button>
          ))}
        </div>
        {evaluated?.ok && evaluated.isExpression ? (
          <p className={styles.preview} aria-live="polite">
            <T
              id="entry.result"
              values={{ amount: fmt.money(Math.abs(evaluated.minor), { sign: 'never' }) }}
            />
          </p>
        ) : null}
      </div>

      {form.kind !== 'transfer' ? (
        <Field label={<T id="entry.label" />} optionalLabel={<T id="common.optional" />}>
          <Combobox
            value={form.label}
            maxLength={120}
            enterKeyHint="next"
            listLabel={t('entry.suggestions')}
            onValueChange={(label) => update({ label })}
            onBlur={applyLabelRules}
            options={suggestions.map((s) => {
              const cat = s.categoryId ? categoriesById.get(s.categoryId) : undefined;
              return {
                id: s.key.replace(/\s/g, '_'),
                label: s.label,
                render: (
                  <>
                    {cat ? <CategoryIcon icon={cat.icon} color={cat.color} size="sm" /> : null}
                    <span className={styles.suggestionLabel}>{s.label}</span>
                    {cat ? <span className={styles.suggestionMeta}>{cat.name}</span> : null}
                  </>
                ),
              };
            })}
            onPick={(o) => {
              const s = suggestions.find((x) => x.key.replace(/\s/g, '_') === o.id);
              if (s) pickSuggestion(s);
            }}
          />
        </Field>
      ) : (
        <Field label={<T id="entry.label" />} optionalLabel={<T id="common.optional" />}>
          <TextInput
            value={form.label}
            maxLength={120}
            onChange={(e) => update({ label: e.target.value })}
          />
        </Field>
      )}

      {form.kind !== 'transfer' ? (
        <div id={`${formId}-category`} tabIndex={-1}>
          <CategoryPicker
            name={`${formId}-cat`}
            legend={<T id="entry.category" />}
            categories={kindCategories}
            byId={categoriesById}
            value={form.categoryId}
            onChange={(categoryId) => update({ categoryId, categoryTouched: true })}
            invalid={Boolean(errorOf('category'))}
            describedBy={errorOf('category') ? `${formId}-category-error` : undefined}
          />
          {errorOf('category') ? (
            <p id={`${formId}-category-error`} className={styles.error} role="alert">
              <T id="entry.error.categoryRequired" />
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.row}>
        {!form.undated ? (
          <Field
            label={<T id="entry.date" />}
            error={errorOf('date') ? <T id="entry.error.date" /> : undefined}
            id={`${formId}-date`}
          >
            <TextInput
              type="date"
              value={form.date}
              onChange={(e) => update({ date: e.target.value })}
              required
            />
          </Field>
        ) : (
          <Field
            label={<T id="entry.period" />}
            hint={<T id="entry.periodHint" />}
            id={`${formId}-period`}
          >
            <Select value={form.period} onChange={(e) => update({ period: e.target.value })}>
              {periodChoices(data.currentPeriod).map((p) => (
                <option key={p} value={p}>
                  {fmt.period(p)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className={styles.dateChips}>
          <Button
            size="sm"
            variant={!form.undated && form.date === todayDate ? 'primary' : 'secondary'}
            onClick={() => update({ undated: false, date: todayDate })}
          >
            <T id="entry.today" />
          </Button>
          <Button
            size="sm"
            variant={
              !form.undated && form.date === addDays(todayDate, -1) ? 'primary' : 'secondary'
            }
            onClick={() => update({ undated: false, date: addDays(todayDate, -1) })}
          >
            <T id="entry.yesterday" />
          </Button>
          <Button
            size="sm"
            variant={form.undated ? 'primary' : 'secondary'}
            aria-pressed={form.undated}
            onClick={() =>
              update({ undated: !form.undated, date: form.undated ? todayDate : form.date })
            }
          >
            <T id="entry.undated" />
          </Button>
        </div>
      </div>

      {accounts.length > 1 || form.kind === 'transfer' ? (
        <div className={styles.row}>
          <Field
            label={
              form.kind === 'transfer' ? <T id="entry.fromAccount" /> : <T id="entry.account" />
            }
          >
            <Select value={form.accountId} onChange={(e) => update({ accountId: e.target.value })}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          {form.kind === 'transfer' ? (
            <Field
              label={<T id="entry.toAccount" />}
              id={`${formId}-toAccount`}
              error={
                errorOf('toAccount') ? (
                  <T
                    id={
                      errorOf('toAccount')?.code === 'same'
                        ? 'entry.error.sameAccount'
                        : 'entry.error.toAccount'
                    }
                  />
                ) : undefined
              }
            >
              <Select
                value={form.toAccountId}
                onChange={(e) => update({ toAccountId: e.target.value })}
              >
                <option value="">{t('entry.chooseAccount')}</option>
                {activeAccounts
                  .filter((a) => a.id !== form.accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}
        </div>
      ) : null}

      <details
        className={styles.more}
        open={moreOpen}
        onToggle={(e) => setMoreOpen(e.currentTarget.open)}
      >
        <summary className={styles.summary}>
          <T id="entry.moreOptions" />
        </summary>
        <div className={styles.moreBody}>
          <Field label={<T id="entry.note" />} optionalLabel={<T id="common.optional" />}>
            <TextArea
              value={form.note}
              maxLength={1000}
              onChange={(e) => update({ note: e.target.value })}
            />
          </Field>
          <fieldset className={styles.tags}>
            <legend className={styles.tagsLegend}>
              <T id="entry.tags" />
            </legend>
            <div className={styles.tagList}>
              {data.tags.map((tag) => {
                const on = form.tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={styles.tag}
                    aria-pressed={on}
                    onClick={() =>
                      update({
                        tagIds: on
                          ? form.tagIds.filter((x) => x !== tag.id)
                          : [...form.tagIds, tag.id],
                      })
                    }
                  >
                    {tag.name}
                  </button>
                );
              })}
              <span className={styles.newTag}>
                <TextInput
                  aria-label={t('entry.newTag')}
                  placeholder={t('entry.newTag')}
                  value={newTag}
                  maxLength={40}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const name = newTag.trim();
                      if (!name) return;
                      const existing = data.tags.find(
                        (x) => x.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
                      );
                      void (async () => {
                        const tag = existing ?? (await createTag(name, '#2a78d6'));
                        update({ tagIds: [...new Set([...form.tagIds, tag.id])] });
                        setNewTag('');
                      })();
                    }
                  }}
                />
              </span>
            </div>
          </fieldset>
          {form.kind !== 'transfer' ? (
            <Checkbox
              label={<T id={form.kind === 'expense' ? 'entry.refund' : 'entry.incomeCorrection'} />}
              checked={form.refund}
              onChange={(refund) => update({ refund })}
            />
          ) : null}
          <Checkbox
            label={<T id="entry.planned" />}
            checked={form.planned}
            onChange={(planned) => update({ planned })}
          />
        </div>
      </details>

      <div className={styles.actions}>
        {editing ? (
          <>
            <Button
              variant="ghost"
              icon={<Trash2 />}
              onClick={() => {
                close();
                void deleteWithUndo([editing.op.id], t);
              }}
            >
              <T id="common.delete" />
            </Button>
            <Button
              variant="ghost"
              icon={<Copy />}
              onClick={() => {
                close();
                void duplicateWithUndo([editing.op.id], t);
              }}
            >
              <T id="common.duplicate" />
            </Button>
            <span className={styles.spacer} />
            <Button variant="primary" type="submit" loading={saving}>
              <T id="common.save" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => void submit('new')}
              disabled={saving}
              aria-keyshortcuts="Control+Enter"
            >
              <T id="entry.saveAndNew" />
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              <T id="common.save" />
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
