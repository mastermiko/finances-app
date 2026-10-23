import { useState, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, Section } from '@/ui';
import { T, useT } from '@/i18n';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { exportJson } from '../io/export-actions';
import { deleteEverything } from './wipe';
import styles from './settings.module.css';

export default function PrivacySettings(): ReactNode {
  const t = useT();
  const [step, setStep] = useState<'idle' | 'export' | 'confirm'>('idle');
  const [busy, setBusy] = useState(false);
  return (
    <div className={styles.stack}>
      <Section title={<T id="privacy.whereTitle" />} panel>
        <div className={styles.text}>
          <p>
            <ShieldCheck
              aria-hidden="true"
              style={{ display: 'inline', width: 18, height: 18, verticalAlign: -3 }}
            />{' '}
            <T id="privacy.where" />
          </p>
          <p>
            <T id="privacy.noServer" />
          </p>
          <p>
            <T id="privacy.purge" />
          </p>
        </div>
      </Section>
      <Section title={<T id="privacy.exportTitle" />} panel>
        <p className={styles.text}>
          <T id="privacy.export" />
        </p>
      </Section>
      <Section title={<T id="privacy.eraseTitle" />} panel>
        <p className={styles.text}>
          <T id="privacy.erase" />
        </p>
        <div>
          <Button variant="danger" onClick={() => setStep('export')}>
            <T id="privacy.eraseButton" />
          </Button>
        </div>
      </Section>
      <ConfirmDialog
        open={step === 'export'}
        danger={false}
        onClose={() => setStep('idle')}
        title={<T id="privacy.exportFirstTitle" />}
        confirmLabel={<T id="privacy.exportFirst" />}
        onConfirm={() => void exportJson(t).then((ok) => ok && setStep('confirm'))}
      >
        <p>
          <T id="privacy.exportFirstText" />
        </p>
        <Button variant="ghost" onClick={() => setStep('confirm')}>
          <T id="privacy.skipExport" />
        </Button>
      </ConfirmDialog>
      <ConfirmDialog
        open={step === 'confirm'}
        busy={busy}
        onClose={() => setStep('idle')}
        title={<T id="privacy.confirmTitle" />}
        confirmWord={t('privacy.confirmWord')}
        confirmLabel={<T id="privacy.eraseButton" />}
        onConfirm={() => {
          setBusy(true);
          void deleteEverything();
        }}
      >
        <p>
          <T id="privacy.confirmText" />
        </p>
      </ConfirmDialog>
    </div>
  );
}
