import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDb,
  saveGoal,
  setBudget,
  createTag,
  bulkUpdateOperations,
  allLiveOperations,
} from '@/data';
import { freshDatabase, navigate, renderApp, resetEnvironment } from '@/test/render-app';
import { seed } from './seed';

vi.mock('@/features/analytics/echarts', () => {
  const instance = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    getDataURL: vi.fn(() => 'data:image/png;base64,AAAA'),
  };
  return { echarts: { init: vi.fn(() => instance), use: vi.fn() } };
});

let categories: Record<string, string> = {};

beforeEach(async () => {
  await freshDatabase();
  categories = (await seed()).categories;
});
afterEach(async () => {
  await resetEnvironment();
});

describe('budget screen', () => {
  it('sets envelopes, shows gauges, copies the previous month and toggles carry-over', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/budget');
    const global = await screen.findByRole('textbox', { name: 'Budget global' });
    await user.type(global, '1000{Enter}');
    expect(await screen.findByRole('meter', { name: 'Budget Budget global' })).toBeInTheDocument();
    const food = screen.getByRole('textbox', { name: 'Alimentation' });
    await user.type(food, 'abc');
    await user.tab();
    expect(
      await screen.findAllByText('Montant invalide. Exemples acceptés : 12,50 ou 6x15.'),
    ).not.toHaveLength(0);
    await user.clear(food);
    await user.type(food, '100+50{Enter}');
    expect(await screen.findByRole('meter', { name: 'Budget Alimentation' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('switch', { name: /Reporter le solde/ })[0]!);
    await waitFor(async () =>
      expect((await getDb().budgets.toArray()).some((b) => b.rollover)).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }));
    expect(await screen.findAllByText(/Reconduit depuis Octobre 2026/)).not.toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Copier le mois précédent' }));
    expect(await screen.findByText('2 enveloppes copiées')).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Alimentation' }));
    await user.tab();
    await navigate(router, '/');
    expect(await screen.findByText('Reste du budget')).toBeInTheDocument();
  });
});

describe('dashboard with data', () => {
  it('shows KPIs, alerts, categories, accounts, goals and month navigation', async () => {
    const user = userEvent.setup();
    await setBudget('2026-10', categories.Logement ?? null, 50000, false);
    await saveGoal({ name: 'Voyage', targetMinor: 200000, dueDate: '2027-06-01', accountId: null });
    await renderApp('/');
    expect(await screen.findByText('Reste du budget')).toBeInTheDocument();
    expect(screen.getByText(/Logement : budget dépassé/)).toBeInTheDocument();
    expect(screen.getByText(/Aucune sauvegarde exportée/)).toBeInTheDocument();
    expect(screen.getByText('Comptes')).toBeInTheDocument();
    expect(screen.getByText('Voyage')).toBeInTheDocument();
    expect(screen.getByText(/Prévision de fin de mois/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }));
    expect(await screen.findByText('Septembre 2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Septembre 2026' }));
    expect(await screen.findByText('Octobre 2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exporter maintenant' }));
    expect(await screen.findByText(/Sauvegarde exportée/)).toBeInTheDocument();
  });

  it('confirms due planned operations from the alert', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Tout valider' }));
    await waitFor(async () =>
      expect((await allLiveOperations()).every((o) => o.status === 'cleared')).toBe(true),
    );
  });
});

describe('analytics screen', () => {
  it('renders every tab with a data table and exports', async () => {
    const user = userEvent.setup();
    const tag = await createTag('café', '#6250d6');
    const ids = (await allLiveOperations())
      .filter((o) => o.label.toLowerCase().startsWith('caf'))
      .map((o) => o.id);
    await bulkUpdateOperations(ids, { addTagIds: [tag.id] });
    await renderApp('/analytics');
    expect(await screen.findByText('Dépenses par catégorie sur 12 mois')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Données' }));
    const table = screen.getByRole('region', { name: /Données de/ });
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(5);
    await user.click(
      screen.getByRole('button', {
        name: /Exporter « Dépenses par catégorie sur 12 mois » en PNG/,
      }),
    );
    await user.click(screen.getByRole('button', { name: /en CSV/ }));
    for (const tab of [
      'Comparaison',
      'Revenus et dépenses',
      'Vue annuelle',
      'Top libellés',
      'Tags',
    ]) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    }
    expect(screen.getByText(/#café sur 12 mois/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Vue annuelle' }));
    expect(screen.getByText('Année 2026')).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Top libellés' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }));
  });
});
