import type { ReactNode } from 'react';
import { Copy, Pencil, Trash2, X } from 'lucide-react';
import type { Operation } from '@/domain/model';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Amount, Button, CategoryIcon, IconButton } from '@/ui';
import { useAppData } from '../shared/app-data';
import styles from './OperationDetail.module.css';

export function OperationDetail({
  op,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  readonly op: Operation;
  readonly onClose: () => void;
  readonly onEdit: (op: Operation) => void;
  readonly onDuplicate: (op: Operation) => void;
  readonly onDelete: (op: Operation) => void;
}): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const { categoriesById, accountsById, tagsById, importBatches } = useAppData();
  const category = op.categoryId ? categoriesById.get(op.categoryId) : undefined;
  const batch = op.importBatchId ? importBatches.find((b) => b.id === op.importBatchId) : undefined;
  const rows: [ReactNode, ReactNode][] = [
    [<T key="k" id="detail.date" />, op.date ? fmt.dateLong(op.date) : t('operation.undated')],
    [<T key="k" id="detail.period" />, fmt.period(op.period)],
    [<T key="k" id="detail.kind" />, t(`kind.${op.kind}`)],
    [<T key="k" id="detail.account" />, accountsById.get(op.accountId)?.name ?? ''],
    [<T key="k" id="detail.status" />, t(`status.${op.status}`)],
  ];
  if (op.amountExpression)
    rows.push([<T key="k" id="detail.expression" />, <code key="v">{op.amountExpression}</code>]);
  if (op.tagIds.length > 0)
    rows.push([
      <T key="k" id="detail.tags" />,
      op.tagIds.map((id) => `#${tagsById.get(id)?.name ?? '?'}`).join(' '),
    ]);
  if (batch) rows.push([<T key="k" id="detail.import" />, batch.fileName]);
  rows.push([<T key="k" id="detail.updated" />, fmt.dateTime(op.updatedAt)]);
  return (
    <section className={styles.panel} aria-labelledby="op-detail-title">
      <div className={styles.head}>
        {category ? <CategoryIcon icon={category.icon} color={category.color} /> : null}
        <div className={styles.titleBlock}>
          <h2 id="op-detail-title" className={styles.title}>
            {op.label || category?.name || t(`kind.${op.kind}`)}
          </h2>
          {category && op.label ? <p className={styles.sub}>{category.name}</p> : null}
        </div>
        <IconButton label={t('common.close')} icon={<X />} onClick={onClose} />
      </div>
      <p className={styles.amount}>
        <Amount
          minor={op.amountMinor}
          formatted={fmt.money(op.amountMinor)}
          kind={op.kind}
          planned={op.status === 'planned'}
        />
      </p>
      <dl className={styles.list}>
        {rows.map(([k, v], i) => (
          <div key={i} className={styles.item}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {op.note ? <p className={styles.note}>{op.note}</p> : null}
      <div className={styles.actions}>
        <Button variant="primary" icon={<Pencil />} onClick={() => onEdit(op)}>
          <T id="common.edit" />
        </Button>
        <Button icon={<Copy />} onClick={() => onDuplicate(op)}>
          <T id="common.duplicate" />
        </Button>
        <Button variant="ghost" icon={<Trash2 />} onClick={() => onDelete(op)}>
          <T id="common.delete" />
        </Button>
      </div>
    </section>
  );
}
