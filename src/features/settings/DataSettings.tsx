import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Download, FileJson, FileLock, FileSpreadsheet, FileUp, Undo2 } from 'lucide-react';
import { createOperationPredicate } from '@/domain/operations/operations';
import { MIN_PASSWORD_LENGTH, passwordStrength } from '@/io/crypto/encryption';
import { undoImport } from '@/data';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Badge, Button, Field, Section, Select, TextInput, toast } from '@/ui';
import { APP_VERSION, exportEncrypted, exportJson, exportOperations } from '../io/export-actions';
import { reportError } from '../shared/actions';
import { useAppData } from '../shared/app-data';
import styles from './settings.module.css';

export default function DataSettings(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const navigate = useNavigate();
  const periods = [...new Set(data.operations.map((o) => o.period))].sort();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [encBusy, setEncBusy] = useState(false);
  const [encTried, setEncTried] = useState(false);

  const selection = (): typeof data.operations =>
    data.operations.filter(
      createOperationPredicate(
        {
          periodFrom: from || undefined,
          periodTo: to || undefined,
          accountIds: account ? [account] : [],
          categoryIds: category ? [category] : [],
        },
        data.categories,
      ),
    );

  const strength = passwordStrength(password);
  const passwordError =
    encTried && password.length < MIN_PASSWORD_LENGTH
      ? 'security.error.short'
      : encTried && password !== confirm
        ? 'security.error.mismatch'
        : null;

  return (
    <div className={styles.stack}>
      <Section title={<T id="data.backupTitle" />} panel>
        <p className={styles.text}>
          <T id="data.backupText" />
        </p>
        <p className={styles.muted}>
          {data.settings.lastBackupAt ? (
            <T id="data.lastBackup" values={{ date: fmt.dateTime(data.settings.lastBackupAt) }} />
          ) : (
            <T id="data.neverBackedUp" />
          )}
        </p>
        <div className={styles.actions}>
          <Button variant="primary" icon={<FileJson />} onClick={() => void exportJson(t)}>
            <T id="data.exportJson" />
          </Button>
          <Button icon={<FileUp />} onClick={() => void navigate({ to: '/import' })}>
            <T id="data.import" />
          </Button>
        </div>
      </Section>

      <Section title={<T id="security.title" />} panel>
        <p className={styles.text}>
          <T id="security.text" />
        </p>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            setEncTried(true);
            if (password.length < MIN_PASSWORD_LENGTH || password !== confirm) return;
            setEncBusy(true);
            void exportEncrypted(password, t).finally(() => {
              setEncBusy(false);
              setPassword('');
              setConfirm('');
              setEncTried(false);
            });
          }}
        >
          <div className={styles.grid2}>
            <Field
              label={<T id="security.password" />}
              hint={
                <T
                  id="security.strength"
                  values={{
                    level: t(`security.strength.${Math.min(4, strength)}` as 'security.strength.0'),
                  }}
                />
              }
              error={
                passwordError === 'security.error.short' ? (
                  <T id="security.error.short" values={{ min: MIN_PASSWORD_LENGTH }} />
                ) : undefined
              }
            >
              <TextInput
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field
              label={<T id="security.confirm" />}
              error={
                passwordError === 'security.error.mismatch' ? (
                  <T id="security.error.mismatch" />
                ) : undefined
              }
            >
              <TextInput
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
          </div>
          <p className={styles.muted}>
            <T id="security.warning" />
          </p>
          <div>
            <Button type="submit" icon={<FileLock />} loading={encBusy}>
              <T id="security.export" />
            </Button>
          </div>
        </form>
      </Section>

      <Section title={<T id="data.tableTitle" />} panel>
        <p className={styles.text}>
          <T id="data.tableText" />
        </p>
        <div className={styles.grid2}>
          <Field label={<T id="filters.from" />}>
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">{t('filters.any')}</option>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {fmt.period(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={<T id="filters.to" />}>
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">{t('filters.any')}</option>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {fmt.period(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={<T id="detail.account" />}>
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">{t('filters.allAccounts')}</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={<T id="entry.category" />}>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t('filters.allCategories')}</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className={styles.actions}>
          <Button
            icon={<Download />}
            onClick={() => void exportOperations('csv', selection(), data, t)}
          >
            <T id="data.exportCsv" />
          </Button>
          <Button
            icon={<FileSpreadsheet />}
            onClick={() => void exportOperations('xlsx', selection(), data, t)}
          >
            <T id="data.exportXlsx" />
          </Button>
        </div>
      </Section>

      <Section title={<T id="data.historyTitle" />} panel>
        {data.importBatches.length === 0 ? (
          <p className={styles.muted}>
            <T id="data.historyEmpty" />
          </p>
        ) : (
          <ul className={styles.list} role="list">
            {data.importBatches.map((b) => (
              <li key={b.id} className={styles.item}>
                <span className={styles.itemMain}>
                  <span className={styles.itemTitle}>{b.fileName}</span>
                  <span className={styles.itemMeta}>
                    {fmt.dateTime(b.importedAt)} ·{' '}
                    <T id="data.historyCount" values={{ count: b.count }} /> ·{' '}
                    {t(b.mode === 'merge' ? 'import.mode.merge' : 'import.mode.replace')}
                  </span>
                </span>
                {b.undoneAt ? (
                  <Badge>
                    <T id="data.undone" />
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Undo2 />}
                    onClick={() =>
                      void undoImport(b.id, APP_VERSION)
                        .then(() => toast(t('import.undone'), { tone: 'success' }))
                        .catch((e: unknown) => reportError(e, t))
                    }
                  >
                    <T id="import.done.undo" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
