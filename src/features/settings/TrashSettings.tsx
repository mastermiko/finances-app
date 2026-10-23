import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Operation } from '@/domain/model';
import { emptyTrash, listTrash, restoreOperations, TRASH_RETENTION_DAYS } from '@/data';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Amount, Button, Section, toast } from '@/ui';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useAppData } from '../shared/app-data';
import styles from './settings.module.css';

export default function TrashSettings(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const { trashCount, categoriesById } = useAppData();
  const [items, setItems] = useState<Operation[]>([]);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const refresh = useCallback(() => void listTrash().then(setItems), []);
  useEffect(refresh, [refresh, trashCount]);
  return (
    <div className={styles.stack}>
      <p className={styles.text}>
        <T id="trash.intro" values={{ days: TRASH_RETENTION_DAYS }} />
      </p>
      {items.length > 0 ? (
        <div className={styles.actions}>
          <Button
            icon={<RotateCcw />}
            onClick={() =>
              void restoreOperations(items.map((o) => o.id)).then(() =>
                toast(t('toast.restored', { count: items.length }), { tone: 'success' }),
              )
            }
          >
            <T id="trash.restoreAll" />
          </Button>
          <Button variant="danger" onClick={() => setConfirmEmpty(true)}>
            <T id="trash.empty" />
          </Button>
        </div>
      ) : null}
      <Section panel>
        {items.length === 0 ? (
          <p className={styles.muted}>
            <T id="trash.none" />
          </p>
        ) : (
          <ul className={styles.list} role="list">
            {items.map((op) => (
              <li key={op.id} className={styles.item}>
                <span className={styles.itemMain}>
                  <span className={styles.itemTitle}>
                    {op.label ||
                      categoriesById.get(op.categoryId ?? '')?.name ||
                      t(`kind.${op.kind}`)}
                  </span>
                  <span className={styles.itemMeta}>
                    {op.date ? fmt.date(op.date) : fmt.period(op.period)} ·{' '}
                    <T
                      id="trash.deletedOn"
                      values={{ date: fmt.dateTime(op.deletedAt ?? op.updatedAt) }}
                    />
                  </span>
                </span>
                <Amount
                  minor={op.amountMinor}
                  formatted={fmt.money(op.amountMinor)}
                  kind={op.kind}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RotateCcw />}
                  onClick={() => void restoreOperations([op.id])}
                >
                  <T id="trash.restore" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <ConfirmDialog
        open={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        title={<T id="trash.emptyTitle" />}
        confirmLabel={<T id="trash.empty" />}
        onConfirm={() => void emptyTrash().then(() => setConfirmEmpty(false))}
      >
        <p>
          <T id="trash.emptyText" values={{ count: items.length }} />
        </p>
      </ConfirmDialog>
    </div>
  );
}
