import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CircleAlert, CircleCheck, FileUp, Lock, TriangleAlert, Undo2 } from 'lucide-react';
import { labelKey } from '@/domain/common/text';
import { groupSimilarLabels } from '@/domain/rules/rules';
import { type ExportData } from '@/domain/model';
import { ruleSchema } from '@/domain/model/schemas';
import {
  applyRulesToOperations,
  commitImport,
  commitSnapshot,
  createTag,
  kvGet,
  kvSet,
  nowIso,
  readSnapshot,
  restoreBackup,
  saveRule,
  undoImport,
  type ImportOutcome,
} from '@/data';
import { getIo } from '@/io/workers/client';
import type { ParsedImport } from '@/io/import-types';
import {
  headerSignature,
  isOwnCsvFormat,
  suggestMapping,
  type ColumnMapping,
  type CsvTable,
  type DateFormat,
} from '@/io/csv/csv';
import { isEncryptedFile } from '@/io/crypto/encryption';
import type { JsonImportResult } from '@/io/json/export-json';
import { T, useT, type MessageId } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Badge, Button, Checkbox, Field, Section, Segmented, Select, TextInput, toast } from '@/ui';
import { PageHeader } from '@/app/Layout';
import { reportError } from '../shared/actions';
import { downloadBlob } from '../shared/download';
import { useAppData } from '../shared/app-data';
import styles from './ImportPage.module.css';
import { resolveImport, type ResolvedImport } from './resolve';
import { buildImportReport, REJECT_MESSAGES, warningText } from './report';
import { APP_VERSION } from './export-actions';

export const MAX_IMPORT_SIZE = 20 * 1024 * 1024;
/** Own backups can be larger: 50 000 operations weigh about 26 MB in JSON (ADR 0004). */
export const MAX_BACKUP_SIZE = 100 * 1024 * 1024;
const BACKUP_EXTENSIONS = new Set(['json', 'enc']);
const ACCEPT = '.xlsm,.xlsx,.json,.enc,.csv,.ofx,.qfx,.qif';
const MAPPINGS_KEY = 'bankMappings';

type Step =
  | { readonly kind: 'pick' }
  | { readonly kind: 'reading' }
  | {
      readonly kind: 'password';
      readonly text: string;
      readonly fileName: string;
      readonly fileHash: string;
    }
  | {
      readonly kind: 'mapping';
      readonly table: CsvTable;
      readonly fileName: string;
      readonly fileHash: string;
      readonly mapping: ColumnMapping;
    }
  | { readonly kind: 'preview'; readonly parsed: ParsedImport }
  | {
      readonly kind: 'json';
      readonly result: Extract<JsonImportResult, { ok: true }>;
      readonly fileName: string;
      readonly fileHash: string;
    }
  | {
      readonly kind: 'done';
      readonly outcome: ImportOutcome;
      readonly report: string | null;
      readonly parsed: ParsedImport | null;
    };

