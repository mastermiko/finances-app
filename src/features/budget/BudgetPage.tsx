import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Copy } from 'lucide-react';
import { addPeriods } from '@/domain/common/civil-date';
import { budgetOverview, effectiveBudget, type BudgetLine } from '@/domain/budgets/budgets';
import { buildCategoryTree, flattenTree } from '@/domain/categories/categories';
import { evaluateAmountExpression } from '@/domain/money/expression';
import { currencyExponent } from '@/domain/money/money';
import type { Category } from '@/domain/model';
import { copyPreviousBudgets, deleteBudget, setBudget } from '@/data';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import {
  Amount,
  Badge,
  Button,
  CategoryIcon,
  Gauge,
  InfoTip,
  MonthSwitcher,
  Section,
  Switch,
  TextInput,
  toast,
} from '@/ui';
import { PageHeader } from '@/app/Layout';
import { useSwipe } from '../shared/hooks';
import { reportError } from '../shared/actions';
import { useAppData } from '../shared/app-data';
import styles from './BudgetPage.module.css';

export function BudgetPage(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const search = useSearch({ from: '/budget' });
  const navigate = useNavigate({ from: '/budget' });
  const period = search.m ?? data.currentPeriod;
  const setPeriod = (p: string): void =>
    void navigate({ search: { m: p === data.currentPeriod ? undefined : p } });
  const swipe = useSwipe(
    () => setPeriod(addPeriods(period, 1)),
    () => setPeriod(addPeriods(period, -1)),
  );
  const { settings, categories, totals } = data;
  const overview = useMemo(
    () =>
      budgetOverview(
        {
          budgets: data.budgets,
          categories,
          totalsByPeriod: totals,
          autoRenew: settings.budgetAutoRenew,
        },
        period,
      ),
    [data.budgets, categories, totals, settings.budgetAutoRenew, period],
  );
  const tree = useMemo(
    () =>
      flattenTree(buildCategoryTree(categories.filter((c) => c.kind === 'expense' && !c.archived))),
    [categories],
  );
  const lineFor = (id: string | null): BudgetLine | undefined =>
    id === null
      ? (overview.global ?? undefined)
      : overview.categories.find((l) => l.categoryId === id);
  const ownBudgets = data.budgets.filter((b) => b.period === period);
  const hasPrevious = data.budgets.some((b) => b.period < period);

  return (
    <div {...swipe}>
      <PageHeader
        title={<T id="budget.title" />}
        actions={
          hasPrevious ? (
            <Button
              icon={<Copy />}
              onClick={() => {
                void copyPreviousBudgets(period)
                  .then((n) => toast(t('budget.copied', { count: n }), { tone: 'success' }))
                  .catch((e: unknown) => reportError(e, t));
              }}
            >
              <T id="budget.copyPrevious" />
            </Button>
          ) : undefined
        }
      >
        <MonthSwitcher
          label={fmt.period(period)}
          previousLabel={t('common.previousMonth')}
          nextLabel={t('common.nextMonth')}
          onPrevious={() => setPeriod(addPeriods(period, -1))}
          onNext={() => setPeriod(addPeriods(period, 1))}
        />
      </PageHeader>

      <p className={styles.intro}>
        <T id="budget.intro" />{' '}
        <InfoTip label={t('budget.helpLabel')}>
          <T id="budget.help" />
        </InfoTip>
      </p>

      <Section title={<T id="budget.globalTitle" />} panel>
        <EnvelopeRow
          label={t('budget.global')}
          categoryId={null}
          period={period}
          line={lineFor(null)}
          own={ownBudgets.some((b) => b.categoryId === null)}
          rolloverDefault={
            effectiveBudget(data.budgets, period, null, settings.budgetAutoRenew)?.rollover ?? false
          }
        />
      </Section>

      <Section
        title={<T id="budget.categoriesTitle" />}
        panel
        actions={
          <p className={styles.total}>
            <T
              id="budget.totals"
              values={{
                envelopes: fmt.money(overview.totalEnvelopeMinor, { sign: 'never' }),
                spent: fmt.money(overview.totalSpentMinor, { sign: 'never' }),
              }}
            />
          </p>
        }
      >
        <ul className={styles.list} role="list">
          {tree.map((node) => (
            <li key={node.category.id} className={node.depth > 0 ? styles.child : undefined}>
              <EnvelopeRow
                category={node.category}
                label={node.category.name}
                categoryId={node.category.id}
                period={period}
                line={lineFor(node.category.id)}
                own={ownBudgets.some((b) => b.categoryId === node.category.id)}
                rolloverDefault={
                  effectiveBudget(data.budgets, period, node.category.id, settings.budgetAutoRenew)
                    ?.rollover ?? false
                }
                spentWithoutBudget={
                  totals.get(period)?.expenseByCategory.get(node.category.id) ?? 0
                }
              />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function EnvelopeRow({
  label,
  category,
  categoryId,
  period,
  line,
  own,
  rolloverDefault,
  spentWithoutBudget = 0,
}: {
  label: string;
  category?: Category;
  categoryId: string | null;
  period: string;
  line: BudgetLine | undefined;
  own: boolean;
  rolloverDefault: boolean;
  spentWithoutBudget?: number;
}): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const { settings } = useAppData();
  const [text, setText] = useState(line ? fmt.amountInput(line.envelopeMinor) : '');
  const [error, setError] = useState(false);
  useEffect(() => {
    setText(line ? fmt.amountInput(line.envelopeMinor) : '');
    setError(false);
  }, [line?.envelopeMinor, period, fmt, line]);

  const save = async (rollover: boolean = line?.rollover ?? rolloverDefault): Promise<void> => {
    try {
      if (text.trim() === '') {
        if (own) await deleteBudget(period, categoryId);
        return;
      }
      const r = evaluateAmountExpression(text, currencyExponent(settings.currency));
      if (!r.ok) {
        setError(true);
        return;
      }
      setError(false);
      const amount = Math.abs(r.minor);
      if (line && amount === line.envelopeMinor && rollover === line.rollover && own) return;
      await setBudget(period, categoryId, amount, rollover);
    } catch (e) {
      reportError(e, t);
    }
  };
  const inputId = `budget-${categoryId ?? 'global'}`;
  const spent = line?.spentMinor ?? spentWithoutBudget;
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        {category ? <CategoryIcon icon={category.icon} color={category.color} size="sm" /> : null}
        <label htmlFor={inputId} className={styles.name}>
          {label}
        </label>
        {line?.inherited && line.sourcePeriod ? (
          <Badge>
            <T id="budget.inherited" values={{ month: fmt.period(line.sourcePeriod) }} />
          </Badge>
        ) : null}
        <div className={styles.inputWrap}>
          <TextInput
            id={inputId}
            inputMode="decimal"
            className={styles.input}
            value={text}
            placeholder="0"
            aria-invalid={error || undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void save();
              }
            }}
          />
          <span className={styles.currency} aria-hidden="true">
            {settings.currency === 'EUR' ? '€' : settings.currency}
          </span>
        </div>
      </div>
      {error ? (
        <p id={`${inputId}-error`} className={styles.error} role="alert">
          <T id="entry.error.amountInvalid" />
        </p>
      ) : null}
      {line ? (
        <>
          <Gauge
            ratio={line.ratio}
            level={line.level}
            label={t('budget.gaugeLabel', { name: label })}
            valueText={t('dashboard.spentOf', {
              spent: fmt.money(line.spentMinor, { sign: 'never' }),
              total: fmt.money(line.availableMinor, { sign: 'never' }),
            })}
          />
          <div className={styles.rowFoot}>
            <span>
              <T
                id="budget.spent"
                values={{ amount: fmt.money(line.spentMinor, { sign: 'never' }) }}
              />
              {line.carryMinor !== 0 ? (
                <>
                  {' · '}
                  <T id="budget.carry" values={{ amount: fmt.money(line.carryMinor) }} />
                </>
              ) : null}
            </span>
            <span className={styles.remaining}>
              <T id="budget.remaining" />{' '}
              <Amount
                minor={line.remainingMinor}
                formatted={fmt.money(line.remainingMinor)}
                showIcon={line.remainingMinor < 0}
              />
            </span>
          </div>
          <Switch
            label={<T id="budget.rollover" />}
            description={<T id="budget.rolloverHint" />}
            checked={line.rollover}
            onChange={(checked) => void save(checked)}
          />
        </>
      ) : spent > 0 ? (
        <p className={styles.rowFoot}>
          <T id="budget.spent" values={{ amount: fmt.money(spent, { sign: 'never' }) }} />
        </p>
      ) : null}
    </div>
  );
}
