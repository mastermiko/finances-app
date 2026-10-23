import { useEffect, useState, type ReactNode } from 'react';
import { requestPersistence, storageStatus, type StorageStatus } from '@/data';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Badge, Button, Gauge, Section } from '@/ui';
import { useAppData } from '../shared/app-data';
import styles from './settings.module.css';

export default function StorageSettings(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const [status, setStatus] = useState<StorageStatus | null>(null);
  useEffect(() => {
    void storageStatus().then(setStatus);
  }, [data.operations.length]);
  const ratio = status?.ratio ?? 0;
  return (
    <div className={styles.stack}>
      <Section title={<T id="storage.usage" />} panel>
        {status?.usage !== null && status?.quota ? (
          <div className={styles.meter}>
            <Gauge
              ratio={ratio}
              level={ratio >= 0.8 ? 'over' : 'ok'}
              label={t('storage.usage')}
              valueText={t('storage.used', {
                used: fmt.bytes(status.usage ?? 0),
                quota: fmt.bytes(status.quota),
                percent: fmt.percent(ratio, 1),
              })}
            />
            <p>
              <T
                id="storage.used"
                values={{
                  used: fmt.bytes(status.usage ?? 0),
                  quota: fmt.bytes(status.quota),
                  percent: fmt.percent(ratio, 1),
                }}
              />
            </p>
          </div>
        ) : (
          <p className={styles.muted}>
            <T id="storage.unknown" />
          </p>
        )}
        <p className={styles.muted}>
          <T
            id="storage.counts"
            values={{ operations: data.operations.length, trash: data.trashCount }}
          />
        </p>
      </Section>
      <Section title={<T id="storage.persistence" />} panel>
        <p>
          {status?.persisted ? (
            <Badge tone="ok">
              <T id="storage.persisted" />
            </Badge>
          ) : (
            <Badge tone="warn">
              <T id="storage.notPersisted" />
            </Badge>
          )}
        </p>
        <p className={styles.text}>
          <T id="storage.explain" />
        </p>
        {!status?.persisted ? (
          <div>
            <Button
              onClick={() => void requestPersistence().then(() => storageStatus().then(setStatus))}
            >
              <T id="storage.request" />
            </Button>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