export function ImportPage(): ReactNode {
  const { settings } = useAppData();
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [error, setError] = useState<MessageId | null>(null);

  const readFile = async (file: File): Promise<void> => {
    setError(null);
    const extension = file.name.toLowerCase().split('.').pop() ?? '';
    const limit = BACKUP_EXTENSIONS.has(extension) ? MAX_BACKUP_SIZE : MAX_IMPORT_SIZE;
    if (file.size > limit) {
      setError('import.error.tooLarge');
      return;
    }
    setStep({ kind: 'reading' });
    try {
      const io = await getIo();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const fileHash = await io.hash(bytes);
      const name = file.name;
      const ext = name.toLowerCase().split('.').pop() ?? '';
      const currency = settings.currency;
      if (ext === 'xlsm' || ext === 'xlsx') {
        const parsed = await io.parseWorkbook(bytes, name, fileHash);
        if (parsed.rows.length === 0 && (parsed.controls?.length ?? 0) === 0) {
          setError('import.error.noMonthlySheet');
          setStep({ kind: 'pick' });
          return;
        }
        setStep({ kind: 'preview', parsed });
        return;
      }
      const text = new TextDecoder('utf-8').decode(bytes);
      if (ext === 'enc' || isEncryptedFile(text)) {
        setStep({ kind: 'password', text, fileName: name, fileHash });
        return;
      }
      if (ext === 'json') {
        await handleJson(text, name, fileHash);
        return;
      }
      if (ext === 'ofx' || ext === 'qfx') {
        setStep({
          kind: 'preview',
          parsed: await io.parseOfx(text, { fileName: name, fileHash, currency }),
        });
        return;
      }
      if (ext === 'qif') {
        setStep({
          kind: 'preview',
          parsed: await io.parseQif(text, { fileName: name, fileHash, currency }),
        });
        return;
      }
      if (ext === 'csv' || ext === 'txt') {
        const table = await io.parseCsvTable(text, true);
        if (isOwnCsvFormat(table.headers)) {
          setStep({
            kind: 'preview',
            parsed: await io.parseOwnCsv(table, { fileName: name, fileHash }),
          });
          return;
        }
        const saved = (await kvGet<Record<string, ColumnMapping>>(MAPPINGS_KEY)) ?? {};
        const mapping = saved[headerSignature(table.headers)] ?? suggestMapping(table);
        setStep({ kind: 'mapping', table, fileName: name, fileHash, mapping });
        return;
      }
      setError('import.error.unsupported');
      setStep({ kind: 'pick' });
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(
        code === 'tooLarge'
          ? 'import.error.tooLarge'
          : code === 'notXlsx' || code === 'notZip'
            ? 'import.error.notWorkbook'
            : 'import.error.read',
      );
      setStep({ kind: 'pick' });
    }
  };

  const handleJson = async (text: string, fileName: string, fileHash: string): Promise<void> => {
    const io = await getIo();
    const result = await io.parseJson(text);
    if (!result.ok) {
      const map: Record<string, MessageId> = {
        notJson: 'import.error.notJson',
        notExport: 'import.error.notExport',
        tooNew: 'import.error.tooNew',
        migrationFailed: 'import.error.migration',
        invalidData: 'import.error.invalidData',
      };
      setError(map[result.issue.code] ?? 'import.error.read');
      setStep({ kind: 'pick' });
      return;
    }
    setStep({ kind: 'json', result, fileName, fileHash });
  };

  return (
    <>
      <PageHeader title={<T id="import.title" />} />
      {error ? (
        <p className={styles.error} role="alert">
          <CircleAlert aria-hidden="true" />
          <T id={error} />
        </p>
      ) : null}
      {step.kind === 'pick' || step.kind === 'reading' ? (
        <FilePicker busy={step.kind === 'reading'} onFile={(f) => void readFile(f)} />
      ) : null}
      {step.kind === 'password' ? (
        <PasswordStep
          onCancel={() => setStep({ kind: 'pick' })}
          onSubmit={async (password) => {
            try {
              const io = await getIo();
              const text = await io.decrypt(step.text, password);
              await handleJson(text, step.fileName, step.fileHash);
              return true;
            } catch {
              return false;
            }
          }}
        />
      ) : null}
      {step.kind === 'mapping' ? (
        <MappingStep
          table={step.table}
          initial={step.mapping}
          onCancel={() => setStep({ kind: 'pick' })}
          onApply={async (mapping) => {
            const saved = (await kvGet<Record<string, ColumnMapping>>(MAPPINGS_KEY)) ?? {};
            await kvSet(MAPPINGS_KEY, { ...saved, [headerSignature(step.table.headers)]: mapping });
            const io = await getIo();
            const parsed = await io.applyCsvMapping(step.table, mapping, {
              fileName: step.fileName,
              fileHash: step.fileHash,
              currency: settings.currency,
            });
            setStep({ kind: 'preview', parsed });
          }}
        />
      ) : null}
      {step.kind === 'preview' ? (
        <PreviewStep
          parsed={step.parsed}
          onCancel={() => setStep({ kind: 'pick' })}
          onDone={(outcome, report) =>
            setStep({ kind: 'done', outcome, report, parsed: step.parsed })
          }
        />
      ) : null}
      {step.kind === 'json' ? (
        <JsonStep
          result={step.result}
          fileName={step.fileName}
          fileHash={step.fileHash}
          onCancel={() => setStep({ kind: 'pick' })}
          onDone={(outcome) => setStep({ kind: 'done', outcome, report: null, parsed: null })}
        />
      ) : null}
      {step.kind === 'done' ? (
        <DoneStep
          outcome={step.outcome}
          report={step.report}
          parsed={step.parsed}
          onAgain={() => setStep({ kind: 'pick' })}
        />
      ) : null}
      <p className={styles.privacy}>
        <Lock aria-hidden="true" />
        <T id="import.privacy" />
      </p>
    </>
  );
}

