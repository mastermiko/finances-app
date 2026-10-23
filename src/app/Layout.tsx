import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  ChartColumnBig,
  LayoutDashboard,
  List,
  NotebookPen,
  Plus,
  Settings,
  Wallet,
} from 'lucide-react';
import { preloadSchemas } from '@/data';
import { T, useT } from '@/i18n';
import { Button, Toaster } from '@/ui';
import { useUi } from '@/features/shared/ui-store';
import styles from './Layout.module.css';
import { UpdateBanner } from './UpdateBanner';

const loadEntrySheet = () => import('@/features/entry/EntrySheet');
/** The entry sheet is a separate chunk, prefetched once the first screen is displayed. */
const EntrySheet = lazy(() => loadEntrySheet().then((m) => ({ default: m.EntrySheet })));

/** Keyboard shortcut opening the entry sheet (a key name, not translatable text). */
const NEW_ENTRY_KEY = 'N';

const NAV = [
  { to: '/', label: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/operations', label: 'nav.operations', icon: List },
  { to: '/budget', label: 'nav.budget', icon: Wallet },
  { to: '/analytics', label: 'nav.analytics', icon: ChartColumnBig },
  { to: '/settings', label: 'nav.settings', icon: Settings },
] as const;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function Layout(): ReactNode {
  const t = useT();
  const openEntry = useUi((s) => s.openEntry);
  const entryOpen = useUi((s) => s.entry !== null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showFab = !entryOpen && !pathname.startsWith('/import');
  // Mounted on first use, then kept (dialog state and closing animation).
  const [entryMounted, setEntryMounted] = useState(false);
  if (entryOpen && !entryMounted) setEntryMounted(true);

  // Prefetch what a first entry needs (form chunk, validation) when the browser is idle.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEntrySheet().catch(() => undefined);
      preloadSchemas();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  // Keyboard shortcut N: new operation from any screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (
        e.key.toUpperCase() !== NEW_ENTRY_KEY ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        isTyping(e.target)
      )
        return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      openEntry();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openEntry]);

  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        <T id="a11y.skipToContent" />
      </a>
      <div className={styles.shell}>
        <nav className={styles.nav} aria-label={t('nav.label')}>
          <div className={styles.brand}>
            <NotebookPen aria-hidden="true" />
            <span>
              <T id="app.name" />
            </span>
          </div>
          <Button
            variant="primary"
            block
            className={styles.sideAdd}
            icon={<Plus />}
            onClick={() => openEntry()}
          >
            <T id="entry.new" />
            <kbd className={styles.kbd} aria-hidden="true">
              {NEW_ENTRY_KEY}
            </kbd>
          </Button>
          <ul className={styles.navList}>
            {NAV.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  className={styles.navLink}
                  activeOptions={{ exact: to === '/', includeSearch: false }}
                >
                  <Icon aria-hidden="true" />
                  <span className={styles.navLabel}>
                    <T id={label} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main id="main" className={styles.main} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      {showFab ? (
        <button
          type="button"
          className={styles.fab}
          onClick={() => openEntry()}
          aria-keyshortcuts="N"
        >
          <Plus aria-hidden="true" />
          <T id="entry.add" />
        </button>
      ) : null}
      {entryMounted ? (
        <Suspense fallback={null}>
          <EntrySheet />
        </Suspense>
      ) : null}
      <UpdateBanner />
      <Toaster closeLabel={t('common.close')} regionLabel={t('a11y.notifications')} />
    </>
  );
}

export function PageHeader({
  title,
  actions,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}): ReactNode {
  return (
    <header className={styles.pageHeader}>
      <h1 className={styles.pageTitle}>{title}</h1>
      {children}
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}

export { styles as layoutStyles };
