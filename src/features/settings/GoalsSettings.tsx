import { useMemo, useState, type ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { accountBalances } from '@/domain/analytics/totals';
import { goalProgress } from '@/domain/analytics/series';
import { evaluateAmountExpression } from '@/domain/money/expression';
import { currencyExponent } from '@/domain/money/money';
import type { Goal } from '@/domain/model';
import { deleteGoal, saveGoal, today } from '@/data';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Badge, Button, Dialog, Field, Gauge, IconButton, Section, Select, TextInput } from '@/ui';
import { reportError } from '../shared/actions';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useAppData } from '../shared/app-data';
import styles from './settings.module.css';

interface Draft {
  id?: string;
  name: string;
  target: string;
  dueDate: string;
  accountId: string;
}

export default function GoalsSettings(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<{ name?: boolean; target?: boolean }>({});
  const [deleting, setDeleting] = useState<Goal | null>(null);
  const balances = useMemo(
    () => accountBalances(data.operations, data.accounts),
    [data.operations, data.accounts],
  );
  const day = today();

  const save = async (): Promise<void> => {
    if (!draft) return;
    const target = evaluateAmountExpression(draft.target, currencyExponent(data.settings.currency));
    const next = { name: !draft.name.trim(), target: !target.ok || target.minor <= 0 };
    setErrors(next);
    if (next.name || !target.ok || target.minor <= 0) return;
    try {
      await saveGoal({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        targetMinor: target.minor,
        dueDate: draft.dueDate || null,
        accountId: draft.accountId || null,
      });
      setDraft(null);
    } catch (e) {
      reportError(e, t);
    }
  };

  return (
    <div className={styles.stack}>
      <p className={styles.text}>
        <T id="goals.intro" />
      </p>
      <div>
        <Button
          variant="primary"
          icon={<Plus />}
          onClick={() =>
            setDraft({
              name: '',
              target: '',
              dueDate: '',
              accountId: data.accounts.find((a) => a.type === 'savings')?.id ?? '',
            })
          }
        >
          <T id="goals.add" />
        </Button>
      </div>
      <Section panel>
        {data.goals.length === 0 ? (
          <p className={styles.muted}>
            <T id="goals.empty" />
          </p>
        ) : (
          <ul className={styles.list} role="list">
            {data.goals.map((goal) => {
              const p = goalProgress(goal, balances, day, data.accounts);
              return (
                <li key={goal.id} className={styles.item}>
                  <span className={styles.itemMain}>
                    <span className={styles.itemTitle}>{goal.name}</span>
                    <span className={styles.itemMeta}>
                      {fmt.money(p.currentMinor, { sign: 'never' })} /{' '}
                      {fmt.money(goal.targetMinor, { sign: 'never' })}
                      {goal.dueDate ? ` · ${t('goals.due', { date: fmt.date(goal.dueDate) })}` : ''}
                      {goal.accountId
                        ? ` · ${data.accountsById.get(goal.accountId)?.name ?? ''}`
                        : ` · ${t('goals.allSavings')}`}
                    </span>
                    <Gauge
                      ratio={p.ratio}
                      level="ok"
                      label={goal.name}
                      valueText={fmt.percent(p.ratio)}
                    />
                    {p.reached ? (
                      <Badge tone="ok">
                        <T id="goals.reached" />
                      </Badge>
                    ) : p.monthlyEffortMinor !== null ? (
                      <span className={styles.itemMeta}>
                        <T
                          id="goals.effort"
                          values={{
                            amount: fmt.money(p.monthlyEffortMinor, { sign: 'never' }),
                            months: p.monthsLeft ?? 0,
                          }}
                        />
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.actions}>
                    <IconButton
                      label={t('common.editItem', { name: goal.name })}
                      icon={<Pencil />}
                      onClick={() =>
                        setDraft({
                          id: goal.id,
                          name: goal.name,
                          target: fmt.amountInput(goal.targetMinor),
                          dueDate: goal.dueDate ?? '',
                          accountId: goal.accountId ?? '',
                        })
                      }
                    />
                    <IconButton
                      label={t('common.deleteItem', { name: goal.name })}
                      icon={<Trash2 />}
                      onClick={() => setDeleting(goal)}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={<T id={draft?.id ? 'goals.editTitle' : 'goals.addTitle'} />}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>
              <T id="common.cancel" />
            </Button>
            <Button variant="primary" onClick={() => void save()}>
              <T id="common.save" />
            </Button>
          </>
        }
      >
        {draft ? (
          <div className={styles.form}>
            <Field
              label={<T id="goals.name" />}
              error={errors.name ? <T id="categories.error.name" /> : undefined}
            >
              <TextInput
                value={draft.name}
                maxLength={80}
                autoFocus
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field
              label={<T id="goals.target" />}
              error={errors.target ? <T id="entry.error.amountInvalid" /> : undefined}
            >
              <TextInput
                inputMode="decimal"
                value={draft.target}
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
              />
            </Field>
            <Field label={<T id="goals.dueDate" />} optionalLabel={<T id="common.optional" />}>
              <TextInput
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
              />
            </Field>
            <Field label={<T id="goals.account" />} hint={<T id="goals.accountHint" />}>
              <Select
                value={draft.accountId}
                onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}
              >
                <option value="">{t('goals.allSavings')}</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={<T id="goals.deleteTitle" values={{ name: deleting?.name ?? '' }} />}
        confirmLabel={<T id="common.delete" />}
        onConfirm={() => {
          if (deleting) void deleteGoal(deleting.id).then(() => setDeleting(null));
        }}
      />
    </div>
  );
}
