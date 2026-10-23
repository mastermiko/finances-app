import { useState, type ReactNode } from 'react';
import { Button, toast } from '@/ui';
import { T, useT } from '@/i18n';
import { createBackup, nowIso, replaceWithSnapshot } from '@/data';
import {
  createDefaultAccount,
  createDefaultCategories,
  createDefaultSettings,
} from '@/domain/model';
import { useAppData } from '../shared/app-data';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { reportError } from '../shared/actions';
import { APP_VERSION, exportJson } from '../io/export-actions';
import { deleteEverything } from './wipe';
import styles from './settings.module.css';

export default function DangerSettings(): ReactNode {
  const t = useT();
  const { settings } = useAppData();
  const [step, setStep] = useState<'idle' | 'export' | 'confirm' | 'wipe-export' | 'wipe-confirm'>(
    'idle',
  );
  const [busy, setBusy] = useState(false);

  const reset = async (): Promise<void> => {
    setBusy(true);
    try {
      await createBackup('reset', APP_VERSION);
      const stamp = nowIso();
      const account = createDefaultAccount(t('account.default'), settings.currency, stamp);
      await replaceWithSnapshot({
        accounts: [account],
        categories: createDefaultCategories(settings.locale, stamp),
        operations: [],
        budgets: [],
        recurrences: [],
        rules: [],
        tags: [],
        goals: [],
        importBatches: [],
        settings: {
          ...createDefaultSettings(stamp, settings.locale),
          theme: settings.theme,
          defaultAccountId: account.id,
        },
      });
      toast(t('danger.resetDone'), { tone: 'success' });
      setStep('idle');
    } catch (e) {
      reportError(e, t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.stack}>
      <div className={styles.dangerZone}>
        <h2>
          <T id="danger.resetTitle" />
        </h2>
        <p className={styles.text}>
          <T id="danger.resetText" />
        </p>
        <div>
          <Button variant="danger" onClick={() => setStep('export')}>
            <T id="danger.reset" />
          </Button>
        </div>
      </div>
      <div className={styles.dangerZone}>
        <h2>
          <T id="privacy.eraseTitle" />
        </h2>
        <p className={styles.text}>
          <T id="privacy.erase" />
        </p>
        <div>
          <Button variant="danger" onClick={() => setStep('wipe-export')}>
            <T id="privacy.eraseButton" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={step === 'export' || step === 'wipe-export'}
        danger={false}
        onClose={() => setStep('idle')}
        title={<T id="privacy.exportFirstTitle" />}
        confirmLabel={<T id="privacy.exportFirst" />}
        onConfirm={() =>
          void exportJson(t).then(
            (ok) => ok && setStep(step === 'export' ? 'confirm' : 'wipe-confirm'),
          )
        }
      >
        <p>
          <T id="privacy.exportFirstText" />
        </p>
        <Button
          variant="ghost"
          onClick={() => setStep(step === 'export' ? 'confirm' : 'wipe-confirm')}
        >
          <T id="privacy.skipExport" />
        </Button>
      </ConfirmDialog>
      <ConfirmDialog
        open={step === 'confirm'}
        busy={busy}
        onClose={() => setStep('idle')}
        title={<T id="danger.confirmTitle" />}
        confirmWord={t('danger.confirmWord')}
        confirmLabel={<T id="danger.reset" />}
        onConfirm={() => void reset()}
      >
        <p>
          <T id="danger.confirmText" />
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={step === 'wipe-confirm'}
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
