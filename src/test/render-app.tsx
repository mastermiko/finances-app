/** Renders the whole application on a fake IndexedDB with an in-memory router. */
import { act, render, screen, type RenderResult } from '@testing-library/react';
import { createMemoryHistory } from '@tanstack/react-router';
import { FinancesDb, getDb, initialize, setClock, setDb, deleteBackupDatabase } from '@/data';
import { Shell } from '@/app/App';
import { createAppRouter, type AppRouter } from '@/app/router';
import { useToasts } from '@/ui';
import { useUi } from '@/features/shared/ui-store';

let counter = 0;

export async function freshDatabase(now = '2026-10-23T10:00:00.000Z'): Promise<void> {
  counter += 1;
  try {
    getDb().close();
  } catch {
    // no database yet
  }
  setDb(new FinancesDb(`component-${counter}-${Math.random()}`));
  setClock(() => new Date(now));
  await initialize('1.0.0', 'fr-FR', 'Compte courant');
}

export async function resetEnvironment(): Promise<void> {
  getDb().close();
  setDb(null);
  setClock(null);
  useToasts.setState({ toasts: [] });
  useUi.setState({ entry: null });
  await deleteBackupDatabase();
}

export async function renderApp(path = '/'): Promise<RenderResult & { router: AppRouter }> {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  let result: RenderResult | undefined;
  await act(async () => {
    result = render(<Shell router={router} />);
  });
  await screen.findByRole('main', {}, { timeout: 5000 });
  return Object.assign(result!, { router });
}

export async function navigate(router: AppRouter, to: string): Promise<void> {
  await act(async () => {
    router.history.push(to);
    await router.load();
  });
}
