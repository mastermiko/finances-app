import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { Download, FileSpreadsheet, Table2 } from 'lucide-react';
import { T, useT } from '@/i18n';
import { Button } from '@/ui';
import { tableToCsv } from '@/io/csv/csv';
import { downloadBlob } from '../shared/download';
import { echarts } from './echarts';
import styles from './AnalyticsPage.module.css';

export interface ChartTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly (string | number)[])[];
  /** Display version of the rows (formatted amounts) */
  readonly display: readonly (readonly string[])[];
}

export function isDarkTheme(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * ECharts canvas chart with an accessible data table, PNG and CSV export.
 * Tooltips use the canvas "richText" mode: no HTML is injected (Trusted Types).
 */
export function Chart({
  title,
  description,
  option,
  table,
  fileName,
  height = 320,
}: {
  readonly title: string;
  readonly description?: string;
  readonly option: EChartsCoreOption;
  readonly table: ChartTable;
  readonly fileName: string;
  readonly height?: number;
}): ReactNode {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const instance = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const ink = cssVar('--color-ink-secondary');
    chart.current?.setOption(
      {
        aria: { enabled: true, label: { description: description ?? title } },
        animation: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        textStyle: { fontFamily: cssVar('--font-sans'), color: ink },
        tooltip: { renderMode: 'richText', trigger: 'axis', axisPointer: { type: 'shadow' } },
        ...option,
      },
      { notMerge: true },
    );
  }, [option, title, description]);

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.figcaption}>
        <span className={styles.chartTitle}>{title}</span>
        <span className={styles.chartActions}>
          <Button
            size="sm"
            variant="ghost"
            icon={<Table2 />}
            aria-pressed={showTable}
            onClick={() => setShowTable((s) => !s)}
          >
            <T id="analytics.showData" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Download />}
            onClick={() => {
              const url = chart.current?.getDataURL({
                type: 'png',
                pixelRatio: 2,
                backgroundColor: cssVar('--color-surface'),
              });
              if (!url) return;
              const bytes = Uint8Array.from(atob(url.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
              downloadBlob(bytes, `${fileName}.png`, 'image/png');
            }}
            aria-label={t('analytics.exportPngLabel', { title })}
          >
            <T id="analytics.png" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<FileSpreadsheet />}
            onClick={() =>
              downloadBlob(
                tableToCsv(table.headers, table.rows),
                `${fileName}.csv`,
                'text/csv;charset=utf-8',
              )
            }
            aria-label={t('analytics.exportCsvLabel', { title })}
          >
            <T id="analytics.csv" />
          </Button>
        </span>
      </figcaption>
      <div
        ref={ref}
        className={styles.canvas}
        style={{ height }}
        role="img"
        aria-label={description ?? title}
      />
      {showTable ? (
        <div
          className={styles.tableWrap}
          tabIndex={0}
          role="region"
          aria-label={t('analytics.dataOf', { title })}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                {table.headers.map((h, i) => (
                  <th key={i} scope="col" className={i > 0 ? styles.num : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.display.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) =>
                    c === 0 ? (
                      <th key={c} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={c} className={styles.num}>
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
