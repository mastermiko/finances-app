import { useEffect, useState, type ReactNode } from 'react';
import { evaluateAmountExpression } from '@/domain/money/expression';
import { currencyExponent } from '@/domain/money/money';
import { flattenTree, buildCategoryTree } from '@/domain/categories/categories';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Button, Checkbox, Dialog, Field, Select, TextInput } from '@/ui';
import { useAppData } from '../shared/app-data';
import styles from './FiltersDialog.module.css';
import { joinList, splitList, type OperationsSearch } from './search';

export function FiltersDialog({
  open,
  onClose,
  search,
  onApply,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly search: OperationsSearch;
  readonly onApply: (patch: Partial<OperationsSearch>) => void;
}): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const [state, setState] = useState(() => fromSearch(search, fmt.amountInput));
  useEffect(() => {
    if (open) setState(fromSearch(search, fmt.amountInput));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const exp = currencyExponent(data.settings.currency);
  const parseAmount = (text: string): number | undefined => {
    if (!text.trim()) return undefined;
    const r = evaluateAmountExpression(text, exp);
    return r.ok ? Math.abs(r.minor) : undefined;
  };
  const toggle = (key: 'cat' | 'acc' | 'kind' | 'status' | 'tag', id: string): void =>
    setState((s) => ({
      ...s,
      [key]: s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id],
    }));
  const tree = flattenTree(buildCategoryTree(data.categories));
  const periods = [...new Set(data.operations.map((o) => o.period))].sort().reverse();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sheet"
      title={<T id="filters.title" />}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() =>
              setState({
                cat: [],
                acc: [],
                kind: [],
                status: [],
                tag: [],
                min: '',
                max: '',
                undated: false,
                from: '',
                to: '',
              })
            }
          >
            <T id="filters.reset" />
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply({
                cat: joinList(state.cat),
                acc: joinList(state.acc),
                kind: joinList(state.kind),
                status: joinList(state.status),
                tag: joinList(state.tag),
                min: parseAmount(state.min),
                max: parseAmount(state.max),
                undated: state.undated || undefined,
                ...(state.from || state.to
                  ? {
                      preset: 'custom' as const,
                      from: state.from || undefined,
                      to: state.to || undefined,
                    }
                  : {}),
              });
              onClose();
            }}
          >
            <T id="filters.apply" />
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <fieldset className={styles.group}>
          <legend>
            <T id="filters.period" />
          </legend>
          <div className={styles.row}>
            <Field label={<T id="filters.from" />}>
              <Select
                value={state.from}
                onChange={(e) => setState((s) => ({ ...s, from: e.target.value }))}
              >
                <option value="">{t('filters.any')}</option>
                {periods.map((p) => (
                  <option key={p} value={p}>
                    {fmt.period(p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={<T id="filters.to" />}>
              <Select
                value={state.to}
                onChange={(e) => setState((s) => ({ ...s, to: e.target.value }))}
              >
                <option value="">{t('filters.any')}</option>
                {periods.map((p) => (
                  <option key={p} value={p}>
                    {fmt.period(p)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Checkbox
            label={<T id="filters.undatedOnly" />}
            checked={state.undated}
            onChange={(undated) => setState((s) => ({ ...s, undated }))}
          />
        </fieldset>

        <fieldset className={styles.group}>
          <legend>
            <T id="filters.kind" />
          </legend>
          {(['expense', 'income', 'transfer'] as const).map((k) => (
            <Checkbox
              key={k}
              label={<T id={`kind.${k}`} />}
              checked={state.kind.includes(k)}
              onChange={() => toggle('kind', k)}
            />
          ))}
          {(['cleared', 'planned'] as const).map((s) => (
            <Checkbox
              key={s}
              label={<T id={`status.${s}`} />}
              checked={state.status.includes(s)}
              onChange={() => toggle('status', s)}
            />
          ))}
        </fieldset>

        <fieldset className={styles.group}>
          <legend>
            <T id="filters.categories" />
          </legend>
          <div className={styles.columns}>
            {tree.map((node) => (
              <span key={node.category.id} className={node.depth > 0 ? styles.child : undefined}>
                <Checkbox
                  label={node.category.name}
                  checked={state.cat.includes(node.category.id)}
                  onChange={() => toggle('cat', node.category.id)}
                />
              </span>
            ))}
          </div>
        </fieldset>

        {data.accounts.length > 1 ? (
          <fieldset className={styles.group}>
            <legend>
              <T id="filters.accounts" />
            </legend>
            {data.accounts.map((a) => (
              <Checkbox
                key={a.id}
                label={a.name}
                checked={state.acc.includes(a.id)}
                onChange={() => toggle('acc', a.id)}
              />
            ))}
          </fieldset>
        ) : null}

        {data.tags.length > 0 ? (
          <fieldset className={styles.group}>
            <legend>
              <T id="filters.tags" />
            </legend>
            <div className={styles.columns}>
              {data.tags.map((tag) => (
                <Checkbox
                  key={tag.id}
                  label={`#${tag.name}`}
                  checked={state.tag.includes(tag.id)}
                  onChange={() => toggle('tag', tag.id)}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className={styles.group}>
          <legend>
            <T id="filters.amount" />
          </legend>
          <div className={styles.row}>
            <Field
              label={<T id="filters.min" />}
              error={
                state.min && parseAmount(state.min) === undefined ? (
                  <T id="entry.error.amountInvalid" />
                ) : undefined
              }
            >
              <TextInput
                inputMode="decimal"
                value={state.min}
                onChange={(e) => setState((s) => ({ ...s, min: e.target.value }))}
              />
            </Field>
            <Field
              label={<T id="filters.max" />}
              error={
                state.max && parseAmount(state.max) === undefined ? (
                  <T id="entry.error.amountInvalid" />
                ) : undefined
              }
            >
              <TextInput
                inputMode="decimal"
                value={state.max}
                onChange={(e) => setState((s) => ({ ...s, max: e.target.value }))}
              />
            </Field>
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

function fromSearch(search: OperationsSearch, amount: (minor: number) => string) {
  return {
    cat: splitList(search.cat),
    acc: splitList(search.acc),
    kind: splitList(search.kind),
    status: splitList(search.status),
    tag: splitList(search.tag),
    min: search.min !== undefined ? amount(search.min) : '',
    max: search.max !== undefined ? amount(search.max) : '',
    undated: search.undated ?? false,
    from: search.preset === 'custom' ? (search.from ?? '') : '',
    to: search.preset === 'custom' ? (search.to ?? '') : '',
  };
}
