import { useRef, useState, type ReactNode } from 'react';
import { Copy, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import type { Operation } from '@/domain/model';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Amount, Badge, CategoryIcon, IconButton, Menu } from '@/ui';
import { useAppData } from '../shared/app-data';
import styles from './OperationRow.module.css';

const SWIPE_THRESHOLD = 96;

export interface OperationRowProps {
  readonly op: Operation;
  readonly selected?: boolean;
  readonly selectable?: boolean;
  readonly checked?: boolean;
  readonly onToggle?: (id: string) => void;
  readonly onOpen: (op: Operation) => void;
  readonly onEdit: (op: Operation) => void;
  readonly onDuplicate: (op: Operation) => void;
  readonly onDelete: (op: Operation) => void;
  readonly showDate?: boolean;
  readonly swipe?: boolean;
  readonly posinset?: number;
  readonly setsize?: number;
}

export function OperationRow({
  op,
  selected = false,
  selectable = false,
  checked = false,
  onToggle,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
  showDate = false,
  swipe = false,
}: OperationRowProps): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const { categoriesById, accountsById, tagsById, accounts, operations } = useAppData();
  const category = op.categoryId ? categoriesById.get(op.categoryId) : undefined;
  const counterpart =
    op.transferGroupId !== null
      ? operations.find((o) => o.transferGroupId === op.transferGroupId && o.id !== op.id)
      : undefined;
  const title =
    op.label ||
    (op.kind === 'transfer'
      ? t('operation.transferTo', {
          account: accountsById.get(counterpart?.accountId ?? '')?.name ?? '',
        })
      : (category?.name ?? ''));
  const amountText = fmt.money(op.amountMinor);
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const content = (
    <div
      className={[styles.row, selected || checked ? styles.selected : ''].join(' ')}
      style={offset !== 0 ? { transform: `translateX(${offset}px)` } : undefined}
      onPointerDown={(e) => {
        if (!swipe || e.pointerType !== 'touch') return;
        start.current = { x: e.clientX, y: e.clientY, active: false };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (!s.active && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) s.active = true;
        if (s.active) setOffset(Math.max(-140, Math.min(140, dx)));
      }}
      onPointerUp={() => {
        const s = start.current;
        start.current = null;
        if (s?.active) {
          if (offset <= -SWIPE_THRESHOLD) onDelete(op);
          else if (offset >= SWIPE_THRESHOLD) onDuplicate(op);
        }
        setOffset(0);
      }}
      onPointerCancel={() => {
        start.current = null;
        setOffset(0);
      }}
    >
      {selectable ? (
        <input
          type="checkbox"
          className={styles.check}
          checked={checked}
          onChange={() => onToggle?.(op.id)}
          aria-label={t('operations.selectOne', { label: title })}
        />
      ) : null}
      <button
        type="button"
        className={styles.openButton}
        aria-label={t('operations.open', { label: title, amount: amountText })}
        aria-current={selected || undefined}
        onClick={() => (selectable ? onToggle?.(op.id) : onOpen(op))}
        onDoubleClick={() => onEdit(op)}
        onKeyDown={(e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            onDelete(op);
          } else if (e.key.toLowerCase() === 'e') {
            e.preventDefault();
            onEdit(op);
          }
        }}
      />
      {category ? (
        <CategoryIcon icon={category.icon} color={category.color} />
      ) : (
        <CategoryIcon icon={op.kind === 'transfer' ? 'repeat' : 'tag'} color="#5f6b75" />
      )}
      <div className={styles.main}>
        <span className={styles.label}>{title}</span>
        <span className={styles.meta}>
          {showDate ? <span>{op.date ? fmt.date(op.date) : t('operation.undated')}</span> : null}
          {op.label && category ? <span>{category.name}</span> : null}
          {accounts.length > 1 ? <span>{accountsById.get(op.accountId)?.name}</span> : null}
          {op.status === 'planned' ? (
            <Badge tone="accent">
              <T id="operation.planned" />
            </Badge>
          ) : null}
          {op.kind === 'expense' && op.amountMinor > 0 ? (
            <Badge tone="ok">
              <T id="operation.refund" />
            </Badge>
          ) : null}
          {op.tagIds.map((id) => {
            const tag = tagsById.get(id);
            return tag ? <Badge key={id}>{`#${tag.name}`}</Badge> : null;
          })}
        </span>
      </div>
      <Amount
        minor={op.amountMinor}
        formatted={amountText}
        kind={op.kind}
        planned={op.status === 'planned'}
        className={styles.amount}
      />
      <span className={styles.menu}>
        <Menu
          items={[
            {
              id: 'edit',
              label: t('common.edit'),
              icon: <Pencil aria-hidden="true" />,
              onSelect: () => onEdit(op),
            },
            {
              id: 'duplicate',
              label: t('common.duplicate'),
              icon: <Copy aria-hidden="true" />,
              onSelect: () => onDuplicate(op),
            },
            {
              id: 'delete',
              label: t('common.delete'),
              icon: <Trash2 aria-hidden="true" />,
              danger: true,
              onSelect: () => onDelete(op),
            },
          ]}
          trigger={(props) => (
            <IconButton
              label={t('operations.actionsFor', { label: title })}
              icon={<MoreVertical />}
              {...props}
            />
          )}
        />
      </span>
    </div>
  );

  if (!swipe) return content;
  // Stable structure while swiping (no remount during the gesture).
  return (
    <div className={styles.swipeWrap}>
      {offset !== 0 ? (
        <div
          className={[styles.swipeHint, offset > 0 ? styles.swipeHintDuplicate : ''].join(' ')}
          aria-hidden="true"
        >
          {offset > 0 ? <T id="common.duplicate" /> : <T id="common.delete" />}
        </div>
      ) : null}
      {content}
    </div>
  );
}
