import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDownUp,
  CheckCheck,
  CircleCheck,
  Download,
  Filter,
  ListChecks,
  ListX,
  Search,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react';
import { PageHeader } from '@/app/Layout';
import {
  Amount,
  Badge,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  MonthSwitcher,
  Select,
  TextInput,
} from '@/ui';
import { useFormat } from '@/i18n/format';
import { T, useT } from '@/i18n';
import type { Operation } from '@/domain/model';
import { createOperationPredicate, selectionTotals } from '@/domain/operations/operations';
import { addPeriods } from '@/domain/common/civil-date';
import { useAppData } from '../shared/app-data';
import { useUi } from '../shared/ui-store';
import {
  bulkUpdateWithUndo,
  confirmWithToast,
  deleteWithUndo,
  duplicateWithUndo,
} from '../shared/actions';
import { useDebounced, useMediaQuery, WIDE_QUERY } from '../shared/hooks';
import { CategoryPicker } from '../shared/CategoryPicker';
import { exportOperations } from '../io/export-actions';
import { measure } from '../shared/perf';
import { OperationRow } from './OperationRow';
import { OperationDetail } from './OperationDetail';
import { FiltersDialog } from './FiltersDialog';
import { buildRows } from './rows';
import {
  activeFilterCount,
  PRESETS,
  splitList,
  toFilter,
  type OperationsSearch,
  type Preset,
} from './search';
import styles from './OperationsPage.module.css';

