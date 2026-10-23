import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allLiveOperations, getDb, kvSet, requireSettings, setBudget } from '@/data';
import { freshDatabase, renderApp, resetEnvironment } from '@/test/render-app';

beforeEach(async () => {
  await freshDatabase();
});
afterEach(async () => {
  await resetEnvironment();
});

async function openEntry(): Promise<HTMLElement> {
  fireEvent.keyDown(document, { key: 'n' });
  return screen.findByRole('dialog');
}

describe('dashboard', () => {
  it('shows the first-launch empty state with both actions', async () => {
    await renderApp('/');
    expect(
      await screen.findByText('Vos finances, sur cet appareil uniquement'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importer mon classeur' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Saisir ma première opération' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('entry form', () => {
  it('saves an expense typed with a calculation, keyboard only', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    const dialog = await openEntry();
    const amount = within(dialog).getByRole('textbox', { name: 'Montant' });
    await waitFor(() => expect(amount).toHaveFocus());
    await user.type(amount, '6x15');
    expect(within(dialog).getByText('Résultat : 90,00 €')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('combobox', { name: /Libellé/ }), 'Restaurant');
    await user.click(within(dialog).getByRole('radio', { name: 'Alimentation' }));
    await user.type(amount, '{Enter}');
    await waitFor(async () => expect(await allLiveOperations()).toHaveLength(1));
    const [op] = await allLiveOperations();
    expect(op).toMatchObject({
      amountMinor: -9000,
      amountExpression: '6x15',
      label: 'Restaurant',
      date: '2026-10-23',
      period: '2026-10',
    });
    expect(await screen.findByText('Opération enregistrée : −90,00 €')).toBeInTheDocument();
    // Dashboard now shows the month
    expect(await screen.findByText('Dernières opérations')).toBeInTheDocument();
  });

  it('shows corrective messages and keeps the dialog open', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    const dialog = await openEntry();
    const amount = within(dialog).getByRole('textbox', { name: 'Montant' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer', exact: true } as never),
    );
    expect(
      await within(dialog).findByText('Saisissez un montant. Exemples acceptés : 12,50 ou 6x15.'),
    ).toBeInTheDocument();
    await user.type(amount, '5/0');
    await user.type(amount, '{Enter}');
    expect(
      await within(dialog).findByText('Division par zéro. Corrigez le calcul.'),
    ).toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, '(1+2');
    await user.type(amount, '{Enter}');
    expect(await within(dialog).findByText(/Parenthèses non fermées/)).toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, '0');
    await user.type(amount, '{Enter}');
    expect(
      await within(dialog).findByText('Le montant doit être différent de zéro.'),
    ).toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, '12');
    await user.type(amount, '{Enter}');
    expect(await within(dialog).findByText('Choisissez une catégorie.')).toBeInTheDocument();
    expect(await allLiveOperations()).toHaveLength(0);
  });

  it('inserts operators, saves income and chains with “Enregistrer et nouveau”', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    const dialog = await openEntry();
    await user.click(within(dialog).getByRole('radio', { name: 'Revenu' }));
    const amount = within(dialog).getByRole('textbox', { name: 'Montant' });
    await user.type(amount, '100');
    await user.click(within(dialog).getByRole('button', { name: 'Insérer +' }));
    await user.type(amount, '20');
    expect(amount).toHaveValue('100+20');
    const incomeTile = within(dialog).getAllByRole('radio', { name: 'Revenu' }).at(-1)!;
    await user.click(incomeTile);
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer et nouveau' }));
    await waitFor(async () => expect(await allLiveOperations()).toHaveLength(1));
    expect(amount).toHaveValue('');
    expect((await allLiveOperations())[0]?.amountMinor).toBe(12000);
  });

  it('records an undated charge for a chosen month, a planned item, a note and a new tag', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    const dialog = await openEntry();
    await user.type(within(dialog).getByRole('textbox', { name: 'Montant' }), '550');
    await user.type(within(dialog).getByRole('combobox', { name: /Libellé/ }), 'Loyer');
    await user.click(within(dialog).getByRole('radio', { name: 'Logement' }));
    await user.click(within(dialog).getByRole('button', { name: 'Sans date' }));
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Mois concerné' }),
      '2026-11',
    );
    await user.click(within(dialog).getByText('Note, tags et options'));
    await user.type(within(dialog).getByRole('textbox', { name: /Note/ }), 'novembre');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Nouveau tag + Entrée' }),
      'logement{Enter}',
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'logement', pressed: true }),
      ).toBeInTheDocument(),
    );
    await user.click(within(dialog).getByRole('checkbox', { name: /Opération prévue/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: /Remboursement/ }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer', exact: true } as never),
    );
    await waitFor(async () => expect(await allLiveOperations()).toHaveLength(1));
    expect((await allLiveOperations())[0]).toMatchObject({
      date: null,
      period: '2026-11',
      status: 'planned',
      note: 'novembre',
      amountMinor: 55000,
    });
  });

  it('suggests labels with their habitual category, then edits and deletes', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    let dialog = await openEntry();
    await user.type(within(dialog).getByRole('textbox', { name: 'Montant' }), '2,5');
    await user.type(within(dialog).getByRole('combobox', { name: /Libellé/ }), 'Café');
    await user.click(within(dialog).getByRole('radio', { name: 'Loisirs' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Montant' }), '{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    dialog = await openEntry();
    await user.type(within(dialog).getByRole('textbox', { name: 'Montant' }), '3');
    const label = within(dialog).getByRole('combobox', { name: /Libellé/ });
    await user.type(label, 'ca');
    expect(await within(dialog).findByRole('option', { name: /Café/ })).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(label).toHaveValue('Café');
    expect(within(dialog).getByRole('radio', { name: 'Loisirs' })).toBeChecked();
    await user.type(within(dialog).getByRole('textbox', { name: 'Montant' }), '{Enter}');
    await waitFor(async () => expect(await allLiveOperations()).toHaveLength(2));

    // Edit the first one through the dashboard menu
    const [first] = await allLiveOperations();
    const { useUi } = await import('@/features/shared/ui-store');
    act(() => useUi.getState().openEntry({ editId: first?.id ?? '' }));
    dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Modifier l’opération')).toBeInTheDocument();
    const amount = within(dialog).getByRole('textbox', { name: 'Montant' });
    await waitFor(() => expect(amount).toHaveValue('2,5'));
    await user.clear(amount);
    await user.type(amount, '4{Enter}');
    await waitFor(async () =>
      expect((await allLiveOperations()).find((o) => o.id === first?.id)?.amountMinor).toBe(-400),
    );
    act(() => useUi.getState().openEntry({ editId: first?.id ?? '' }));
    dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: 'Supprimer' }));
    await waitFor(async () => expect(await allLiveOperations()).toHaveLength(1));
    const undo = await screen.findAllByRole('button', { name: 'Annuler' });
    await user.click(undo.at(-1)!);
    await waitFor(async () => expect(await allLiveOperations()).toHaveLength(2));
  });

  it('restores a draft and warns when a budget threshold is crossed', async () => {
    const user = userEvent.setup();
    await kvSet('entryDraft', {
      form: {
        kind: 'expense',
        amountText: '85',
        label: 'Courses',
        categoryId: null,
        categoryTouched: false,
        date: '2026-10-23',
        undated: false,
        period: '2026-10',
        accountId: (await requireSettings()).defaultAccountId,
        toAccountId: '',
        note: '',
        tagIds: [],
        refund: false,
        planned: false,
      },
      savedAt: '2026-10-23T09:00:00.000Z',
    });
    const food = (await getDb().categories.toArray()).find((c) => c.name === 'Alimentation');
    await setBudget('2026-10', food?.id ?? null, 10000, false);
    await renderApp('/');
    const dialog = await openEntry();
    expect(await within(dialog).findByText('Brouillon restauré.')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Montant' })).toHaveValue('85');
    await user.click(within(dialog).getByRole('radio', { name: 'Alimentation' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer', exact: true } as never),
    );
    expect(await screen.findByText('Alimentation : 80 % du budget atteint.')).toBeInTheDocument();
    expect(await screen.findByText('Reste du budget')).toBeInTheDocument();
  });
});