function FilePicker({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }): ReactNode {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    // Drag and drop is an enhancement: the zone contains a native button and file input.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={[styles.drop, over ? styles.dropOver : ''].join(' ')}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <FileUp aria-hidden="true" className={styles.dropIcon} />
      <p className={styles.dropTitle}>
        <T id="import.drop" />
      </p>
      <p className={styles.dropHint}>
        <T id="import.formats" />
      </p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <Button variant="primary" loading={busy} onClick={() => input.current?.click()}>
        <T id={busy ? 'import.reading' : 'import.choose'} />
      </Button>
    </div>
  );
}

function PasswordStep({
  onSubmit,
  onCancel,
}: {
  onSubmit: (password: string) => Promise<boolean>;
  onCancel: () => void;
}): ReactNode {
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Section title={<T id="import.password.title" />} panel>
      <form
        className={styles.stack}
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void onSubmit(password).then((ok) => {
            setBusy(false);
            setFailed(!ok);
          });
        }}
      >
        <Field
          label={<T id="import.password.label" />}
          error={failed ? <T id="import.password.wrong" /> : undefined}
        >
          <TextInput
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </Field>
        <div className={styles.actions}>
          <Button onClick={onCancel}>
            <T id="common.cancel" />
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!password}>
            <T id="import.password.decrypt" />
          </Button>
        </div>
      </form>
    </Section>
  );
}

const DATE_FORMATS: DateFormat[] = [
  'dd/MM/yyyy',
  'yyyy-MM-dd',
  'MM/dd/yyyy',
  'dd-MM-yyyy',
  'dd.MM.yyyy',
  'yyyyMMdd',
];