export function OperationsPage(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const search = useSearch({ from: '/operations' });
  const navigate = useNavigate({ from: '/operations' });
  const openEntry = useUi((s) => s.openEntry);
  const wide = useMediaQuery(WIDE_QUERY);
  const [query, setQuery] = useState(search.q ?? '');
  const debouncedQuery = useDebounced(query, 100);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [recatOpen, setRecatOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [recatTarget, setRecatTarget] = useState<string | null>(null);

  const setSearch = (patch: Partial<OperationsSearch>): void => {
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  };

  const preset: Preset = search.preset ?? (search.from || search.to ? 'custom' : 'month');
  const filter = useMemo(
    () => toFilter({ ...search, q: debouncedQuery || undefined }, data.currentPeriod),
    [search, debouncedQuery, data.currentPeriod],
  );
  const direction = search.sort ?? 'asc';
  const multiMonth = filter.periodFrom !== filter.periodTo || filter.periodFrom === undefined;
  // Filter + sort + totals: measured as one step (spec: < 100 ms on 50 000 operations).
  const { filtered, rows, totals } = useMemo(
    () =>
      measure('finances:filter', () => {
        const predicate = createOperationPredicate(filter, data.categories);
        const matching = data.operations.filter(predicate);
        return {
          filtered: matching,
          rows: buildRows(matching, direction, multiMonth),
          totals: selectionTotals(matching),
        };
      }),
    [data.operations, data.categories, filter, direction, multiMonth],
  );
  const selectedOps = useMemo(
    () => filtered.filter((o) => selected.has(o.id)),
    [filtered, selected],
  );
  const selectedTotals = useMemo(() => selectionTotals(selectedOps), [selectedOps]);

  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // Measured after every render on purpose: the toolbar and chips above the list change height.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const top = listRef.current ? listRef.current.getBoundingClientRect().top + window.scrollY : 0;
    if (Math.abs(top - scrollMargin) > 1) setScrollMargin(top);
  });
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    scrollMargin,
    estimateSize: (i) => (rows[i]?.type === 'op' ? 68 : rows[i]?.type === 'month' ? 56 : 40),
    overscan: 8,
    getItemKey: (i) => rows[i]?.key ?? i,
  });

  const monthPeriod = filter.periodFrom ?? data.currentPeriod;
  const selectedOp = search.sel ? data.operations.find((o) => o.id === search.sel) : undefined;

  const toggle = (id: string): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handlers = {
    onOpen: (op: Operation) => (wide ? setSearch({ sel: op.id }) : openEntry({ editId: op.id })),
    onEdit: (op: Operation) => openEntry({ editId: op.id }),
    onDuplicate: (op: Operation) => void duplicateWithUndo([op.id], t),
    onDelete: (op: Operation) => {
      if (search.sel === op.id) setSearch({ sel: undefined });
      void deleteWithUndo([op.id], t);
    },
  };

  const filterCount = activeFilterCount(search);
  const chips = buildChips(search, data, t, fmt);

  return (
    <div className={wide && selectedOp ? styles.split : undefined}>
      <div className={styles.listColumn}>
        <PageHeader
          title={<T id="operations.title" />}
          actions={
            <>
              <IconButton
                label={direction === 'asc' ? t('operations.sortDesc') : t('operations.sortAsc')}
                icon={<ArrowDownUp />}
                aria-pressed={direction === 'desc'}
                onClick={() => setSearch({ sort: direction === 'asc' ? 'desc' : 'asc' })}
              />
              <IconButton
                label={selecting ? t('operations.selectStop') : t('operations.selectStart')}
                icon={selecting ? <ListX /> : <ListChecks />}
                aria-pressed={selecting}
                onClick={() => {
                  setSelecting((s) => !s);
                  setSelected(new Set());
                }}
              />
              <IconButton
                label={t('operations.exportCsv')}
                icon={<Download />}
                onClick={() => void exportOperations('csv', filtered, data, t)}
              />
            </>
          }
        />

        <div className={styles.toolbar} role="search">
          <label className={styles.searchBox}>
            <Search aria-hidden="true" />
            <span className="visually-hidden">
              <T id="operations.search" />
            </span>
            <TextInput
              type="search"
              placeholder={t('operations.searchPlaceholder')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearch({ q: e.target.value || undefined });
              }}
            />
          </label>
          <div className={styles.toolbarRow}>
            <label className={styles.presetLabel}>
              <span className="visually-hidden">
                <T id="operations.period" />
              </span>
              <Select
                value={preset}
                onChange={(e) => {
                  const value = e.target.value as Preset;
                  setSearch(
                    value === 'custom'
                      ? {
                          preset: value,
                          from: filter.periodFrom ?? data.currentPeriod,
                          to: filter.periodTo ?? data.currentPeriod,
                        }
                      : { preset: value, from: undefined, to: undefined },
                  );
                }}
              >
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {t(`operations.preset.${p}`)}
                  </option>
                ))}
              </Select>
            </label>
            <Button icon={<Filter />} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
              <T id="operations.filters" />
              {filterCount > 0 ? <Badge tone="accent">{filterCount}</Badge> : null}
            </Button>
          </div>
          {preset === 'month' ? (
            <MonthSwitcher
              label={fmt.period(monthPeriod)}
              previousLabel={t('common.previousMonth')}
              nextLabel={t('common.nextMonth')}
              onPrevious={() =>
                setSearch({ preset: 'month', from: addPeriods(monthPeriod, -1), to: undefined })
              }
              onNext={() =>
                setSearch({ preset: 'month', from: addPeriods(monthPeriod, 1), to: undefined })
              }
            />
          ) : null}
        </div>

        {chips.length > 0 ? (
          <ul className={styles.chips} aria-label={t('operations.activeFilters')}>
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  className={styles.chip}
                  onClick={() => setSearch(chip.remove)}
                  aria-label={t('operations.removeFilter', { name: chip.label })}
                >
                  {chip.label}
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
            <li>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSearch({
                    cat: undefined,
                    acc: undefined,
                    kind: undefined,
                    status: undefined,
                    tag: undefined,
                    min: undefined,
                    max: undefined,
                    undated: undefined,
                  })
                }
              >
                <T id="operations.clearFilters" />
              </Button>
            </li>
          </ul>
        ) : null}

        <p className={styles.summary} aria-live="polite">
          <span>
            <T id="operations.count" values={{ count: totals.count }} />
          </span>
          <span className={styles.summaryTotal}>
            <T id="operations.total" />{' '}
            <Amount
              minor={totals.totalMinor}
              formatted={fmt.money(totals.totalMinor)}
              showIcon={false}
            />
          </span>
          <span className={styles.summaryDetail}>
            <T
              id="operations.totalDetail"
              values={{
                income: fmt.money(totals.incomeMinor),
                expense: fmt.money(-totals.expenseMinor),
              }}
            />
          </span>
        </p>

        {selecting ? (
          <div className={styles.bulkBar} role="region" aria-label={t('operations.bulkActions')}>
            <p>
              <T id="operations.selected" values={{ count: selectedOps.length }} />{' '}
              {selectedOps.length > 0 ? (
                <Amount
                  minor={selectedTotals.totalMinor}
                  formatted={fmt.money(selectedTotals.totalMinor)}
                  showIcon={false}
                />
              ) : null}
            </p>
            <div className={styles.bulkActions}>
              <Button
                size="sm"
                variant="ghost"
                icon={<CheckCheck />}
                onClick={() => setSelected(new Set(filtered.map((o) => o.id)))}
              >
                <T id="operations.selectAll" />
              </Button>
              <Button
                size="sm"
                disabled={selectedOps.length === 0}
                onClick={() => setRecatOpen(true)}
              >
                <T id="operations.recategorize" />
              </Button>
              <Button
                size="sm"
                icon={<TagIcon />}
                disabled={selectedOps.length === 0}
                onClick={() => setTagOpen(true)}
              >
                <T id="operations.addTag" />
              </Button>
              {selectedOps.some((o) => o.status === 'planned') ? (
                <Button
                  size="sm"
                  icon={<CircleCheck />}
                  onClick={() =>
                    void confirmWithToast(
                      selectedOps.filter((o) => o.status === 'planned').map((o) => o.id),
                      t,
                    )
                  }
                >
                  <T id="operations.confirm" />
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 />}
                disabled={selectedOps.length === 0}
                onClick={() => {
                  void deleteWithUndo(
                    selectedOps.map((o) => o.id),
                    t,
                  );
                  setSelected(new Set());
                }}
              >
                <T id="common.delete" />
              </Button>
            </div>
          </div>
        ) : null}

        {rows.length === 0 ? (
          data.operations.length === 0 ? (
            <EmptyState
              title={<T id="operations.empty.title" />}
              actions={
                <>
                  <Button variant="primary" onClick={() => openEntry()}>
                    <T id="empty.firstOperation" />
                  </Button>
                  <Button
                    onClick={() =>
                      void navigate({ to: '/settings/$section', params: { section: 'import' } })
                    }
                  >
                    <T id="empty.importWorkbook" />
                  </Button>
                </>
              }
            >
              <T id="operations.empty.text" />
            </EmptyState>
          ) : (
            <EmptyState title={<T id="operations.noMatch.title" />}>
              <T id="operations.noMatch.text" />
            </EmptyState>
          )
        ) : (
          <div
            ref={listRef}
            className={styles.list}
            style={{ height: virtualizer.getTotalSize() }}
            role="list"
            aria-label={t('operations.listLabel')}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className={styles.virtualRow}
                  style={{
                    transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                  }}
                  role="listitem"
                >
                  {row.type === 'month' ? (
                    <h2 className={styles.monthHeader}>
                      <span>{fmt.period(row.period)}</span>
                      <Amount
                        minor={row.totals.totalMinor}
                        formatted={fmt.money(row.totals.totalMinor)}
                        showIcon={false}
                      />
                    </h2>
                  ) : row.type === 'day' ? (
                    <h3 className={styles.dayHeader}>
                      <span>
                        {row.date ? fmt.weekdayDate(row.date) : t('operations.undatedGroup')}
                      </span>
                      <span className={styles.dayTotal}>{fmt.money(row.totalMinor)}</span>
                    </h3>
                  ) : (
                    <OperationRow
                      op={row.op}
                      selected={search.sel === row.op.id}
                      selectable={selecting}
                      checked={selected.has(row.op.id)}
                      onToggle={toggle}
                      swipe={!wide && !selecting}
                      {...handlers}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {wide && selectedOp ? (
        <aside className={styles.detailColumn} aria-label={t('operations.detail')}>
          <OperationDetail
            op={selectedOp}
            onClose={() => setSearch({ sel: undefined })}
            {...handlers}
          />
        </aside>
      ) : null}

      <FiltersDialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        search={search}
        onApply={(patch) => setSearch(patch)}
      />

      <Dialog
        open={recatOpen}
        onClose={() => setRecatOpen(false)}
        title={<T id="operations.recategorizeTitle" values={{ count: selectedOps.length }} />}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button onClick={() => setRecatOpen(false)}>
              <T id="common.cancel" />
            </Button>
            <Button
              variant="primary"
              disabled={!recatTarget}
              onClick={() => {
                if (!recatTarget) return;
                const target = data.categoriesById.get(recatTarget);
                const ids = selectedOps.filter((o) => o.kind === target?.kind).map((o) => o.id);
                void bulkUpdateWithUndo(
                  ids,
                  { categoryId: recatTarget },
                  t('toast.recategorized', { count: ids.length, name: target?.name ?? '' }),
                  t,
                );
                setRecatOpen(false);
              }}
            >
              <T id="operations.apply" />
            </Button>
          </>
        }
      >
        <CategoryPicker
          name="recat"
          legend={<T id="entry.category" />}
          categories={data.categories.filter(
            (c) => !c.archived && selectedOps.some((o) => o.kind === c.kind),
          )}
          byId={data.categoriesById}
          value={recatTarget}
          onChange={setRecatTarget}
          limit={50}
        />
      </Dialog>

      <Dialog
        open={tagOpen}
        onClose={() => setTagOpen(false)}
        title={<T id="operations.addTagTitle" />}
        closeLabel={t('common.close')}
      >
        {data.tags.length === 0 ? (
          <p>
            <T id="operations.noTags" />
          </p>
        ) : (
          <ul role="list" className={styles.tagChoices}>
            {data.tags.map((tag) => (
              <li key={tag.id}>
                <Button
                  block
                  onClick={() => {
                    void bulkUpdateWithUndo(
                      selectedOps.map((o) => o.id),
                      { addTagIds: [tag.id] },
                      t('toast.tagged', { count: selectedOps.length, name: tag.name }),
                      t,
                    );
                    setTagOpen(false);
                  }}
                >
                  {`#${tag.name}`}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}

interface Chip {
  readonly key: string;
  readonly label: string;
  readonly remove: Partial<OperationsSearch>;
}

function buildChips(
  search: OperationsSearch,
  data: ReturnType<typeof useAppData>,
  t: ReturnType<typeof useT>,
  fmt: ReturnType<typeof useFormat>,
): Chip[] {
  const chips: Chip[] = [];
  const without = (list: string | undefined, id: string): string | undefined => {
    const next = splitList(list).filter((x) => x !== id);
    return next.length > 0 ? next.join(',') : undefined;
  };
  for (const id of splitList(search.cat)) {
    chips.push({
      key: `c${id}`,
      label: data.categoriesById.get(id)?.name ?? '?',
      remove: { cat: without(search.cat, id) },
    });
  }
  for (const id of splitList(search.acc)) {
    chips.push({
      key: `a${id}`,
      label: data.accountsById.get(id)?.name ?? '?',
      remove: { acc: without(search.acc, id) },
    });
  }
  for (const id of splitList(search.kind)) {
    chips.push({
      key: `k${id}`,
      label: t(`kind.${id as 'expense' | 'income' | 'transfer'}`),
      remove: { kind: without(search.kind, id) },
    });
  }
  for (const id of splitList(search.status)) {
    chips.push({
      key: `s${id}`,
      label: t(`status.${id as 'cleared' | 'planned'}`),
      remove: { status: without(search.status, id) },
    });
  }
  for (const id of splitList(search.tag)) {
    chips.push({
      key: `t${id}`,
      label: `#${data.tagsById.get(id)?.name ?? '?'}`,
      remove: { tag: without(search.tag, id) },
    });
  }
  if (search.min !== undefined)
    chips.push({
      key: 'min',
      label: t('filters.minChip', { amount: fmt.money(search.min, { sign: 'never' }) }),
      remove: { min: undefined },
    });
  if (search.max !== undefined)
    chips.push({
      key: 'max',
      label: t('filters.maxChip', { amount: fmt.money(search.max, { sign: 'never' }) }),
      remove: { max: undefined },
    });
  if (search.undated)
    chips.push({ key: 'undated', label: t('filters.undatedOnly'), remove: { undated: undefined } });
  return chips;
}
