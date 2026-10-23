import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  allLiveOperations,
  createBackup,
  getDb,
  listBackups,
  logError,
  requireSettings,
  softDeleteOperations,
} from '@/data';
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

describe('settings', () => {
  it('lists sections on phones and opens one with a back link', async () => {
    const user = userEvent.setup();
    await renderApp('/settings');
    expect(await screen.findByRole('heading', { name: 'Paramètres' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Général/ }));
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'Paramètres' }).length).toBeGreaterThan(1),
    );
  });

  it('general: language, theme, start day, auto-renew and reminder', async () => {
    (window as unknown as { __wide?: boolean }).__wide = true;
    const user = userEvent.setup();
    await renderApp('/settings');
    const theme = await screen.findByRole('combobox', { name: 'Thème' });
    await user.selectOptions(theme, 'dark');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Premier jour du mois budgétaire/ }),
      '26',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Format de date' }),
      'yyyy-MM-dd',
    );
    await user.click(screen.getByRole('switch', { name: /Reconduire les enveloppes/ }));
    const reminder = screen.getByRole('spinbutton', { name: /Rappel de sauvegarde/ });
    await user.clear(reminder);
    await user.type(reminder, '7');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Aide sur le mois budgétaire' }));
    expect(screen.getByText(/Si votre salaire arrive le 26/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Langue' }), 'en-GB');
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    await waitFor(async () =>
      expect(await requireSettings()).toMatchObject({
        theme: 'dark',
        budgetMonthStartDay: 26,
        budgetAutoRenew: false,
        backupReminderDays: 7,
        dateFormat: 'yyyy-MM-dd',
        locale: 'en-GB',
      }),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'CHF');
  });

  it('categories: create a sub-category, reorder, archive and delete with reassignment', async () => {
    const user = userEvent.setup();
    await renderApp('/settings/categories');
    await user.click(await screen.findByRole('button', { name: 'Nouvelle catégorie' }));
    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(within(dialog).getByText('Saisissez un nom.')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Nom' }), 'Café');
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Catégorie parente' }),
      within(dialog).getByRole('option', { name: 'Alimentation' }),
    );
    await user.click(within(dialog).getByRole('radio', { name: 'Couleur 3' }));
    await user.click(within(dialog).getByRole('radio', { name: 'coffee' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(async () =>
      expect(
        (await getDb().categories.toArray()).some((c) => c.name === 'Café' && c.parentId !== null),
      ).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: 'Monter « Logement »' }));
    await user.click(screen.getByRole('button', { name: 'Descendre « Logement »' }));
    await user.click(screen.getByRole('button', { name: 'Archiver « Santé »' }));
    expect(
      await screen.findByRole('button', { name: 'Désarchiver « Santé »' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier « Santé »' }));
    dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByRole('textbox', { name: 'Nom' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Nom' }), 'Santé et soins');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(async () =>
      expect((await getDb().categories.toArray()).some((c) => c.name === 'Santé et soins')).toBe(
        true,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Supprimer « Transport »' }));
    dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/1 opération utilise cette catégorie/)).toBeInTheDocument();
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Déplacer vers' }),
      within(dialog).getByRole('option', { name: 'Loisirs' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    await waitFor(async () =>
      expect((await getDb().categories.toArray()).some((c) => c.name === 'Transport')).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: 'Supprimer « Épargne »' }));
    dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText('Aucune opération n’utilise cette catégorie.'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
  });

  it('accounts, tags, goals', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/settings/accounts');
    await user.click(await screen.findByRole('button', { name: 'Nouveau compte' }));
    let dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Nom' }), 'Izly');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Type' }), 'prepaid');
    await user.type(within(dialog).getByRole('textbox', { name: 'Solde initial' }), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Izly')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Utiliser « Izly » par défaut' }));
    await user.click(screen.getByRole('button', { name: 'Modifier « Izly »' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Solde initial' })).toHaveValue('20');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer « Compte courant »' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }),
    );
    expect(
      await screen.findByText('Ce compte contient des opérations : archivez-le plutôt.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Archiver « Izly »' }));

    await navigate(router, '/settings/tags');
    await user.type(await screen.findByRole('textbox', { name: 'Nom du tag' }), 'voyage');
    await user.click(screen.getByRole('button', { name: 'Créer' }));
    expect(await screen.findByText('#voyage')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Nom du tag' }), 'Voyage');
    await user.click(screen.getByRole('button', { name: 'Créer' }));
    expect(await screen.findByText('Ce tag existe déjà.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier « voyage »' }));
    const input = screen.getAllByRole('textbox', { name: 'Nom du tag' }).at(-1)!;
    await user.clear(input);
    await user.type(input, 'vacances{Enter}');
    expect(await screen.findByText('#vacances')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Supprimer « vacances »' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }),
    );
    await waitFor(async () => expect(await getDb().tags.count()).toBe(0));

    await navigate(router, '/settings/goals');
    await user.click(await screen.findByRole('button', { name: 'Nouvel objectif' }));
    dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Nom' }), 'Ski');
    await user.type(within(dialog).getByRole('textbox', { name: 'Montant cible' }), '1500');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Ski')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier « Ski »' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Enregistrer' }),
    );
    await user.click(screen.getByRole('button', { name: 'Supprimer « Ski »' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }),
    );
    await waitFor(async () => expect(await getDb().goals.count()).toBe(0));
  });

  it('rules with preview and retroactive application, then label grouping', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/settings/rules');
    await user.click(await screen.findByRole('button', { name: 'Nouvelle règle' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Condition sur le libellé' }),
      'regex',
    );
    await user.type(within(dialog).getByRole('textbox', { name: /Texte recherché/ }), '(a+)+');
    expect(await within(dialog).findByText(/Expression trop coûteuse/)).toBeInTheDocument();
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Condition sur le libellé' }),
      'contains',
    );
    await user.clear(within(dialog).getByRole('textbox', { name: /Texte recherché/ }));
    await user.type(within(dialog).getByRole('textbox', { name: /Texte recherché/ }), 'cafe');
    await user.type(within(dialog).getByRole('textbox', { name: /Libellé normalisé/ }), 'Café');
    expect(within(dialog).getByText('1 opération existante concernée')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Enregistrer et appliquer/ }));
    expect(await screen.findByText('Règle appliquée à 1 opération.')).toBeInTheDocument();
    expect((await allLiveOperations()).filter((o) => o.label === 'Café')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Modifier « cafe »' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Règle active' }),
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Enregistrer' }),
    );
    expect(await screen.findByText('Désactivée')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Supprimer « cafe »' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }),
    );
    await waitFor(async () => expect(await getDb().rules.count()).toBe(0));

    await navigate(router, '/settings/labels');
    expect(await screen.findByText('Aucun libellé à regrouper.')).toBeInTheDocument();
  });

  it('recurrences: create an undated monthly charge and generate occurrences', async () => {
    const user = userEvent.setup();
    await renderApp('/settings/recurrences');
    await user.click(await screen.findByRole('button', { name: 'Nouvelle récurrence' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(within(dialog).getAllByText('Saisissez un nom.').length).toBeGreaterThan(0);
    await user.type(within(dialog).getByRole('textbox', { name: 'Nom' }), 'Netflix');
    await user.type(within(dialog).getByRole('textbox', { name: 'Montant' }), '13,49');
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Catégorie' }),
      within(dialog).getByRole('option', { name: 'Abonnements' }),
    );
    await user.click(within(dialog).getByRole('switch', { name: /Charge sans date/ }));
    await user.click(within(dialog).getByRole('switch', { name: /Valider automatiquement/ }));
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Fin' }), 'count');
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Nombre d’échéances' }), '12');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Netflix')).toBeInTheDocument();
    await waitFor(async () =>
      expect((await allLiveOperations()).filter((o) => o.label === 'Netflix')).toHaveLength(2),
    );
    await user.click(screen.getByRole('button', { name: 'Générer les échéances' }));
    expect(await screen.findByText('Aucune nouvelle échéance.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mettre « Netflix » en pause' }));
    expect(await screen.findByText('En pause')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier « Netflix »' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annuler' }),
    );
    await user.click(screen.getByRole('button', { name: 'Supprimer « Netflix »' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }),
    );
    await waitFor(async () => expect(await getDb().recurrences.count()).toBe(0));
  });

  it('data: JSON, encrypted and spreadsheet exports, import history', async () => {
    const user = userEvent.setup();
    await renderApp('/settings/data');
    await user.click(await screen.findByRole('button', { name: 'Exporter la sauvegarde (JSON)' }));
    expect(await screen.findByText(/Sauvegarde exportée/)).toBeInTheDocument();
    await waitFor(async () => expect((await requireSettings()).lastBackupAt).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Exporter la sauvegarde chiffrée' }));
    expect(await screen.findByText('Au moins 8 caractères.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Mot de passe'), 'un-mot-de-passe');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'autre');
    await user.click(screen.getByRole('button', { name: 'Exporter la sauvegarde chiffrée' }));
    expect(await screen.findByText('Les deux mots de passe sont différents.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exporter en Excel' }));
    expect(await screen.findByText(/opérations exportées/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Du mois' }), '2026-10');
    await user.click(screen.getByRole('button', { name: 'Exporter en CSV' }));
    expect(screen.getByText('Aucun import.')).toBeInTheDocument();
  });

  it('backups, trash, storage, privacy, help, about and reset', async () => {
    const user = userEvent.setup();
    await createBackup('manual', '1.0.0');
    const [first] = await allLiveOperations();
    await softDeleteOperations([first?.id ?? '']);
    await logError(new Error('test'), '#/', '1.0.0');
    const { router } = await renderApp('/settings/trash');
    expect(await screen.findByRole('button', { name: 'Tout restaurer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vider la corbeille' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Vider la corbeille',
      }),
    );
    expect(await screen.findByText('La corbeille est vide.')).toBeInTheDocument();

    await navigate(router, '/settings/backups');
    expect(await screen.findByText('Manuelle', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Créer une sauvegarde maintenant' }));
    await waitFor(async () => expect(await listBackups()).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: 'Télécharger' })[0]!);
    await user.click(screen.getAllByRole('button', { name: 'Restaurer' })[1]!);
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Restaurer' }),
    );
    expect(await screen.findByText('Sauvegarde restaurée.')).toBeInTheDocument();

    await navigate(router, '/settings/storage');
    expect(await screen.findByText('Stockage persistant')).toBeInTheDocument();
    await navigate(router, '/settings/privacy');
    expect(await screen.findByText('Où sont vos données')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Effacer toutes mes données' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Continuer sans exporter',
      }),
    );
    const confirm = await screen.findByRole('alertdialog', { name: 'Effacer définitivement ?' });
    expect(
      within(confirm).getByRole('button', { name: 'Effacer toutes mes données' }),
    ).toBeDisabled();
    await user.click(within(confirm).getByRole('button', { name: 'Annuler' }));

    await navigate(router, '/settings/help');
    await user.click(await screen.findByRole('tab', { name: 'Raccourcis' }));
    expect(screen.getByText('Nouvelle opération', { selector: 'dd' })).toBeInTheDocument();
    await navigate(router, '/settings/about');
    expect(await screen.findByText('1 erreur enregistrée.', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exporter le journal' }));
    await user.click(screen.getByRole('button', { name: 'Vider le journal' }));

    await navigate(router, '/settings/danger');
    await user.click(await screen.findByRole('button', { name: 'Réinitialiser' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Continuer sans exporter',
      }),
    );
    const reset = await screen.findByRole('alertdialog', {
      name: 'Réinitialiser toutes les données ?',
    });
    await user.type(within(reset).getByRole('textbox'), 'RÉINITIALISER');
    await user.click(within(reset).getByRole('button', { name: 'Réinitialiser' }));
    await waitFor(async () => expect(await allLiveOperations()).toHaveLength(0));
    expect(await getDb().categories.count()).toBe(8);
  });
});
