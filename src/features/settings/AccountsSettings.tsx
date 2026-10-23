import { useMemo, useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { accountBalances } from '@/domain/analytics/totals';
import { evaluateAmountExpression } from '@/domain/money/expression';
import { currencyExponent } from '@/domain/money/money';
import type { AccountType } from '@/domain/model';
import { AccountError, createAccount, deleteAccount, updateAccount, updateSettings } from '@/data';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import {
  Amount,
  Badge,
  Button,
  Dialog,
  Field,
  IconButton,
  Section,
  Select,
  TextInput,
  toast,
} from '@/ui';
import { reportError } from '../shared/actions';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useAppData } from '../shared/app-data';
import styles from './settings.module.css';

const TYPES: AccountType[] = ['checking', 'savings', 'cash', 'prepaid'];

interface Draft {
  id: string | null;
  name: string;
  type: AccountType;
  opening: string;
  openingDate: string;
}

export default function AccountsSettings(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<{ name?: boolean; opening?: boolean }>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const balances = useMemo(
    () => accountBalances(data.operations, data.accounts),
    [data.operations, data.accounts],
  );

  const save = async (): Promise<void> => {
    if (!draft) return;
    const opening =
      draft.opening.trim() === ''
        ? { ok: true as const, minor: 0 }
        : evaluateAmountExpression(draft.opening, currencyExponent(data.settings.currency));
    const nextErrors = { name: !draft.name.trim(), opening: !opening.ok };
    setErrors(nextErrors);
    if (nextErrors.name || !opening.ok) return;
    try {
      const fields = {
        name: draft.name,
        type: draft.type,
        currency: data.settings.currency,
        openingBalanceMinor: opening.minor,
        openingDate: draft.openingDate || null,
      };
      if (draft.id) await updateAccount(draft.id, fields);
      else await createAccount(fields);
      toast(t('settings.saved'), { tone: 'success', duration: 3000 });
      setDraft(null);
    } catch (e) {
      reportError(e, t);
    }
  };

  return (
    <div className={styles.stack}>
      <p className={styles.text}>
        <T id="accounts.intro" />
      </p>
      <div>
        <Button
          variant="primary"
          icon={<Plus />}
          onClick={() => {
            setErrors({});
            setDraft({ id: null, name: '', type: 'checking', opening: '', openingDate: '' });
          }}
        >
          <T id="accounts.add" />
        </Button>
      </div>
      <Section panel>
        <ul className={styles.list} role="list">
          {data.accounts.map((a) => (
            <li key={a.id} className={styles.item}>
              <span className={styles.itemMain}>
                <span className={styles.itemTitle}>{a.name}</span>
                <span className={styles.itemMeta}>
                  {t(`accounts.type.${a.type}`)} ·{' '}
                  <T id="accounts.opening" values={{ amount: fmt.money(a.openingBalanceMinor) }} />
                </span>
              </span>
              {a.id === data.defaultAccountId ? (
                <Badge tone="accent">
                  <T id="accounts.default" />
                </Badge>
              ) : null}
              {a.archived ? (
                <Badge>
                  <T id="categories.archived" />
                </Badge>
              ) : null}
              <Amount
                minor={balances.get(a.id) ?? 0}
                formatted={fmt.money(balances.get(a.id) ?? 0)}
                showIcon={false}
              />
              <span className={styles.actions}>
                {a.id !== data.defaultAccountId ? (
                  <IconButton
                    label={t('accounts.makeDefault', { name: a.name })}
                    icon={<Star />}
                    onClick={() => void updateSettings({ defaultAccountId: a.id })}
                  />
                ) : null}
                <IconButton
                  label={t('common.editItem', { name: a.name })}
                  icon={<Pencil />}
                  onClick={() => {
                    setErrors({});
                    setDraft({
                      id: a.id,
                      name: a.name,
                      type: a.type,
                      opening:
                        a.openingBalanceMinor === 0
                          ? ''
                          : `${a.openingBalanceMinor < 0 ? '-' : ''}${fmt.amountInput(a.openingBalanceMinor)}`,
                      openingDate: a.openingDate ?? '',
                    });
                  }}
                />
                <IconButton
                  label={t(a.archived ? 'categories.unarchive' : 'categories.archive', {
                    name: a.name,
                  })}
                  icon={a.archived ? <ArchiveRestore /> : <Archive />}
                  onClick={() => void updateAccount(a.id, { archived: !a.archived })}
                />
                <IconButton
                  label={t('common.deleteItem', { name: a.name })}
                  icon={<Trash2 />}
                  onClick={() => setDeleting(a.id)}
                />
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <p className={styles.muted}>
        <T id="accounts.transferHint" />
      </p>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={<T id={draft?.id ? 'accounts.editTitle' : 'accounts.addTitle'} />}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>
              <T id="common.cancel" />
            </Button>
            <Button variant="primary" type="submit" form="accounts-form">
              <T id="common.save" />
            </Button>
          </>
        }
      >
        {draft ? (
          <form
            id="accounts-form"
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field
              label={<T id="accounts.name" />}
              error={errors.name ? <T id="categories.error.name" /> : undefined}
            >
              <TextInput
                value={draft.name}
                maxLength={60}
                autoFocus
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label={<T id="accounts.typeLabel" />}>
              <Select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as AccountType })}
              >
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`accounts.type.${type}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={<T id="accounts.openingLabel" />}
              hint={<T id="accounts.openingHint" />}
              error={errors.opening ? <T id="entry.error.amountInvalid" /> : undefined}
            >
              <TextInput
                inputMode="decimal"
                value={draft.opening}
                onChange={(e) => setDraft({ ...draft, opening: e.target.value })}
              />
            </Field>
            <Field
              label={<T id="accounts.openingDate" />}
              optionalLabel={<T id="common.optional" />}
            >
              <TextInput
                type="date"
                value={draft.openingDate}
                onChange={(e) => setDraft({ ...draft, openingDate: e.target.value })}
              />
            </Field>
          </form>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={<T id="accounts.deleteTitle" />}
        confirmLabel={<T id="common.delete" />}
        onConfirm={() => {
          if (!deleting) return;
          void deleteAccount(deleting)
            .then(() => setDeleting(null))
            .catch((e: unknown) => {
              if (e instanceof AccountError)
                toast(t(e.code === 'inUse' ? 'accounts.error.inUse' : 'accounts.error.last'), {
                  tone: 'error',
                });
              else reportError(e, t);
              setDeleting(null);
            });
        }}
      >
        <p>
          <T id="accounts.deleteText" />
        </p>
      </ConfirmDialog>
    </div>
  );
}
