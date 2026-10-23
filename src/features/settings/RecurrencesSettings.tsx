import { useState, type ReactNode } from 'react';
import { Pause, Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { evaluateAmountExpression } from '@/domain/money/expression';
import { currencyExponent } from '@/domain/money/money';
import { formatRRule, parseRRule, type Frequency } from '@/domain/recurrences/recurrences';
import { signedAmount } from '@/domain/operations/operations';
import type { OperationKind, Recurrence } from '@/domain/model';
import { deleteRecurrence, runRecurrences, saveRecurrence, today } from '@/data';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import {
  Amount,
  Badge,
  Button,
  Checkbox,
  Dialog,
  Field,
  IconButton,
  Section,
  Segmented,
  Select,
  Switch,
  TextInput,
  toast,
} from '@/ui';
import { reportError } from '../shared/actions';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useAppData } from '../shared/app-data';
import styles from './settings.module.css';

interface Draft {
  id?: string;
  name: string;
  kind: OperationKind;
  amount: string;
  categoryId: string;
  accountId: string;
  toAccountId: string;
  label: string;
  freq: Frequency;
  interval: string;
  dtstart: string;
  end: 'never' | 'until' | 'count';
  until: string;
  count: string;
  undated: boolean;
  autoConfirm: boolean;
  active: boolean;
}

