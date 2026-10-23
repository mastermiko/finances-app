import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Download, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  backupText,
  createBackup,
  deleteBackup,
  listBackups,
  replaceWithSnapshot,
  type BackupInfo,
} from '@/data';
import { parseExportJson } from '@/io/json/export-json';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Button, IconButton, Section, toast } from '@/ui';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { downloadBlob } from '../shared/download';
import { reportError } from '../shared/actions';
import { APP_VERSION } from '../io/export-actions';
import styles from './settings.module.css';

export default function BackupsSettings(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [restoring, setRestoring] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => void listBackups().then(setBackups), []);
  useEffect(refresh, [refresh]);

  return (
    <div className={styles.stack}>
      <p className={styles.text}>
        <T id="backups.intro" />
      </p>
      <div>
        <Button
          icon={<Plus />}
          onClick={() =>
            void createBackup('manual', APP_VERSION)
              .then(() => {
                refresh();
                toast(t('backups.created'), { tone: 'success' });
              })
              .catch((e: unknown) => reportError(e, t))
          }
        >
          <T id="backups.create" />
        </Button>
      </div>
      <Section panel>
        {backups.length === 0 ? (
          <p className={styles.muted}>
            <T id="backups.empty" />
          </p>
        ) : (
          <ul className={styles.list} role="list">
            {backups.map((b) => (
              <li key={b.id} className={styles.item}>
                <span className={styles.itemMain}>
                  <span className={styles.itemTitle}>{fmt.dateTime(b.createdAt)}</span>
                  <span className={styles.itemMeta}>
                    {t(`backups.reason.${b.reason}`)} ·{' '}
                    <T id="data.historyCount" values={{ count: b.operationCount }} /> ·{' '}
                    {fmt.bytes(b.size)}
                  </span>
                </span>
                <span className={styles.actions}>
                  <IconButton
                    label={t('backups.download')}
                    icon={<Download />}
                    onClick={() =>
                      void backupText(b.id).then((text) => {
                        if (text)
                          downloadBlob(
                            text,
                            `finances_sauvegarde_${b.createdAt.slice(0, 16).replace(/[:T]/g, '-')}.json`,
                            'application/json',
                          );
                      })
                    }
                  />
                  <Button size="sm" icon={<RotateCcw />} onClick={() => setRestoring(b)}>
                    <T id="backups.restore" />
                  </Button>
                  <IconButton
                    label={t('common.delete')}
                    icon={<Trash2 />}
                    onClick={() => void deleteBackup(b.id).then(refresh)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <ConfirmDialog
        open={restoring !== null}
        busy={busy}
        onClose={() => setRestoring(null)}
        title={<T id="backups.restoreTitle" />}
        confirmLabel={<T id="backups.restore" />}
        onConfirm={() => {
          if (!restoring) return;
          setBusy(true);
          void (async () => {
            try {
              const text = await backupText(restoring.id);
              const parsed = text ? await parseExportJson(text) : null;
              if (!parsed?.ok) throw new Error('Invalid backup');
              await createBackup('restore', APP_VERSION);
              await replaceWithSnapshot(parsed.data);
              toast(t('backups.restored'), { tone: 'success' });
              setRestoring(null);
              refresh();
            } catch (e) {
              reportError(e, t);
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <p>
          <T
            id="backups.restoreText"
            values={{ date: restoring ? fmt.dateTime(restoring.createdAt) : '' }}
          />
        </p>
      </ConfirmDialog>
    </div>
  );
}
