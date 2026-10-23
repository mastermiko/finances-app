import type { ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { EChartsCoreOption } from 'echarts/core';
import { addPeriods } from '@/domain/common/civil-date';
import { compareExpenses, savingsRate } from '@/domain/analytics/totals';
import {
  expenseMatrix,
  incomeExpenseSeries,
  lastPeriods,
  tagSeries,
  topLabels,
  yearPeriods,
} from '@/domain/analytics/series';
import { darkVariant } from '@/domain/model';
import { minorToNumber } from '@/domain/money/money';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { EmptyState, MonthSwitcher, Section, Select, Tabs } from '@/ui';
import { PageHeader } from '@/app/Layout';
import { useAppData } from '../shared/app-data';
import styles from './AnalyticsPage.module.css';
import { Chart, cssVar, isDarkTheme, type ChartTable } from './Chart';

export const ANALYTICS_TABS = ['evolution', 'compare', 'flows', 'year', 'labels', 'tags'] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];

const OTHER_COLOR = '#898781';

export function AnalyticsPage(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const search = useSearch({ from: '/analytics' });
  const navigate = useNavigate({ from: '/analytics' });
  const tab: AnalyticsTab = search.tab ?? 'evolution';
  const end = search.m ?? data.currentPeriod;
  const setSearch = (patch: Partial<typeof search>): void =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const dark = isDarkTheme();
  const colorOf = (categoryId: string): string => {
    const c = data.categoriesById.get(categoryId);
    if (!c) return OTHER_COLOR;
    return dark ? darkVariant(c.color) : c.color;
  };
  const nameOf = (categoryId: string): string =>
    data.categoriesById.get(categoryId)?.name ?? t('category.none');
  const num = (minor: number): number => minorToNumber(minor, data.settings.currency);
  const axis = {
    axisLine: { lineStyle: { color: cssVar('--chart-axis') } },
    axisLabel: { color: cssVar('--color-ink-secondary') },
    splitLine: { lineStyle: { color: cssVar('--chart-grid') } },
  };
  const moneyAxis = {
    type: 'value',
    ...axis,
    axisLabel: {
      color: cssVar('--color-ink-secondary'),
      formatter: (v: number) => fmt.money(Math.round(v * 100), { sign: 'auto', compact: true }),
    },
  };
  const tooltipValue = (v: unknown): string =>
    fmt.money(Math.round(Number(v) * 100), { sign: 'auto' });

  if (data.operations.length === 0) {
    return (
      <>
        <PageHeader title={<T id="analytics.title" />} />
        <EmptyState title={<T id="analytics.empty.title" />}>
          <T id="analytics.empty.text" />
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title={<T id="analytics.title" />}>
        {tab !== 'year' ? (
          <MonthSwitcher
            label={t('analytics.until', { month: fmt.period(end) })}
            previousLabel={t('common.previousMonth')}
            nextLabel={t('common.nextMonth')}
            onPrevious={() => setSearch({ m: addPeriods(end, -1) })}
            onNext={() => setSearch({ m: addPeriods(end, 1) })}
          />
        ) : null}
      </PageHeader>
      <Tabs
        idPrefix="analytics"
        label={t('analytics.title')}
        items={ANALYTICS_TABS.map((value) => ({ value, label: t(`analytics.tab.${value}`) }))}
        value={tab}
        onChange={(value) => setSearch({ tab: value })}
      />
      <div
        id="analytics-panel"
        role="tabpanel"
        aria-labelledby={`analytics-tab-${tab}`}
        className={styles.panel}
      >
        {tab === 'evolution' ? renderEvolution() : null}
        {tab === 'compare' ? renderCompare() : null}
        {tab === 'flows' ? renderFlows() : null}
        {tab === 'year' ? renderYear() : null}
        {tab === 'labels' ? renderLabels() : null}
        {tab === 'tags' ? renderTagsTab() : null}
      </div>
    </>
  );

  function renderEvolution(): ReactNode {
    const periods = lastPeriods(end, 12);
    const matrix = expenseMatrix(data.totals, data.categories, periods);
    const option: EChartsCoreOption = {
      grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
      legend: { top: 0, type: 'scroll', textStyle: { color: cssVar('--color-ink-secondary') } },
      tooltip: { renderMode: 'richText', trigger: 'axis', valueFormatter: tooltipValue },
      xAxis: { type: 'category', data: periods.map((p) => fmt.period(p, 'short')), ...axis },
      yAxis: moneyAxis,
      series: matrix.series.map((s) => ({
        name: nameOf(s.categoryId),
        type: 'bar',
        stack: 'total',
        barMaxWidth: 24,
        itemStyle: {
          color: colorOf(s.categoryId),
          borderColor: cssVar('--color-surface'),
          borderWidth: 1,
        },
        data: s.values.map(num),
      })),
    };
    const table: ChartTable = {
      headers: [
        t('analytics.col.month'),
        ...matrix.series.map((s) => nameOf(s.categoryId)),
        t('analytics.col.total'),
      ],
      rows: periods.map((p, i) => [
        p,
        ...matrix.series.map((s) => num(s.values[i] ?? 0)),
        num(matrix.totals[i] ?? 0),
      ]),
      display: periods.map((p, i) => [
        fmt.period(p),
        ...matrix.series.map((s) => fmt.money(s.values[i] ?? 0, { sign: 'never' })),
        fmt.money(matrix.totals[i] ?? 0, { sign: 'never' }),
      ]),
    };
    return (
      <Chart
        title={t('analytics.evolution.title')}
        description={t('analytics.evolution.description', {
          from: fmt.period(periods[0] ?? end),
          to: fmt.period(end),
        })}
        option={option}
        table={table}
        fileName={`depenses-par-categorie_${end}`}
        height={360}
      />
    );
  }

  function renderCompare(): ReactNode {
    const roots = data.categories.filter((c) => c.kind === 'expense' && c.parentId === null);
    const rows = roots
      .map((c) => {
        const ids = new Set(
          data.categories.filter((x) => x.id === c.id || x.parentId === c.id).map((x) => x.id),
        );
        return { category: c, cmp: compareExpenses(data.totals, end, ids) };
      })
      .filter(
        (r) => r.cmp.currentMinor !== 0 || r.cmp.previousMinor !== 0 || r.cmp.average3Minor !== 0,
      );
    const all = compareExpenses(data.totals, end, null);
    const option: EChartsCoreOption = {
      grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
      legend: { top: 0, textStyle: { color: cssVar('--color-ink-secondary') } },
      tooltip: { renderMode: 'richText', trigger: 'axis', valueFormatter: tooltipValue },
      xAxis: { type: 'category', data: rows.map((r) => r.category.name), ...axis },
      yAxis: moneyAxis,
      series: [
        {
          name: fmt.period(end),
          type: 'bar',
          barMaxWidth: 20,
          itemStyle: { color: dark ? '#3987e5' : '#2a78d6' },
          data: rows.map((r) => num(r.cmp.currentMinor)),
        },
        {
          name: fmt.period(addPeriods(end, -1)),
          type: 'bar',
          barMaxWidth: 20,
          itemStyle: { color: dark ? '#d95926' : '#eb6834' },
          data: rows.map((r) => num(r.cmp.previousMinor)),
        },
        {
          name: t('analytics.average3'),
          type: 'bar',
          barMaxWidth: 20,
          itemStyle: { color: dark ? '#199e70' : '#1baf7a' },
          data: rows.map((r) => num(r.cmp.average3Minor)),
        },
      ],
    };
    const delta = (a: number, b: number): string => (b === 0 ? '—' : fmt.percent((a - b) / b));
    const table: ChartTable = {
      headers: [
        t('analytics.col.category'),
        fmt.period(end),
        fmt.period(addPeriods(end, -1)),
        t('analytics.average3'),
        t('analytics.col.vsPrevious'),
        t('analytics.col.vsAverage'),
      ],
      rows: [...rows, { category: { name: t('analytics.col.total') }, cmp: all }].map((r) => [
        r.category.name,
        num(r.cmp.currentMinor),
        num(r.cmp.previousMinor),
        num(r.cmp.average3Minor),
        delta(r.cmp.currentMinor, r.cmp.previousMinor),
        delta(r.cmp.currentMinor, r.cmp.average3Minor),
      ]),
      display: [...rows, { category: { name: t('analytics.col.total') }, cmp: all }].map((r) => [
        r.category.name,
        fmt.money(r.cmp.currentMinor, { sign: 'never' }),
        fmt.money(r.cmp.previousMinor, { sign: 'never' }),
        fmt.money(r.cmp.average3Minor, { sign: 'never' }),
        delta(r.cmp.currentMinor, r.cmp.previousMinor),
        delta(r.cmp.currentMinor, r.cmp.average3Minor),
      ]),
    };
    return (
      <>
        <p className={styles.lead}>
          <T
            id="analytics.compare.lead"
            values={{
              month: fmt.period(end),
              current: fmt.money(all.currentMinor, { sign: 'never' }),
              previous: fmt.money(all.previousMinor, { sign: 'never' }),
              average: fmt.money(all.average3Minor, { sign: 'never' }),
            }}
          />
        </p>
        <Chart
          title={t('analytics.compare.title')}
          option={option}
          table={table}
          fileName={`comparaison_${end}`}
          height={340}
        />
      </>
    );
  }

  function renderFlows(): ReactNode {
    const periods = lastPeriods(end, 12);
    const points = incomeExpenseSeries(data.totals, periods);
    const labels = periods.map((p) => fmt.period(p, 'short'));
    const flows: EChartsCoreOption = {
      grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
      legend: { top: 0, textStyle: { color: cssVar('--color-ink-secondary') } },
      tooltip: { renderMode: 'richText', trigger: 'axis', valueFormatter: tooltipValue },
      xAxis: { type: 'category', data: labels, ...axis },
      yAxis: moneyAxis,
      series: [
        {
          name: t('dashboard.income'),
          type: 'bar',
          barMaxWidth: 20,
          itemStyle: { color: dark ? '#3987e5' : '#2a78d6' },
          data: points.map((p) => num(p.incomeMinor)),
        },
        {
          name: t('dashboard.expenses'),
          type: 'bar',
          barMaxWidth: 20,
          itemStyle: { color: dark ? '#d95926' : '#eb6834' },
          data: points.map((p) => num(p.expenseMinor)),
        },
      ],
    };
    const rate: EChartsCoreOption = {
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: {
        renderMode: 'richText',
        trigger: 'axis',
        valueFormatter: (v: unknown) =>
          v === null || v === undefined ? '—' : fmt.percent(Number(v)),
      },
      xAxis: { type: 'category', data: labels, ...axis },
      yAxis: {
        type: 'value',
        ...axis,
        axisLabel: {
          color: cssVar('--color-ink-secondary'),
          formatter: (v: number) => fmt.percent(v),
        },
      },
      series: [
        {
          name: t('analytics.savingsRate'),
          type: 'line',
          connectNulls: false,
          symbolSize: 8,
          lineStyle: { width: 2 },
          itemStyle: { color: dark ? '#9085e9' : '#6250d6' },
          data: points.map((p) =>
            p.savingsRate === null ? null : Number(p.savingsRate.toFixed(4)),
          ),
        },
      ],
    };
    const table: ChartTable = {
      headers: [
        t('analytics.col.month'),
        t('dashboard.income'),
        t('dashboard.expenses'),
        t('dashboard.result'),
        t('analytics.savingsRate'),
      ],
      rows: points.map((p) => [
        p.period,
        num(p.incomeMinor),
        num(p.expenseMinor),
        num(p.resultMinor),
        p.savingsRate === null ? '' : Number(p.savingsRate.toFixed(4)),
      ]),
      display: points.map((p) => [
        fmt.period(p.period),
        fmt.money(p.incomeMinor, { sign: 'never' }),
        fmt.money(p.expenseMinor, { sign: 'never' }),
        fmt.money(p.resultMinor),
        p.savingsRate === null ? '—' : fmt.percent(p.savingsRate),
      ]),
    };
    const totalIncome = points.reduce((s, p) => s + p.incomeMinor, 0);
    const totalResult = points.reduce((s, p) => s + p.resultMinor, 0);
    const overall = savingsRate({ incomeMinor: totalIncome, resultMinor: totalResult });
    return (
      <>
        <p className={styles.lead}>
          <T
            id="analytics.flows.lead"
            values={{
              rate: overall === null ? '—' : fmt.percent(overall),
              result: fmt.money(totalResult),
            }}
          />
        </p>
        <Chart
          title={t('analytics.flows.title')}
          option={flows}
          table={table}
          fileName={`revenus-depenses_${end}`}
        />
        <Chart
          title={t('analytics.savingsRate')}
          option={rate}
          table={table}
          fileName={`taux-epargne_${end}`}
          height={240}
        />
      </>
    );
  }

  function renderYear(): ReactNode {
    const years = [...new Set(data.operations.map((o) => o.period.slice(0, 4)))].sort().reverse();
    const year = Number(search.year ?? years[0] ?? end.slice(0, 4));
    const periods = yearPeriods(year);
    const matrix = expenseMatrix(data.totals, data.categories, periods);
    const flows = incomeExpenseSeries(data.totals, periods);
    const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
    const income = sum(flows.map((f) => f.incomeMinor));
    const expense = sum(flows.map((f) => f.expenseMinor));
    return (
      <Section
        title={<T id="analytics.year.title" values={{ year }} />}
        actions={
          <label className={styles.inlineField}>
            <span>
              <T id="analytics.year.select" />
            </span>
            <Select value={year} onChange={(e) => setSearch({ year: e.target.value })}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </label>
        }
      >
        <dl className={styles.kpis}>
          <div>
            <dt>
              <T id="dashboard.income" />
            </dt>
            <dd>{fmt.money(income)}</dd>
          </div>
          <div>
            <dt>
              <T id="dashboard.expenses" />
            </dt>
            <dd>{fmt.money(-expense)}</dd>
          </div>
          <div>
            <dt>
              <T id="dashboard.result" />
            </dt>
            <dd>{fmt.money(income - expense)}</dd>
          </div>
          <div>
            <dt>
              <T id="analytics.savingsRate" />
            </dt>
            <dd>{income > 0 ? fmt.percent((income - expense) / income) : '—'}</dd>
          </div>
        </dl>
        <div
          className={styles.tableWrap}
          tabIndex={0}
          role="region"
          aria-label={t('analytics.year.title', { year })}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">
                  <T id="analytics.col.category" />
                </th>
                {periods.map((p) => (
                  <th key={p} scope="col" className={styles.num}>
                    {fmt.period(p, 'short')}
                  </th>
                ))}
                <th scope="col" className={styles.num}>
                  <T id="analytics.col.total" />
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.series.map((s) => (
                <tr key={s.categoryId}>
                  <th scope="row">{nameOf(s.categoryId)}</th>
                  {s.values.map((v, i) => (
                    <td key={i} className={styles.num}>
                      {v === 0 ? '—' : fmt.money(v, { sign: 'never' })}
                    </td>
                  ))}
                  <td className={styles.num}>
                    <strong>{fmt.money(s.total, { sign: 'never' })}</strong>
                  </td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <th scope="row">
                  <T id="dashboard.expenses" />
                </th>
                {matrix.totals.map((v, i) => (
                  <td key={i} className={styles.num}>
                    {v === 0 ? '—' : fmt.money(v, { sign: 'never' })}
                  </td>
                ))}
                <td className={styles.num}>{fmt.money(expense, { sign: 'never' })}</td>
              </tr>
              <tr className={styles.totalRow}>
                <th scope="row">
                  <T id="dashboard.income" />
                </th>
                {flows.map((f) => (
                  <td key={f.period} className={styles.num}>
                    {f.incomeMinor === 0 ? '—' : fmt.money(f.incomeMinor, { sign: 'never' })}
                  </td>
                ))}
                <td className={styles.num}>{fmt.money(income, { sign: 'never' })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    );
  }

  function renderLabels(): ReactNode {
    const from = addPeriods(end, -11);
    const top = topLabels(data.operations, from, end, 15);
    const option: EChartsCoreOption = {
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      tooltip: { renderMode: 'richText', trigger: 'axis', valueFormatter: tooltipValue },
      xAxis: moneyAxis,
      yAxis: { type: 'category', inverse: true, data: top.map((l) => l.label), ...axis },
      series: [
        {
          name: t('dashboard.expenses'),
          type: 'bar',
          barMaxWidth: 20,
          itemStyle: { color: dark ? '#3987e5' : '#2a78d6', borderRadius: [0, 4, 4, 0] },
          data: top.map((l) => num(-l.totalMinor)),
        },
      ],
    };
    const table: ChartTable = {
      headers: [t('entry.label'), t('analytics.col.count'), t('analytics.col.total')],
      rows: top.map((l) => [l.label, l.count, num(-l.totalMinor)]),
      display: top.map((l) => [
        l.label,
        String(l.count),
        fmt.money(-l.totalMinor, { sign: 'never' }),
      ]),
    };
    return (
      <Chart
        title={t('analytics.labels.title', { from: fmt.period(from), to: fmt.period(end) })}
        option={option}
        table={table}
        fileName={`top-libelles_${end}`}
        height={Math.max(240, top.length * 32 + 40)}
      />
    );
  }

  function renderTagsTab(): ReactNode {
    const tagId = search.tag ?? data.tags[0]?.id;
    const tag = tagId ? data.tagsById.get(tagId) : undefined;
    const periods = lastPeriods(end, 12);
    const values = tagId ? tagSeries(data.operations, tagId, periods) : [];
    if (data.tags.length === 0 || !tag) {
      return (
        <EmptyState title={<T id="analytics.tags.emptyTitle" />}>
          <T id="analytics.tags.emptyText" />
        </EmptyState>
      );
    }
    const total = values.reduce((a, b) => a + b, 0);
    const option: EChartsCoreOption = {
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      tooltip: { renderMode: 'richText', trigger: 'axis', valueFormatter: tooltipValue },
      xAxis: { type: 'category', data: periods.map((p) => fmt.period(p, 'short')), ...axis },
      yAxis: moneyAxis,
      series: [
        {
          name: `#${tag.name}`,
          type: 'bar',
          barMaxWidth: 24,
          itemStyle: {
            color: dark ? darkVariant(tag.color) : tag.color,
            borderRadius: [4, 4, 0, 0],
          },
          data: values.map((v) => num(-v)),
        },
      ],
    };
    const table: ChartTable = {
      headers: [t('analytics.col.month'), `#${tag.name}`],
      rows: periods.map((p, i) => [p, num(-(values[i] ?? 0))]),
      display: periods.map((p, i) => [
        fmt.period(p),
        fmt.money(-(values[i] ?? 0), { sign: 'never' }),
      ]),
    };
    return (
      <>
        <div className={styles.toolbar}>
          <label className={styles.inlineField}>
            <span>
              <T id="analytics.tags.select" />
            </span>
            <Select value={tag.id} onChange={(e) => setSearch({ tag: e.target.value })}>
              {data.tags.map((x) => (
                <option key={x.id} value={x.id}>
                  {`#${x.name}`}
                </option>
              ))}
            </Select>
          </label>
          <p className={styles.lead}>
            <T
              id="analytics.tags.total"
              values={{
                name: tag.name,
                total: fmt.money(-total, { sign: 'never' }),
                average: fmt.money(Math.round(-total / 12), { sign: 'never' }),
              }}
            />
          </p>
        </div>
        <Chart
          title={t('analytics.tags.title', { name: tag.name })}
          option={option}
          table={table}
          fileName={`tag-${tag.name}_${end}`}
        />
      </>
    );
  }
}
