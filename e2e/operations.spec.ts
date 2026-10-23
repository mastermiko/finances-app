import { expect, test } from '@playwright/test';
import { addExpense, openApp } from './helpers';

test.describe('OP-02 modifier, dupliquer, supprimer', () => {
  test('supprime une seule ligne parmi deux identiques, annulation pendant 10 s', async ({
    page,
  }) => {
    await openApp(page);
    await addExpense(page, '2,5', 'Café', 'Alimentation');
    await addExpense(page, '2,5', 'Café', 'Alimentation');
    await page.goto('#/operations');
    const rows = page.getByRole('button', { name: /^Café, −2,50 €/ });
    await expect(rows).toHaveCount(2);
    await page.getByRole('button', { name: 'Actions pour « Café »' }).first().click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    await expect(rows).toHaveCount(1);
    await page.getByRole('status').getByRole('button', { name: 'Annuler' }).last().click();
    await expect(rows).toHaveCount(2);
  });

  test('modifie une opération depuis la liste et la retrouve dans la corbeille après suppression', async ({
    page,
  }) => {
    await openApp(page);
    await addExpense(page, '20', 'Essence', 'Transport');
    await page.goto('#/operations');
    await page.getByRole('button', { name: 'Actions pour « Essence »' }).click();
    await page.getByRole('menuitem', { name: 'Modifier' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Montant', exact: true }).fill('25,40');
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('button', { name: /Essence, −25,40 €/ })).toBeVisible();
    await page.getByRole('button', { name: 'Actions pour « Essence »' }).click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    await page.goto('#/settings/trash');
    await expect(page.getByText('Essence')).toBeVisible();
    await page.getByRole('button', { name: 'Restaurer', exact: true }).click();
    await page.goto('#/operations');
    await expect(page.getByRole('button', { name: /Essence, −25,40 €/ })).toBeVisible();
  });

  test('OP-04 filtres combinables et total de la sélection', async ({ page }) => {
    await openApp(page);
    await addExpense(page, '10', 'Café', 'Alimentation');
    await addExpense(page, '30', 'Essence', 'Transport');
    await page.goto('#/operations');
    await expect(page.getByText('Total de la sélection :')).toBeVisible();
    await page.getByRole('searchbox').fill('cafe');
    await expect(page.getByText('1 opération')).toBeVisible();
    await expect(page.getByRole('button', { name: /Essence/ })).toHaveCount(0);
  });

  test('sélection multiple et recatégorisation annulable', async ({ page }) => {
    await openApp(page);
    await addExpense(page, '10', 'Netflix', 'Loisirs');
    await page.goto('#/operations');
    await page.getByRole('button', { name: 'Sélectionner plusieurs opérations' }).click();
    await page.getByRole('checkbox', { name: 'Sélectionner « Netflix »' }).check();
    await page.getByRole('button', { name: 'Changer de catégorie' }).click();
    await page.getByRole('dialog').getByRole('radio', { name: 'Abonnements' }).check();
    await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
    await expect(page.getByRole('status').getByText(/classée dans « Abonnements »/)).toBeVisible();
  });
});
