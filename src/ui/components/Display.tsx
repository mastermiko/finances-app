import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import { IconButton } from './Button';
import styles from './Display.module.css';

/** Signed amount with icon: the sign and the arrow carry the meaning, not colour alone. */
export function Amount({
  minor,
  formatted,
  kind,
  planned = false,
  showIcon = true,
  className,
  srLabel,
}: {
  readonly minor: number;
  readonly formatted: string;
  readonly kind?: 'expense' | 'income' | 'transfer';
  readonly planned?: boolean;
  readonly showIcon?: boolean;
  readonly className?: string | undefined;
  readonly srLabel?: string;
}): ReactNode {
  const tone = kind === 'transfer' ? 'transfer' : minor > 0 ? 'income' : 'expense';
  const Icon = kind === 'transfer' ? ArrowLeftRight : minor > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={[styles.amount, styles[tone], planned ? styles.planned : '', className ?? ''].join(
        ' ',
      )}
    >
      {showIcon && minor !== 0 ? <Icon aria-hidden="true" /> : null}
      <span aria-hidden={srLabel ? true : undefined}>{formatted}</span>
      {srLabel ? <span className="visually-hidden">{srLabel}</span> : null}
    </span>
  );
}

/** Horizontal gauge, exposed as an ARIA meter. `marker` = elapsed share of the month. */
export function Gauge({
  ratio,
  level,
  label,
  valueText,
  marker,
}: {
  readonly ratio: number;
  readonly level: 'ok' | 'warn' | 'over' | 'none';
  readonly label: string;
  readonly valueText: string;
  readonly marker?: number;
}): ReactNode {
  const clamped = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 1;
  return (
    <div
      className={styles.gauge}
      data-level={level}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuetext={valueText}
    >
      <div className={styles.gaugeFill} style={{ width: `${clamped * 100}%` }} />
      {marker !== undefined ? (
        <span
          className={styles.gaugeMarker}
          style={{ left: `calc(${Math.min(1, Math.max(0, marker)) * 100}% - 1px)` }}
        />
      ) : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  icon,
}: {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'ok';
  readonly icon?: ReactNode;
}): ReactNode {
  const toneClass = {
    neutral: '',
    accent: styles.badgeAccent,
    warn: styles.badgeWarn,
    danger: styles.badgeDanger,
    ok: styles.badgeOk,
  }[tone];
  return (
    <span className={[styles.badge, toneClass].join(' ')}>
      {icon}
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
  centered = false,
  headingLevel = 2,
}: {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly centered?: boolean;
  /** 1 when the empty state is the whole screen (it then carries the page title). */
  readonly headingLevel?: 1 | 2;
}): ReactNode {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className={[styles.empty, centered ? styles.emptyCentered : ''].join(' ')}>
      {icon ? <span className={styles.emptyIcon}>{icon}</span> : null}
      <Heading className={styles.emptyTitle}>{title}</Heading>
      {children ? <div className={styles.emptyText}>{children}</div> : null}
      {actions ? <div className={styles.emptyActions}>{actions}</div> : null}
    </div>
  );
}

export function Skeleton({
  width = '100%',
  height = 16,
}: {
  readonly width?: string | number;
  readonly height?: number;
}): ReactNode {
  return <span className={styles.skeleton} style={{ width, height }} aria-hidden="true" />;
}

/** Toggletip: contextual help revealed on click, announced by screen readers. */
export function InfoTip({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span className={styles.tipWrap} ref={wrap}>
      <button
        type="button"
        className={styles.tipButton}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <Info aria-hidden="true" />
      </button>
      <span id={id} role="status">
        {open ? <span className={styles.tipBubble}>{children}</span> : null}
      </span>
    </span>
  );
}

export function Section({
  title,
  actions,
  children,
  headingLevel = 2,
  id,
  panel = false,
}: {
  readonly title?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly headingLevel?: 2 | 3;
  readonly id?: string;
  readonly panel?: boolean;
}): ReactNode {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const headingId = useId();
  return (
    <section
      className={[styles.section, panel ? styles.panel : ''].join(' ')}
      aria-labelledby={title ? headingId : undefined}
      id={id}
    >
      {title || actions ? (
        <div className={styles.sectionHeader}>
          {title ? (
            <Heading id={headingId} className={styles.sectionTitle}>
              {title}
            </Heading>
          ) : (
            <span />
          )}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface TabItem<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
}

/** Tabs that drive navigation state (roving focus with arrow keys). */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  idPrefix,
}: {
  readonly label: string;
  readonly items: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly idPrefix: string;
}): ReactNode {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div role="tablist" aria-label={label} className={styles.tabs}>
      {items.map((item, i) => (
        <button
          key={item.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${item.value}`}
          aria-controls={`${idPrefix}-panel`}
          aria-selected={item.value === value}
          tabIndex={item.value === value ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(item.value)}
          onKeyDown={(e) => {
            const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (delta === 0) return;
            e.preventDefault();
            const next = (i + delta + items.length) % items.length;
            const target = items[next];
            if (target) {
              onChange(target.value);
              refs.current[next]?.focus();
            }
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Previous / next month control; also supports horizontal swipe on its parent through `onSwipe`. */
export function MonthSwitcher({
  label,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  onLabelClick,
  labelHint,
}: {
  readonly label: string;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onLabelClick?: () => void;
  readonly labelHint?: string;
}): ReactNode {
  return (
    <div className={styles.month}>
      <IconButton label={previousLabel} icon={<ChevronLeft />} onClick={onPrevious} />
      {onLabelClick ? (
        <button
          type="button"
          className={styles.monthLabelButton}
          onClick={onLabelClick}
          title={labelHint}
          aria-live="polite"
        >
          {label}
        </button>
      ) : (
        <span className={styles.monthLabel} aria-live="polite">
          {label}
        </span>
      )}
      <IconButton label={nextLabel} icon={<ChevronRight />} onClick={onNext} />
    </div>
  );
}

export { styles as displayStyles };
