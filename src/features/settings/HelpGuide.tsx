import { useState, type ReactNode } from 'react';
import { T, useT, type MessageId } from '@/i18n';
import { Tabs } from '@/ui';
import styles from './settings.module.css';

const PAGES = ['start', 'entry', 'operations', 'budget', 'import', 'backup', 'shortcuts'] as const;
type Page = (typeof PAGES)[number];

const PARAGRAPHS: Record<Page, readonly MessageId[]> = {
  start: ['help.start.1', 'help.start.2', 'help.start.3'],
  entry: ['help.entry.1', 'help.entry.2', 'help.entry.3', 'help.entry.4'],
  operations: ['help.operations.1', 'help.operations.2', 'help.operations.3'],
  budget: ['help.budget.1', 'help.budget.2', 'help.budget.3'],
  import: ['help.import.1', 'help.import.2', 'help.import.3'],
  backup: ['help.backup.1', 'help.backup.2', 'help.backup.3'],
  shortcuts: [],
};

/** Built-in user guide (replaces the spreadsheet's help form). */
export default function HelpGuide(): ReactNode {
  const t = useT();
  const [page, setPage] = useState<Page>('start');
  return (
    <div className={styles.stack}>
      <Tabs
        idPrefix="help"
        label={t('settings.help')}
        items={PAGES.map((p) => ({ value: p, label: t(`help.${p}.title`) }))}
        value={page}
        onChange={setPage}
      />
      <div
        id="help-panel"
        role="tabpanel"
        aria-labelledby={`help-tab-${page}`}
        className={[styles.text, styles.guide].join(' ')}
        tabIndex={0}
      >
        <h3>
          <T id={`help.${page}.title`} />
        </h3>
        {PARAGRAPHS[page].map((id) => (
          <p key={id}>
            <T id={id} />
          </p>
        ))}
        {page === 'shortcuts' ? (
          <dl className={styles.list}>
            {(
              [
                ['keys.n', 'help.shortcuts.new'],
                ['keys.enter', 'help.shortcuts.save'],
                ['keys.ctrlEnter', 'help.shortcuts.saveNew'],
                ['keys.escape', 'help.shortcuts.close'],
                ['keys.e', 'help.shortcuts.edit'],
                ['keys.delete', 'help.shortcuts.delete'],
                ['keys.arrows', 'help.shortcuts.arrows'],
              ] as const
            ).map(([key, id]) => (
              <div key={id} className={styles.item}>
                <dt>
                  <kbd className={styles.kbd}>{t(key)}</kbd>
                </dt>
                <dd className={styles.itemMain}>
                  <T id={id} />
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}
