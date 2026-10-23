import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allLiveOperations, listTrash } from '@/data';
import { freshDatabase, navigate, renderApp, resetEnvironment } from '@/test/render-app';
import { seed } from './seed';

beforeEach(async () => {
  await freshDatabase();
  await seed();
});
afterEach(async () => {
  (window as unknown as { __wide?: boolean }).__wide = false;
  await resetEnvironment();
});

describe('operations screen', () => {
  it('lists the month with undated charges first and the selection total', async () => {
    await renderApp('/operations');
    expect(await screen.findByText('Charges sans date')).toBeInTheDocument();
    expect(screen.getByText('7 opérations')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '');
    expect(headings[0]).toMatch(/Charges sans date/);
    expect(screen.getByRole('button', { name: /Loyer, −550,00\s€/ })).toBeInTheDocument();
  });

  it('filters by text, preset, filters dialog and chips', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/operations');
    await user.type(await screen.findByRole('searchbox'), 'cafe');
    await waitFor(() => expect(screen.getByText('2 opérations')).toBeInTheDocument());
    await user.clear(screen.getByRole('searchbox'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Période' }), 'all');
    await waitFor(() => expect(screen.getByText('9 opérations')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Filtres/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Transport' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Dépense' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Minimum' }), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Afficher les résultats' }));
    await waitFor(() => expect(screen.getByText('1 opération')).toBeInTheDocument());
    expect(router.state.location.search).toMatchObject({ min: 1000 });
    await user.click(screen.getByRole('button', { name: 'Retirer le filtre Transport' }));
    await waitFor(() => expect(screen.getByText('4 opérations')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    await waitFor(() => expect(screen.getByText('9 opérations')).toBeInTheDocument());
    await navigate(router, '/operations?preset=custom&from=%222026-09%22&to=%222026-09%22');
    await waitFor(() => expect(screen.getByText('2 opérations')).toBeInTheDocument());
  });

  it('sorts, navigates months and selects several operations for bulk actions', async () => {
    const user = userEvent.setup();
    await renderApp('/operations');
    await user.click(
      await screen.findByRole('button', { name: 'Trier du plus récent au plus ancien' }),
    );
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }));
    await waitFor(() => expect(screen.getByText('2 opérations')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }));
    await user.click(screen.getByRole('button', { name: 'Sélectionner plusieurs opérations' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Sélectionner « Essence »' }));
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner « Cinéma »' }));
    expect(screen.getByText('2 sélectionnées')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Valider les prévues' }));
    await waitFor(async () =>
      expect((await allLiveOperations()).every((o) => o.status === 'cleared')).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: 'Changer de catégorie' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Loisirs' }));
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(await screen.findByText(/2 opérations classées dans « Loisirs »/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter un tag' }));
    expect(await screen.findByText(/Aucun tag/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Tout sélectionner' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await waitFor(async () => expect(await listTrash()).toHaveLength(7));
    await user.click(screen.getByRole('button', { name: 'Terminer la sélection' }));
  });

  it('row menu edits, duplicates and deletes a single line', async () => {
    const user = userEvent.setup();
    await renderApp('/operations');
    const before = (await allLiveOperations()).length;
    await user.click(await screen.findByRole('button', { name: 'Actions pour « Essence »' }));
    await user.click(screen.getByRole('menuitem', { name: 'Dupliquer' }));
    await waitFor(async () => expect(await allLiveOperations()).toHaveLength(before + 1));
    const menus = screen.getAllByRole('button', { name: 'Actions pour « Café »' });
    await user.click(menus[0]!);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(async () => expect(await allLiveOperations()).toHaveLength(before));
    fireEvent.keyDown(screen.getAllByRole('button', { name: /Essence, −40,00\s€/ })[0]!, {
      key: 'e',
    });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows the detail panel side by side on wide screens', async () => {
    (window as unknown as { __wide?: boolean }).__wide = true;
    const user = userEvent.setup();
    await renderApp('/operations');
    await user.click(await screen.findByRole('button', { name: /Essence, −40,00\s€/ }));
    const panel = await screen.findByRole('complementary', { name: 'Détail de l’opération' });
    expect(within(panel).getByText('plein moto')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Modifier' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(within(panel).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
  });

  it('exports the filtered selection as CSV', async () => {
    const user = userEvent.setup();
    await renderApp('/operations');
    await user.click(await screen.findByRole('button', { name: 'Exporter la sélection (CSV)' }));
    expect(await screen.findByText('7 opérations exportées.')).toBeInTheDocument();
  });
});
