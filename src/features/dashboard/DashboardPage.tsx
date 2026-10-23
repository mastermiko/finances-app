import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  CircleCheck,
  DatabaseBackup,
  FileUp,
  HardDrive,
  PiggyBank,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { addPeriods, diffDays, periodBounds } from '@/domain/common/civil-date';
import { accountBalances, balanceSeries, categoryShares } from '@/domain/analytics/totals';
import { forecastPeriod, goalProgress } from '@/domain/analytics/series';
import { budgetAlerts, budgetOverview } from '@/domain/budgets/budgets';
import { isStorageCritical, now, storageStatus, today, type StorageStatus } from '@/data';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import {
  Amount,
  Badge,
  Button,
  CategoryIcon,
  EmptyState,
  Gauge,
  MonthSwitcher,
  Section,
} from '@/ui';
import { OperationRow } from '../operations/OperationRow';
import { confirmWithToast, deleteWithUndo, duplicateWithUndo } from '../shared/actions';
import { useSwipe } from '../shared/hooks';
import { useUi } from '../shared/ui-store';
import { useAppData } from '../shared/app-data';
import { useRenderMeasure } from '../shared/perf';
import styles from './DashboardPage.module.css';

export function DashboardPage(): ReactNode {
  useRenderMeasure('finances:dashboard');
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const search = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  const openEntry = useUi((s) => s.openEntry);
  const period = search.m ?? data.currentPeriod;
  const setPeriod = (p: string): void =>
    void navigate({ search: (prev) => ({ ...prev, m: p === data.currentPeriod ? undefined : p }) });
  const swipe = useSwipe(
    () => setPeriod(addPeriods(period, 1)),
    () => setPeriod(addPeriods(period, -1)),
  );
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  useEffect(() => {
    void storageStatus().then(setStorage);
  }, []);
  // PWA shortcut "?new=1"
  useEffect(() => {
    if (search.new) {
      openEntry();
      void navigate({ search: (prev) => ({ ...prev, new: undefined }), replace: true });
    }
  }, [search.new, openEntry, navigate]);

  const { settings, operations, accounts, categories, categoriesById, totals } = data;
  const monthTotals = totals.get(period);
  const balance = useMemo(
    () => balanceSeries(operations, accounts, period, period)[0],
    [operations, accounts, period],
  );
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
  const alerts = budgetAlerts(overview);
  const shares = useMemo(
    () => (monthTotals ? categoryShares(monthTotals, categories) : []),
    [monthTotals, categories],
  );
  // Latest = most recent date first (undated charges last), then most recently entered.
  const lastOps = useMemo(
    () =>
      operations
        .filter((o) => o.period === period)
        .sort((a, b) => {
          if (a.date !== b.date) {
            if (a.date === null) return 1;
            if (b.date === null) return -1;
            return a.date < b.date ? 1 : -1;
          }
          return a.createdAt < b.createdAt
            ? 1
            : a.createdAt > b.createdAt
              ? -1
              : a.id < b.id
                ? 1
                : -1;
        })
        .slice(0, 5),
    [operations, period],
  );
  const isCurrent = period === data.currentPeriod;
  const day = today();
  const bounds = periodBounds(period, settings.budgetMonthStartDay);
  const totalDays = diffDays(bounds.end, bounds.start) + 1;
  const elapsedDays = isCurrent
    ? Math.min(totalDays, diffDays(day, bounds.start) + 1)
    : period < data.currentPeriod
      ? totalDays
      : 0;
  const forecast = useMemo(
    () =>
      isCurrent
        ? forecastPeriod(
            operations,
            period,
            day,
            settings.budgetMonthStartDay,
            balance?.openingMinor ?? 0,
          )
        : null,
    [isCurrent, operations, period, day, settings.budgetMonthStartDay, balance],
  );
  const planned = operations.filter(
    (o) =>
      o.status === 'planned' && (o.date === null ? o.period <= data.currentPeriod : o.date <= day),
  );
  const balances = useMemo(() => accountBalances(operations, accounts), [operations, accounts]);
  const activeGoals = data.goals.filter((g) => !g.archived);

  const lastBackup = settings.lastBackupAt;
  const backupAgeDays = lastBackup
    ? Math.floor((now().getTime() - Date.parse(lastBackup)) / 86_400_000)
    : null;
  const backupDue =
    settings.backupReminderDays > 0 &&
    operations.length > 0 &&
    (backupAgeDays === null || backupAgeDays >= settings.backupReminderDays);

  if (operations.length === 0 && data.importBatches.length === 0) {
    return (
      <div className={styles.onboarding}>
        <EmptyState
          icon={<PiggyBank />}
          title={<T id="dashboard.welcome.title" />}
          actions={
            <>
              <Button
                variant="primary"
                icon={<FileUp />}
                onClick={() => void navigate({ to: '/import' })}
              >
                <T id="empty.importWorkbook" />
              </Button>
              <Button icon={<Plus />} onClick={() => openEntry()}>
                <T id="empty.firstOperation" />
              </Button>
            </>
          }
        >
          <p>
            <T id="dashboard.welcome.text" />
          </p>
          <p className={styles.storageNote}>
            <T id="dashboard.welcome.storage" />
          </p>
        </EmptyState>
      </div>
    );
  }

  const global = overview.global;
  const hasBudget = global !== null || overview.categories.length > 0;
  const heroAvailable = global ? global.availableMinor : overview.totalEnvelopeMinor;
  const heroSpent = global
    ? global.spentMinor
    : overview.categories.reduce((s, l) => s + l.spentMinor, 0);
  const heroRemaining = global
    ? global.remainingMinor
    : overview.categories.reduce((s, l) => s + l.remainingMinor, 0);
  const heroValue = hasBudget ? heroRemaining : (balance?.closingMinor ?? 0);
  const heroLevel = global?.level ?? (heroRemaining < 0 ? 'over' : 'ok');

  return (
    <div className={styles.page} {...swipe}>
      <header className={styles.header}>
        <h1 className="visually-hidden">
          <T id="dashboard.title" />
        </h1>
        <MonthSwitcher
          label={fmt.period(period)}
          previousLabel={t('common.previousMonth')}
          nextLabel={t('common.nextMonth')}
          onPrevious={() => setPeriod(addPeriods(period, -1))}
          onNext={() => setPeriod(addPeriods(period, 1))}
          {...(isCurrent
            ? {}
            : {
                onLabelClick: () => setPeriod(data.currentPeriod),
                labelHint: t('dashboard.backToCurrent'),
              })}
        />
      </header>

      <section className={styles.hero} aria-labelledby="hero-label">
        <p id="hero-label" className={styles.heroLabel}>
          <T id={hasBudget ? 'dashboard.remaining' : 'dashboard.closingBalance'} />
        </p>
        <p className={[styles.heroValue, heroValue < 0 ? styles.negative : ''].join(' ')}>
          <Amount minor={heroValue} formatted={fmt.money(heroValue)} showIcon={heroValue < 0} />
        </p>
        {hasBudget ? (
          <>
            <Gauge
              ratio={heroAvailable > 0 ? heroSpent / heroAvailable : heroSpent > 0 ? 1 : 0}
              level={heroLevel === 'none' ? 'ok' : heroLevel}
              label={t('dashboard.gaugeLabel')}
              valueText={t('dashboard.spentOf', {
                spent: fmt.money(heroSpent, { sign: 'never' }),
                total: fmt.money(heroAvailable, { sign: 'never' }),
              })}
              {...(isCurrent ? { marker: elapsedDays / totalDays } : {})}
            />
            <p className={styles.heroMeta}>
              <span>
                <T
                  id="dashboard.spentOf"
                  values={{
                    spent: fmt.money(heroSpent, { sign: 'never' }),
                    total: fmt.money(heroAvailable, { sign: 'never' }),
                  }}
                />
              </span>
              {isCurrent ? (
                <span>
                  <T id="dashboard.dayOf" values={{ day: elapsedDays, total: totalDays }} />
                </span>
              ) : null}
              {global && global.carryMinor !== 0 ? (
                <span>
                  <T id="dashboard.carry" values={{ amount: fmt.money(global.carryMinor) }} />
                </span>
              ) : null}
            </p>
          </>
        ) : (
          <p className={styles.heroMeta}>
            <T id="dashboard.noBudget" />{' '}
            <Link to="/budget" search={{ m: period }}>
              <T id="dashboard.setBudget" />
            </Link>
          </p>
        )}
        {forecast ? (
          <p className={styles.forecast}>
            <T
              id="dashboard.forecast"
              values={{ amount: fmt.money(forecast.projectedClosingMinor) }}
            />
          </p>
        ) : null}
      </section>

      <dl className={styles.kpis}>
        <div>
          <dt>
            <T id="dashboard.income" />
          </dt>
          <dd>
            <Amount
              minor={monthTotals?.incomeMinor ?? 0}
              formatted={fmt.money(monthTotals?.incomeMinor ?? 0)}
              kind="income"
            />
          </dd>
        </div>
        <div>
          <dt>
            <T id="dashboard.expenses" />
          </dt>
          <dd>
            <Amount
              minor={-(monthTotals?.expenseMinor ?? 0)}
              formatted={fmt.money(-(monthTotals?.expenseMinor ?? 0))}
              kind="expense"
            />
          </dd>
        </div>
        <div>
          <dt>
            <T id="dashboard.result" />
          </dt>
          <dd>
            <Amount
              minor={monthTotals?.resultMinor ?? 0}
              formatted={fmt.money(monthTotals?.resultMinor ?? 0)}
            />
          </dd>
        </div>
        <div>
          <dt>
            <T id={hasBudget ? 'dashboard.closingBalance' : 'dashboard.openingBalance'} />
          </dt>
          <dd>
            {hasBudget ? (
              <Amount
                minor={balance?.closingMinor ?? 0}
                formatted={fmt.money(balance?.closingMinor ?? 0)}
                showIcon={false}
              />
            ) : (
              <Amount
                minor={balance?.openingMinor ?? 0}
                formatted={fmt.money(balance?.openingMinor ?? 0)}
                showIcon={false}
              />
            )}
          </dd>
        </div>
      </dl>

      {alerts.length > 0 ||
      backupDue ||
      planned.length > 0 ||
      (storage && isStorageCritical(storage)) ? (
        <Section title={<T id="dashboard.alerts" />}>
          <ul className={styles.alerts} role="list">
            {alerts.map((a) => (
              <li
                key={a.categoryId ?? 'global'}
                className={a.level === 'over' ? styles.alertDanger : styles.alertWarn}
              >
                <TriangleAlert aria-hidden="true" />
                <span>
                  <T
                    id={a.level === 'over' ? 'dashboard.alert.over' : 'dashboard.alert.warn'}
                    values={{
                      name: a.categoryId
                        ? (categoriesById.get(a.categoryId)?.name ?? '')
                        : t('budget.global'),
                      percent: fmt.percent(Number.isFinite(a.ratio) ? a.ratio : 1),
                      remaining: fmt.money(a.remainingMinor),
                    }}
                  />
                </span>
              </li>
            ))}
            {planned.length > 0 ? (
              <li className={styles.alertInfo}>
                <CircleCheck aria-hidden="true" />
                <span>
                  <T id="dashboard.alert.planned" values={{ count: planned.length }} />
                </span>
                <Button
                  size="sm"
                  onClick={() =>
                    void confirmWithToast(
                      planned.map((o) => o.id),
                      t,
                    )
                  }
                >
                  <T id="dashboard.alert.confirmAll" />
                </Button>
              </li>
            ) : null}
            {backupDue ? (
              <li className={styles.alertWarn}>
                <DatabaseBackup aria-hidden="true" />
                <span>
                  {backupAgeDays === null ? (
                    <T id="dashboard.alert.noBackup" />
                  ) : (
                    <T id="dashboard.alert.oldBackup" values={{ days: backupAgeDays }} />
                  )}
                </span>
                <Button
                  size="sm"
                  onClick={() => void import('../io/export-actions').then((m) => m.exportJson(t))}
                >
                  <T id="dashboard.alert.exportNow" />
                </Button>
              </li>
            ) : null}
            {storage && isStorageCritical(storage) ? (
              <li className={styles.alertDanger}>
                <HardDrive aria-hidden="true" />
                <span>
                  <T
                    id="dashboard.alert.storage"
                    values={{ percent: fmt.percent(storage.ratio ?? 0) }}
                  />
                </span>
              </li>
            ) : null}
          </ul>
        </Section>
      ) : null}

      <div className={styles.columns}>
        <Section
          title={<T id="dashboard.byCategory" />}
          actions={
            <Link to="/budget" search={{ m: period }} className={styles.sectionLink}>
              <T id="dashboard.manageBudget" />
            </Link>
          }
        >
          {shares.length === 0 ? (
            <p className={styles.muted}>
              <T id="dashboard.noExpense" />
            </p>
          ) : (
            <ul className={styles.categories} role="list">
              {shares.map((share) => {
                const category = categoriesById.get(share.categoryId);
                const line = overview.categories.find((l) => l.categoryId === share.categoryId);
                return (
                  <li key={share.categoryId}>
                    <Link
                      to="/operations"
                      search={{ preset: 'month', from: period, cat: share.categoryId || undefined }}
                      className={styles.categoryLink}
                    >
                      {category ? (
                        <CategoryIcon icon={category.icon} color={category.color} size="sm" />
                      ) : null}
                      <span className={styles.categoryMain}>
                        <span className={styles.categoryTop}>
                          <span className={styles.categoryName}>
                            {category?.name ?? t('category.none')}
                          </span>
                          <span className={styles.categoryAmount}>
                            {fmt.money(share.amountMinor, { sign: 'never' })}
                            <span
                              className={styles.share}
                            >{` · ${fmt.percent(share.percent / 100, 1)}`}</span>
                          </span>
                        </span>
                        {line ? (
                          <>
                            <Gauge
                              ratio={line.ratio}
                              level={line.level}
                              label={t('budget.gaugeLabel', { name: category?.name ?? '' })}
                              valueText={t('dashboard.spentOf', {
                                spent: fmt.money(line.spentMinor, { sign: 'never' }),
                                total: fmt.money(line.availableMinor, { sign: 'never' }),
                              })}
                            />
                            <span className={styles.categoryBudget}>
                              <T
                                id="dashboard.budgetLeft"
                                values={{
                                  remaining: fmt.money(line.remainingMinor),
                                  total: fmt.money(line.availableMinor, { sign: 'never' }),
                                }}
                              />
                            </span>
                          </>
                        ) : (
                          <span className={styles.bar} aria-hidden="true">
                            <span style={{ width: `${Math.max(2, share.percent)}%` }} />
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <div className={styles.side}>
          <Section
            title={<T id="dashboard.latest" />}
            actions={
              <Link
                to="/operations"
                search={{ preset: 'month', from: period, sort: 'desc' }}
                className={styles.sectionLink}
              >
                <T id="dashboard.seeAll" />
              </Link>
            }
          >
            {lastOps.length === 0 ? (
              <p className={styles.muted}>
                <T id="dashboard.noOperation" />
              </p>
            ) : (
              <ul className={styles.latest} role="list">
                {lastOps.map((op) => (
                  <li key={op.id}>
                    <OperationRow
                      op={op}
                      showDate
                      onOpen={(o) => openEntry({ editId: o.id })}
                      onEdit={(o) => openEntry({ editId: o.id })}
                      onDuplicate={(o) => void duplicateWithUndo([o.id], t)}
                      onDelete={(o) => void deleteWithUndo([o.id], t)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {accounts.length > 1 ? (
            <Section title={<T id="dashboard.accounts" />}>
              <ul className={styles.accounts} role="list">
                {accounts
                  .filter((a) => !a.archived)
                  .map((a) => (
                    <li key={a.id}>
                      <span>{a.name}</span>
                      <Amount
                        minor={balances.get(a.id) ?? 0}
                        formatted={fmt.money(balances.get(a.id) ?? 0)}
                        showIcon={false}
                      />
                    </li>
                  ))}
                <li className={styles.accountsTotal}>
                  <span>
                    <T id="dashboard.totalBalance" />
                  </span>
                  <Amount
                    minor={[...balances.values()].reduce((s, v) => s + v, 0)}
                    formatted={fmt.money([...balances.values()].reduce((s, v) => s + v, 0))}
                    showIcon={false}
                  />
                </li>
              </ul>
            </Section>
          ) : null}

          {activeGoals.length > 0 ? (
            <Section title={<T id="dashboard.goals" />}>
              <ul className={styles.goals} role="list">
                {activeGoals.map((goal) => {
                  const p = goalProgress(goal, balances, day, accounts);
                  return (
                    <li key={goal.id}>
                      <span className={styles.categoryTop}>
                        <span>{goal.name}</span>
                        <span className={styles.categoryAmount}>
                          {fmt.money(p.currentMinor, { sign: 'never' })} /{' '}
                          {fmt.money(goal.targetMinor, { sign: 'never' })}
                        </span>
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
                        <span className={styles.categoryBudget}>
                          <T
                            id="goals.effort"
                            values={{
                              amount: fmt.money(p.monthlyEffortMinor, { sign: 'never' }),
                              months: p.monthsLeft ?? 0,
                            }}
                          />
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