export default function RecurrencesSettings(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Recurrence | null>(null);
  const [deletePlanned, setDeletePlanned] = useState(true);

  const fromRecurrence = (r: Recurrence): Draft => {
    const parsed = parseRRule(r.rule);
    const rule = parsed.ok ? parsed.rule : null;
    return {
      id: r.id,
      name: r.name,
      kind: r.template.kind,
      amount: fmt.amountInput(r.template.amountMinor),
      categoryId: r.template.categoryId ?? '',
      accountId: r.template.accountId,
      toAccountId: r.template.toAccountId ?? '',
      label: r.template.label,
      freq: rule?.freq ?? 'MONTHLY',
      interval: String(rule?.interval ?? 1),
      dtstart: r.dtstart,
      end: rule?.until ? 'until' : rule?.count ? 'count' : 'never',
      until: rule?.until ?? '',
      count: rule?.count ? String(rule.count) : '',
      undated: r.undated,
      autoConfirm: r.autoConfirm,
      active: r.active,
    };
  };

  const describe = (r: Recurrence): string => {
    const parsed = parseRRule(r.rule);
    if (!parsed.ok) return r.rule;
    return t(`recurrence.every.${parsed.rule.freq}`, { n: parsed.rule.interval });
  };

  return (
    <div className={styles.stack}>
      <p className={styles.text}>
        <T id="recurrences.intro" />
      </p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          icon={<Plus />}
          onClick={() =>
            setDraft({
              name: '',
              kind: 'expense',
              amount: '',
              categoryId: '',
              accountId: data.defaultAccountId,
              toAccountId: '',
              label: '',
              freq: 'MONTHLY',
              interval: '1',
              dtstart: today(),
              end: 'never',
              until: '',
              count: '',
              undated: false,
              autoConfirm: false,
              active: true,
            })
          }
        >
          <T id="recurrences.add" />
        </Button>
        <Button
          icon={<RefreshCw />}
          onClick={() =>
            void runRecurrences().then((n) =>
              toast(t('recurrences.generated', { count: n }), { tone: 'success' }),
            )
          }
        >
          <T id="recurrences.generate" />
        </Button>
      </div>
      <Section panel>
        {data.recurrences.length === 0 ? (
          <p className={styles.muted}>
            <T id="recurrences.empty" />
          </p>
        ) : (
          <ul className={styles.list} role="list">
            {data.recurrences.map((r) => (
              <li key={r.id} className={styles.item}>
                <span className={styles.itemMain}>
                  <span className={styles.itemTitle}>{r.name}</span>
                  <span className={styles.itemMeta}>
                    {describe(r)}
                    {r.undated ? ` · ${t('recurrences.undated')}` : ''}
                    {' · '}
                    {r.nextDate
                      ? t('recurrences.next', { date: fmt.date(r.nextDate) })
                      : t('recurrences.finished')}
                  </span>
                </span>
                {!r.active ? (
                  <Badge>
                    <T id="recurrences.paused" />
                  </Badge>
                ) : null}
                {r.autoConfirm ? (
                  <Badge tone="accent">
                    <T id="recurrences.auto" />
                  </Badge>
                ) : null}
                <Amount
                  minor={r.template.amountMinor}
                  formatted={fmt.money(r.template.amountMinor)}
                  kind={r.template.kind}
                />
                <span className={styles.actions}>
                  <IconButton
                    label={t(r.active ? 'recurrences.pause' : 'recurrences.resume', {
                      name: r.name,
                    })}
                    icon={r.active ? <Pause /> : <Play />}
                    onClick={() => void saveRecurrence({ ...r, active: !r.active })}
                  />
                  <IconButton
                    label={t('common.editItem', { name: r.name })}
                    icon={<Pencil />}
                    onClick={() => setDraft(fromRecurrence(r))}
                  />
                  <IconButton
                    label={t('common.deleteItem', { name: r.name })}
                    icon={<Trash2 />}
                    onClick={() => setDeleting(r)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {draft ? <RecurrenceDialog initial={draft} onClose={() => setDraft(null)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={<T id="recurrences.deleteTitle" values={{ name: deleting?.name ?? '' }} />}
        confirmLabel={<T id="common.delete" />}
        onConfirm={() => {
          if (deleting)
            void deleteRecurrence(deleting.id, deletePlanned).then(() => setDeleting(null));
        }}
      >
        <Checkbox
          label={<T id="recurrences.deletePlanned" />}
          checked={deletePlanned}
          onChange={setDeletePlanned}
        />
      </ConfirmDialog>
    </div>
  );
}

function RecurrenceDialog({
  initial,
  onClose,
}: {
  initial: Draft;
  onClose: () => void;
}): ReactNode {
  const t = useT();
  const data = useAppData();
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const set = (patch: Partial<Draft>): void => setD((x) => ({ ...x, ...patch }));

  const save = async (): Promise<void> => {
    const amount = evaluateAmountExpression(d.amount, currencyExponent(data.settings.currency));
    const interval = Number(d.interval);
    const count = Number(d.count);
    const next = {
      name: !d.name.trim() && !d.label.trim(),
      amount: !amount.ok || amount.minor === 0,
      category: d.kind !== 'transfer' && !d.categoryId,
      toAccount: d.kind === 'transfer' && (!d.toAccountId || d.toAccountId === d.accountId),
      interval: !Number.isInteger(interval) || interval < 1 || interval > 366,
      dtstart: !d.dtstart,
      until: d.end === 'until' && !d.until,
      count: d.end === 'count' && (!Number.isInteger(count) || count < 1),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean) || !amount.ok) return;
    const abs = Math.abs(amount.minor);
    try {
      await saveRecurrence({
        ...(d.id ? { id: d.id } : {}),
        name: (d.name.trim() || d.label.trim()).slice(0, 80),
        template: {
          accountId: d.accountId,
          toAccountId: d.kind === 'transfer' ? d.toAccountId : null,
          amountMinor: d.kind === 'transfer' ? abs : signedAmount(abs, d.kind),
          currency: data.settings.currency,
          kind: d.kind,
          categoryId: d.kind === 'transfer' ? null : d.categoryId,
          label: d.label.trim() || d.name.trim(),
          note: '',
          tagIds: [],
        },
        rule: formatRRule({
          freq: d.freq,
          interval,
          byMonthDay: null,
          until: d.end === 'until' ? d.until : null,
          count: d.end === 'count' ? count : null,
        }),
        dtstart: d.dtstart,
        undated: d.undated && d.freq === 'MONTHLY',
        autoConfirm: d.autoConfirm,
        active: d.active,
      });
      await runRecurrences();
      toast(t('settings.saved'), { tone: 'success', duration: 3000 });
      onClose();
    } catch (e) {
      reportError(e, t);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={<T id={d.id ? 'recurrences.editTitle' : 'recurrences.addTitle'} />}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button onClick={onClose}>
            <T id="common.cancel" />
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            <T id="common.save" />
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Segmented<OperationKind>
          name="rec-kind"
          legend={t('entry.kind')}
          value={d.kind}
          onChange={(kind) => set({ kind, categoryId: '' })}
          options={[
            { value: 'expense', label: t('kind.expense') },
            { value: 'income', label: t('kind.income') },
            ...(data.accounts.length > 1
              ? [{ value: 'transfer' as const, label: t('kind.transfer') }]
              : []),
          ]}
        />
        <div className={styles.grid2}>
          <Field
            label={<T id="recurrences.name" />}
            error={errors.name ? <T id="categories.error.name" /> : undefined}
          >
            <TextInput
              value={d.name}
              maxLength={80}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={t('recurrences.namePlaceholder')}
            />
          </Field>
          <Field
            label={<T id="entry.amount" />}
            error={errors.amount ? <T id="entry.error.amountInvalid" /> : undefined}
          >
            <TextInput
              inputMode="decimal"
              value={d.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </Field>
          <Field label={<T id="entry.label" />} optionalLabel={<T id="common.optional" />}>
            <TextInput
              value={d.label}
              maxLength={120}
              onChange={(e) => set({ label: e.target.value })}
            />
          </Field>
          {d.kind !== 'transfer' ? (
            <Field
              label={<T id="entry.category" />}
              error={errors.category ? <T id="entry.error.categoryRequired" /> : undefined}
            >
              <Select value={d.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                <option value="">{t('categories.chooseCategory')}</option>
                {data.categories
                  .filter((c) => c.kind === d.kind && !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}
          <Field label={<T id={d.kind === 'transfer' ? 'entry.fromAccount' : 'entry.account'} />}>
            <Select value={d.accountId} onChange={(e) => set({ accountId: e.target.value })}>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          {d.kind === 'transfer' ? (
            <Field
              label={<T id="entry.toAccount" />}
              error={errors.toAccount ? <T id="entry.error.toAccount" /> : undefined}
            >
              <Select value={d.toAccountId} onChange={(e) => set({ toAccountId: e.target.value })}>
                <option value="">{t('entry.chooseAccount')}</option>
                {data.accounts
                  .filter((a) => a.id !== d.accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}
        </div>
        <fieldset className={styles.fieldset}>
          <legend>
            <T id="recurrences.frequency" />
          </legend>
          <div className={styles.grid2}>
            <Field
              label={<T id="recurrences.every" />}
              error={errors.interval ? <T id="recurrences.error.interval" /> : undefined}
            >
              <TextInput
                type="number"
                min={1}
                max={366}
                inputMode="numeric"
                value={d.interval}
                onChange={(e) => set({ interval: e.target.value })}
              />
            </Field>
            <Field label={<T id="recurrences.unit" />}>
              <Select value={d.freq} onChange={(e) => set({ freq: e.target.value as Frequency })}>
                {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).map((f) => (
                  <option key={f} value={f}>
                    {t(`recurrences.unit.${f}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={<T id="recurrences.start" />}
              error={errors.dtstart ? <T id="entry.error.date" /> : undefined}
            >
              <TextInput
                type="date"
                value={d.dtstart}
                onChange={(e) => set({ dtstart: e.target.value })}
              />
            </Field>
            <Field label={<T id="recurrences.end" />}>
              <Select value={d.end} onChange={(e) => set({ end: e.target.value as Draft['end'] })}>
                <option value="never">{t('recurrences.end.never')}</option>
                <option value="until">{t('recurrences.end.until')}</option>
                <option value="count">{t('recurrences.end.count')}</option>
              </Select>
            </Field>
            {d.end === 'until' ? (
              <Field
                label={<T id="recurrences.untilDate" />}
                error={errors.until ? <T id="entry.error.date" /> : undefined}
              >
                <TextInput
                  type="date"
                  value={d.until}
                  onChange={(e) => set({ until: e.target.value })}
                />
              </Field>
            ) : null}
            {d.end === 'count' ? (
              <Field
                label={<T id="recurrences.countLabel" />}
                error={errors.count ? <T id="recurrences.error.interval" /> : undefined}
              >
                <TextInput
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={d.count}
                  onChange={(e) => set({ count: e.target.value })}
                />
              </Field>
            ) : null}
          </div>
        </fieldset>
        {d.freq === 'MONTHLY' ? (
          <Switch
            label={<T id="recurrences.undatedLabel" />}
            description={<T id="recurrences.undatedHint" />}
            checked={d.undated}
            onChange={(undated) => set({ undated })}
          />
        ) : null}
        <Switch
          label={<T id="recurrences.autoConfirm" />}
          description={<T id="recurrences.autoConfirmHint" />}
          checked={d.autoConfirm}
          onChange={(autoConfirm) => set({ autoConfirm })}
        />
      </div>
    </Dialog>
  );
}
