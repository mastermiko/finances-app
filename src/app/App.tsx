import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AppLocale } from '@/domain/model';
import {
  BootstrapError,
  detectLocale,
  getSettings,
  initialize,
  logError,
  queries,
  requestPersistence,
  runRecurrences,
} from '@/data';
import { FormatProvider, I18nProvider, loadCatalog } from '@/i18n';
import { Skeleton } from '@/ui';
import { DataProvider } from '@/features/shared/app-data';
import styles from './Layout.module.css';
import { ErrorBoundary } from './ErrorBoundary';
import { createAppRouter, type AppRouter } from './router';

const APP_VERSION = __APP_VERSION__;

type Boot =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; code: 'dataTooNew' | 'migrationFailed' | 'unavailable' };

export function Loading(): ReactNode {
  return (
    <div className={styles.main} aria-busy="true">
      <Skeleton height={48} width="40%" />
      <div style={{ height: 24 }} />
      <Skeleton height={140} />
      <div style={{ height: 24 }} />
      <Skeleton height={64} />
    </div>
  );
}

/** Applies theme and language to <html>. */
function useDocumentSettings(locale: AppLocale, theme: string): void {
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale.slice(0, 2);
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [locale, theme]);
}

export function Shell({ router: injected }: { router?: AppRouter }): ReactNode {
  const settings = useLiveQuery(queries.settings);
  const locale: AppLocale = settings?.locale ?? 'fr-FR';
  useDocumentSettings(locale, settings?.theme ?? 'system');
  const router = useMemo(() => injected ?? createAppRouter(), [injected]);
  // Recurring operations: generate again when the app comes back to the foreground.
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void runRecurrences().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return (
    <I18nProvider locale={locale}>
      <FormatProvider
        value={{
          currency: settings?.currency ?? 'EUR',
          dateFormat: settings?.dateFormat ?? 'locale',
        }}
      >
        <DataProvider fallback={<Loading />}>
          <RouterProvider router={router} />
        </DataProvider>
      </FormatProvider>
    </I18nProvider>
  );
}

export function App(): ReactNode {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  useEffect(() => {
    const boot = async (): Promise<{ firstLaunch: boolean }> => {
      const detected = detectLocale(navigator.languages ?? [navigator.language]);
      // Catalogue and database open in parallel (getSettings opens IndexedDB).
      const [messages, stored] = await Promise.all([loadCatalog(detected), getSettings()]);
      const result = await initialize(APP_VERSION, detected, messages['account.default']);
      // Load the chosen language before the first render (no flash of French).
      if (stored && stored.locale !== detected) await loadCatalog(stored.locale);
      return result;
    };
    boot()
      .then((result) => {
        setBoot({ state: 'ready' });
        if (result.firstLaunch) void requestPersistence();
      })
      .catch((error: unknown) => {
        void logError(error, 'bootstrap', APP_VERSION);
        setBoot({
          state: 'error',
          code: error instanceof BootstrapError ? error.code : 'unavailable',
        });
      });
  }, []);

  if (boot.state === 'loading') return <Loading />;
  if (boot.state === 'error') return <BootError code={boot.code} />;
  return (
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  );
}

/** Start-up failure (before i18n is available): bilingual inline text. */
function BootError({
  code,
}: {
  code: 'dataTooNew' | 'migrationFailed' | 'unavailable';
}): ReactNode {
  /* eslint-disable local/no-jsx-text */
  const text = {
    dataTooNew: [
      'Vos données ont été enregistrées par une version plus récente de l’application. Rechargez la page pour obtenir la mise à jour.',
      'Your data was saved by a newer version of the app. Reload to get the update.',
    ],
    migrationFailed: [
      'La mise à niveau de vos données a échoué. Elles sont restées dans leur état précédent et une sauvegarde a été créée. Rechargez la page ou installez la version précédente.',
      'Upgrading your data failed. It was left unchanged and a backup was created. Reload or reinstall the previous version.',
    ],
    unavailable: [
      'Le stockage du navigateur est indisponible (navigation privée ou stockage bloqué). Autorisez le stockage pour ce site puis rechargez.',
      'Browser storage is unavailable (private mode or blocked storage). Allow storage for this site and reload.',
    ],
  }[code];
  return (
    <main className="fatal">
      <h1>Finances</h1>
      <p lang="fr">{text[0]}</p>
      <p lang="en">{text[1]}</p>
      <p className="fatal-actions">
        <button type="button" onClick={() => window.location.reload()}>
          Recharger · Reload
        </button>
      </p>
    </main>
  );
  /* eslint-enable local/no-jsx-text */
}
