import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Trash2 } from 'lucide-react';
import { SCHEMA_VERSION } from '@/domain/model';
import { clearErrorLog, queries, readErrorLog, type ErrorEntry } from '@/data';
import { T } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Button, Section } from '@/ui';
import { downloadBlob } from '../shared/download';
import styles from './settings.module.css';

export default function AboutSettings(): ReactNode {
  const fmt = useFormat();
  const meta = useLiveQuery(queries.meta);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  useEffect(() => {
    void readErrorLog().then(setErrors);
  }, []);
  return (
    <div className={styles.stack}>
      <Section panel>
        <dl className={styles.list}>
          <div className={styles.item}>
            <dt className={styles.itemMain}>
              <T id="about.version" />
            </dt>
            <dd className={styles.code}>{__APP_VERSION__}</dd>
          </div>
          <div className={styles.item}>
            <dt className={styles.itemMain}>
              <T id="about.schema" />
            </dt>
            <dd className={styles.code}>{`v${meta?.schemaVersion ?? SCHEMA_VERSION}`}</dd>
          </div>
          <div className={styles.item}>
            <dt className={styles.itemMain}>
              <T id="about.created" />
            </dt>
            <dd>{meta ? fmt.dateTime(meta.createdAt) : '—'}</dd>
          </div>
          <div className={styles.item}>
            <dt className={styles.itemMain}>
              <T id="about.license" />
            </dt>
            <dd className={styles.code}>{__APP_LICENSE__}</dd>
          </div>
        </dl>
        <p className={styles.text}>
          <T id="about.text" />
        </p>
      </Section>
      <Section title={<T id="about.errorsTitle" />} panel>
        <p className={styles.text}>
          <T id="about.errorsText" values={{ count: errors.length }} />
        </p>
        <div className={styles.actions}>
          <Button
            icon={<Download />}
            disabled={errors.length === 0}
            onClick={() =>
              downloadBlob(
                JSON.stringify(errors, null, 2),
                'finances_journal-erreurs.json',
                'application/json',
              )
            }
          >
            <T id="about.errorsExport" />
          </Button>
          <Button
            variant="ghost"
            icon={<Trash2 />}
            disabled={errors.length === 0}
            onClick={() => void clearErrorLog().then(() => setErrors([]))}
          >
            <T id="about.errorsClear" />
          </Button>
        </div>
      </Section>
    </div>
  );
}