function MappingStep({
  table,
  initial,
  onApply,
  onCancel,
}: {
  table: CsvTable;
  initial: ColumnMapping;
  onApply: (mapping: ColumnMapping) => Promise<void>;
  onCancel: () => void;
}): ReactNode {
  const t = useT();
  const [m, setM] = useState(initial);
  const columnOptions = (allowNone: boolean): ReactNode => (
    <>
      {allowNone ? <option value="">{t('mapping.none')}</option> : null}
      {table.headers.map((h, i) => (
        <option key={i} value={i}>
          {h || t('mapping.column', { n: i + 1 })}
        </option>
      ))}
    </>
  );
  const num = (v: string): number | null => (v === '' ? null : Number(v));
  return (
    <Section title={<T id="mapping.title" />} panel>
      <p>
        <T id="mapping.intro" />
      </p>
      <div
        className={styles.tableWrap}
        tabIndex={0}
        role="region"
        aria-label={t('mapping.preview')}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              {table.headers.map((h, i) => (
                <th key={i} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(0, 5).map((row, r) => (
              <tr key={r}>
                {table.headers.map((_, c) => (
                  <td key={c}>{row[c] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.grid2}>
        <Field label={<T id="mapping.date" />}>
          <Select
            value={m.dateColumn}
            onChange={(e) => setM({ ...m, dateColumn: Number(e.target.value) })}
          >
            {columnOptions(false)}
          </Select>
        </Field>
        <Field label={<T id="mapping.dateFormat" />}>
          <Select
            value={m.dateFormat}
            onChange={(e) => setM({ ...m, dateFormat: e.target.value as DateFormat })}
          >
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={<T id="mapping.amountMode" />}>
          <Select
            value={m.amountMode}
            onChange={(e) =>
              setM({ ...m, amountMode: e.target.value as ColumnMapping['amountMode'] })
            }
          >
            <option value="single">{t('mapping.amountSingle')}</option>
            <option value="debitCredit">{t('mapping.amountDebitCredit')}</option>
          </Select>
        </Field>
        {m.amountMode === 'single' ? (
          <Field label={<T id="mapping.amount" />}>
            <Select
              value={m.amountColumn ?? ''}
              onChange={(e) => setM({ ...m, amountColumn: num(e.target.value) })}
            >
              {columnOptions(true)}
            </Select>
          </Field>
        ) : (
          <>
            <Field label={<T id="mapping.debit" />}>
              <Select
                value={m.debitColumn ?? ''}
                onChange={(e) => setM({ ...m, debitColumn: num(e.target.value) })}
              >
                {columnOptions(true)}
              </Select>
            </Field>
            <Field label={<T id="mapping.credit" />}>
              <Select
                value={m.creditColumn ?? ''}
                onChange={(e) => setM({ ...m, creditColumn: num(e.target.value) })}
              >
                {columnOptions(true)}
              </Select>
            </Field>
          </>
        )}
        <Field label={<T id="mapping.decimal" />}>
          <Select
            value={m.decimal}
            onChange={(e) => setM({ ...m, decimal: e.target.value as ',' | '.' })}
          >
            <option value=",">{t('mapping.decimalComma')}</option>
            <option value=".">{t('mapping.decimalPoint')}</option>
          </Select>
        </Field>
        <Field label={<T id="mapping.label" />}>
          <Select
            value={m.labelColumns[0] ?? ''}
            onChange={(e) =>
              setM({ ...m, labelColumns: e.target.value === '' ? [] : [Number(e.target.value)] })
            }
          >
            {columnOptions(true)}
          </Select>
        </Field>
        <Field label={<T id="mapping.category" />} optionalLabel={<T id="common.optional" />}>
          <Select
            value={m.categoryColumn ?? ''}
            onChange={(e) => setM({ ...m, categoryColumn: num(e.target.value) })}
          >
            {columnOptions(true)}
          </Select>
        </Field>
        <Field label={<T id="mapping.note" />} optionalLabel={<T id="common.optional" />}>
          <Select
            value={m.noteColumn ?? ''}
            onChange={(e) => setM({ ...m, noteColumn: num(e.target.value) })}
          >
            {columnOptions(true)}
          </Select>
        </Field>
      </div>
      <Checkbox
        label={<T id="mapping.invert" />}
        checked={m.invertSign}
        onChange={(invertSign) => setM({ ...m, invertSign })}
      />
      <p className={styles.hint}>
        <T id="mapping.remembered" />
      </p>
      <div className={styles.actions}>
        <Button onClick={onCancel}>
          <T id="common.cancel" />
        </Button>
        <Button variant="primary" onClick={() => void onApply(m)}>
          <T id="mapping.continue" />
        </Button>
      </div>
    </Section>
  );
}

function PreviewStep({
  parsed,
  onCancel,
  onDone,
}: {
  parsed: ParsedImport;
  onCancel: () => void;
  onDone: (outcome: ImportOutcome, report: string) => void;
}): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const [mode, setMode] = useState<'merge' | 'replace'>(
    data.operations.length === 0 ? 'replace' : 'merge',
  );
  const [accountId, setAccountId] = useState(data.defaultAccountId);
  const [skip, setSkip] = useState<ReadonlySet<number> | null>(null);
  const [applyOpening, setApplyOpening] = useState(true);
  const [busy, setBusy] = useState(false);

  const resolved: ResolvedImport = useMemo(
    () =>
      resolveImport(parsed, {
        categories: data.categories,
        accounts: data.accounts,
        tags: data.tags,
        rules: data.rules,
        existing: data.operations,
        settings: data.settings,
        targetAccountId: accountId,
        mode,
        nowIso: nowIso(),
        uncategorizedName: t('category.uncategorized'),
      }),
    [parsed, data, accountId, mode, t],
  );
  // Duplicates are skipped by default; the user decides line by line.
  const skipped = skip ?? new Set(resolved.duplicates.map((d) => d.index));
  const kept = resolved.operations.filter((_, i) => !skipped.has(i));
  const hasOpening =
    parsed.openingBalanceMinor !== undefined && parsed.openingBalanceMinor !== null;
  const mismatches = (parsed.controls ?? []).filter(
    (c) => c.differenceMinor !== null && c.differenceMinor !== 0,
  );

  const confirm = async (): Promise<void> => {
    setBusy(true);
    try {
      const usedCategoryIds = new Set(kept.map((o) => o.categoryId));
      const outcome = await commitImport(
        {
          source: parsed.source,
          fileName: parsed.fileName,
          fileHash: parsed.fileHash,
          mode,
          categories: resolved.newCategories.filter(
            (c) =>
              usedCategoryIds.has(c.id) || resolved.newCategories.some((x) => x.parentId === c.id),
          ),
          accounts: resolved.newAccounts,
          tags: resolved.newTags,
          rules: [],
          operations: kept,
          openingBalance:
            hasOpening && applyOpening
              ? { accountId, amountMinor: parsed.openingBalanceMinor ?? 0 }
              : null,
        },
        APP_VERSION,
      );
      const report = buildImportReport(
        parsed,
        resolved,
        {
          imported: kept.length,
          skippedDuplicates: resolved.operations.length - kept.length,
          mode,
          importedAt: outcome.batch.importedAt,
        },
        t,
        fmt,
      );
      toast(t('import.success', { count: kept.length }), { tone: 'success' });
      onDone(outcome, report);
    } catch (error) {
      reportError(error, t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.stack}>
      <Section title={<T id="import.preview.title" values={{ file: parsed.fileName }} />} panel>
        <dl className={styles.stats}>
          <div>
            <dt>
              <T id="import.preview.operations" />
            </dt>
            <dd>{fmt.number(resolved.operations.length)}</dd>
          </div>
          <div>
            <dt>
              <T id="import.preview.period" />
            </dt>
            <dd>
              {resolved.periodFrom && resolved.periodTo
                ? `${fmt.period(resolved.periodFrom)} – ${fmt.period(resolved.periodTo)}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>
              <T id="import.preview.income" />
            </dt>
            <dd>{fmt.money(resolved.incomeMinor)}</dd>
          </div>
          <div>
            <dt>
              <T id="import.preview.expense" />
            </dt>
            <dd>{fmt.money(-resolved.expenseMinor)}</dd>
          </div>
          <div>
            <dt>
              <T id="import.preview.rejected" />
            </dt>
            <dd>{parsed.rejected.length}</dd>
          </div>
          <div>
            <dt>
              <T id="import.preview.duplicates" />
            </dt>
            <dd>{resolved.duplicates.length}</dd>
          </div>
        </dl>
      </Section>

      {parsed.controls && parsed.controls.length > 0 ? (
        <Section
          title={<T id="import.controls.title" />}
          panel
          actions={
            mismatches.length === 0 ? (
              <Badge tone="ok" icon={<CircleCheck aria-hidden="true" />}>
                <T id="import.controls.allMatch" />
              </Badge>
            ) : (
              <Badge tone="danger" icon={<TriangleAlert aria-hidden="true" />}>
                <T id="import.controls.mismatch" values={{ count: mismatches.length }} />
              </Badge>
            )
          }
        >
          <p className={styles.hint}>
            <T id="import.controls.intro" />
          </p>
          <div
            className={styles.tableWrap}
            tabIndex={0}
            role="region"
            aria-label={t('import.controls.title')}
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">
                    <T id="report.col.sheet" />
                  </th>
                  <th scope="col" className={styles.num}>
                    <T id="report.col.rows" />
                  </th>
                  <th scope="col" className={styles.num}>
                    <T id="report.col.computed" />
                  </th>
                  <th scope="col" className={styles.num}>
                    <T id="report.col.f2" />
                  </th>
                  <th scope="col" className={styles.num}>
                    <T id="report.col.difference" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {parsed.controls.map((c) => (
                  <tr key={c.sheet}>
                    <th scope="row">{c.sheet}</th>
                    <td className={styles.num}>{c.rowCount}</td>
                    <td className={styles.num}>{fmt.money(c.computedClosingMinor)}</td>
                    <td className={styles.num}>
                      {c.closingCellMinor === null ? '—' : fmt.money(c.closingCellMinor)}
                    </td>
                    <td className={styles.num}>
                      {c.differenceMinor === null ? (
                        '—'
                      ) : c.differenceMinor === 0 ? (
                        <Badge tone="ok" icon={<CircleCheck aria-hidden="true" />}>
                          <T id="import.controls.ok" />
                        </Badge>
                      ) : (
                        <Badge tone="danger">{fmt.money(c.differenceMinor)}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <Section title={<T id="import.options" />} panel>
        <Segmented<'merge' | 'replace'>
          name="import-mode"
          legend={t('import.mode.label')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'merge', label: t('import.mode.merge') },
            { value: 'replace', label: t('import.mode.replace') },
          ]}
        />
        <p className={styles.hint}>
          <T id={mode === 'merge' ? 'import.mode.mergeHint' : 'import.mode.replaceHint'} />
        </p>
        {parsed.rows.some((r) => !r.accountName) ? (
          <Field label={<T id="import.account" />}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {hasOpening ? (
          <Checkbox
            label={
              <T
                id="import.opening"
                values={{ amount: fmt.money(parsed.openingBalanceMinor ?? 0) }}
              />
            }
            checked={applyOpening}
            onChange={setApplyOpening}
          />
        ) : null}
      </Section>

      {resolved.categoryCounts.length > 0 ? (
        <Section title={<T id="import.categories" />} panel>
          <ul className={styles.inlineList}>
            {resolved.categoryCounts.map((c) => (
              <li key={c.categoryId}>
                {c.name} <span className={styles.muted}>({c.count})</span>{' '}
                {c.created ? (
                  <Badge tone="accent">
                    <T id="import.categoryNew" />
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {resolved.duplicates.length > 0 ? (
        <Section
          title={<T id="import.duplicates.title" values={{ count: resolved.duplicates.length }} />}
          panel
          actions={
            <div className={styles.actions}>
              <Button
                size="sm"
                onClick={() => setSkip(new Set(resolved.duplicates.map((d) => d.index)))}
              >
                <T id="import.duplicates.skipAll" />
              </Button>
              <Button size="sm" onClick={() => setSkip(new Set())}>
                <T id="import.duplicates.keepAll" />
              </Button>
            </div>
          }
        >
          <p className={styles.hint}>
            <T id="import.duplicates.intro" />
          </p>
          <ul className={styles.dupList}>
            {resolved.duplicates.slice(0, 200).map((d) => {
              const op = resolved.operations[d.index];
              if (!op) return null;
              return (
                <li key={d.index}>
                  <Checkbox
                    label={`${op.date ? fmt.date(op.date) : fmt.period(op.period)} · ${op.label || '—'} · ${fmt.money(op.amountMinor)}`}
                    description={t('import.duplicates.existing', { count: d.existing.length })}
                    checked={!skipped.has(d.index)}
                    onChange={(importIt) => {
                      const next = new Set(skipped);
                      if (importIt) next.delete(d.index);
                      else next.add(d.index);
                      setSkip(next);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {parsed.warnings.length > 0 || parsed.rejected.length > 0 ? (
        <Section title={<T id="import.issues" />} panel>
          <ul className={styles.issues}>
            {parsed.rejected.map((r, i) => (
              <li key={`r${i}`}>
                <Badge tone="danger">
                  <T id="import.rejectedBadge" />
                </Badge>{' '}
                {r.source.sheet
                  ? t('report.sourceSheet', { sheet: r.source.sheet, row: r.source.row })
                  : t('report.sourceLine', { row: r.source.row })}
                {' — '}
                <T id={REJECT_MESSAGES[r.reason]} />
              </li>
            ))}
            {parsed.warnings.slice(0, 100).map((w, i) => (
              <li key={`w${i}`}>
                <Badge tone="warn">
                  <T id="import.warningBadge" />
                </Badge>{' '}
                {w.source
                  ? `${w.source.sheet ? t('report.sourceSheet', { sheet: w.source.sheet, row: w.source.row }) : t('report.sourceLine', { row: w.source.row })} — `
                  : ''}
                {warningText(w, t, fmt)}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className={styles.footerBar}>
        <p>
          <T id="import.summary" values={{ count: kept.length }} />
        </p>
        <div className={styles.actions}>
          <Button onClick={onCancel}>
            <T id="common.cancel" />
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={kept.length === 0}
            onClick={() => void confirm()}
          >
            <T id="import.confirm" values={{ count: kept.length }} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function JsonStep({
  result,
  fileName,
  fileHash,
  onCancel,
  onDone,
}: {
  result: Extract<JsonImportResult, { ok: true }>;
  fileName: string;
  fileHash: string;
  onCancel: () => void;
  onDone: (outcome: ImportOutcome) => void;
}): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const [mode, setMode] = useState<'merge' | 'replace'>('replace');
  const [acceptChecksum, setAcceptChecksum] = useState(false);
  const [busy, setBusy] = useState(false);
  const d: ExportData = result.data;
  const blocked = !result.checksumValid && !acceptChecksum;
  return (
    <div className={styles.stack}>
      <Section title={<T id="import.json.title" values={{ file: fileName }} />} panel>
        <dl className={styles.stats}>
          <div>
            <dt>
              <T id="import.json.exportedAt" />
            </dt>
            <dd>{fmt.dateTime(result.exportedAt)}</dd>
          </div>
          <div>
            <dt>
              <T id="import.json.version" />
            </dt>
            <dd>{`${result.fileAppVersion} · v${result.fileSchemaVersion}`}</dd>
          </div>
          <div>
            <dt>
              <T id="import.preview.operations" />
            </dt>
            <dd>{fmt.number(d.operations.length)}</dd>
          </div>
          <div>
            <dt>
              <T id="import.json.categories" />
            </dt>
            <dd>{d.categories.length}</dd>
          </div>
          <div>
            <dt>
              <T id="import.json.accounts" />
            </dt>
            <dd>{d.accounts.length}</dd>
          </div>
          <div>
            <dt>
              <T id="import.json.budgets" />
            </dt>
            <dd>{d.budgets.length}</dd>
          </div>
        </dl>
        {result.migrated ? (
          <p className={styles.hint}>
            <T id="import.json.migrated" values={{ from: result.fileSchemaVersion }} />
          </p>
        ) : null}
        {result.checksumValid ? (
          <Badge tone="ok" icon={<CircleCheck aria-hidden="true" />}>
            <T id="import.json.checksumOk" />
          </Badge>
        ) : (
          <div className={styles.warnBox} role="alert">
            <p>
              <TriangleAlert aria-hidden="true" /> <T id="warning.checksumMismatch" />
            </p>
            <Checkbox
              label={<T id="import.json.acceptChecksum" />}
              checked={acceptChecksum}
              onChange={setAcceptChecksum}
            />
          </div>
        )}
      </Section>
      <Section title={<T id="import.options" />} panel>
        <Segmented<'merge' | 'replace'>
          name="json-mode"
          legend={t('import.mode.label')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'replace', label: t('import.mode.replace') },
            { value: 'merge', label: t('import.mode.merge') },
          ]}
        />
        <p className={styles.hint}>
          <T
            id={mode === 'replace' ? 'import.json.replaceHint' : 'import.json.mergeHint'}
            values={{ count: data.operations.length }}
          />
        </p>
      </Section>
      <div className={styles.footerBar}>
        <span />
        <div className={styles.actions}>
          <Button onClick={onCancel}>
            <T id="common.cancel" />
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={blocked}
            onClick={() => {
              setBusy(true);
              void (async () => {
                try {
                  const { mergeExportData } = await import('@/io/json/export-json');
                  const target =
                    mode === 'merge' ? mergeExportData(await readSnapshot(), d).data : d;
                  const outcome = await commitSnapshot(
                    target,
                    { fileName, fileHash, mode },
                    APP_VERSION,
                  );
                  toast(t('import.success', { count: d.operations.length }), { tone: 'success' });
                  onDone(outcome);
                } catch (error) {
                  reportError(error, t);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <T id={mode === 'replace' ? 'import.json.restore' : 'import.json.merge'} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DoneStep({
  outcome,
  report,
  parsed,
  onAgain,
}: {
  outcome: ImportOutcome;
  report: string | null;
  parsed: ParsedImport | null;
  onAgain: () => void;
}): ReactNode {
  const t = useT();
  const data = useAppData();
  const navigate = useNavigate();
  const [undone, setUndone] = useState(false);
  const groups = useMemo(() => groupSimilarLabels(data.operations), [data.operations]);
  const tracker = parsed?.trackers?.[0];
  const trackerExists = tracker
    ? data.tags.some((tag) => labelKey(tag.name) === labelKey(tracker.term))
    : true;
  return (
    <div className={styles.stack}>
      <Section panel>
        <p className={styles.success}>
          <CircleCheck aria-hidden="true" />
          <T id="import.done.title" values={{ count: outcome.batch.count }} />
        </p>
        <div className={styles.actions}>
          {report ? (
            <Button
              onClick={() =>
                downloadBlob(
                  report,
                  `rapport-import_${outcome.batch.importedAt.slice(0, 10)}.md`,
                  'text/markdown;charset=utf-8',
                )
              }
            >
              <T id="import.done.report" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            icon={<Undo2 />}
            disabled={undone}
            onClick={() => {
              void (async () => {
                try {
                  if (outcome.batch.source === 'json')
                    await restoreBackup(outcome.backupId, APP_VERSION);
                  else await undoImport(outcome.batch.id, APP_VERSION);
                  setUndone(true);
                  toast(t('import.undone'), { tone: 'success' });
                } catch (error) {
                  reportError(error, t);
                }
              })();
            }}
          >
            <T id="import.done.undo" />
          </Button>
          <Button variant="primary" onClick={() => void navigate({ to: '/' })}>
            <T id="import.done.dashboard" />
          </Button>
          <Button variant="ghost" onClick={onAgain}>
            <T id="import.done.another" />
          </Button>
        </div>
      </Section>
      {!undone && groups.length > 0 ? (
        <Section title={<T id="import.done.groupsTitle" values={{ count: groups.length }} />} panel>
          <p>
            <T id="import.done.groupsText" />
          </p>
          <div>
            <Button
              onClick={() =>
                void navigate({ to: '/settings/$section', params: { section: 'labels' } })
              }
            >
              <T id="import.done.groupsAction" />
            </Button>
          </div>
        </Section>
      ) : null}
      {!undone && tracker && !trackerExists ? (
        <Section title={<T id="import.done.trackerTitle" values={{ term: tracker.term }} />} panel>
          <p>
            <T
              id="import.done.trackerText"
              values={{ term: tracker.term, cell: `${tracker.sheet}!${tracker.cell}` }}
            />
          </p>
          <div>
            <Button
              onClick={() => {
                void (async () => {
                  try {
                    const tag = await createTag(tracker.term, '#6250d6');
                    const rule = await saveRule(
                      ruleSchema
                        .omit({ id: true, createdAt: true, updatedAt: true, priority: true })
                        .parse({
                          name: t('import.done.trackerRule', { term: tracker.term }),
                          matchType: 'contains',
                          pattern: tracker.term,
                          actions: { categoryId: null, label: null, addTagIds: [tag.id] },
                          enabled: true,
                        }),
                    );
                    await applyRulesToOperations(
                      [rule.id],
                      data.operations.map((o) => o.id),
                    );
                    toast(t('import.done.trackerCreated', { term: tracker.term }), {
                      tone: 'success',
                    });
                  } catch (error) {
                    reportError(error, t);
                  }
                })();
              }}
            >
              <T id="import.done.trackerAction" values={{ term: tracker.term }} />
            </Button>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
