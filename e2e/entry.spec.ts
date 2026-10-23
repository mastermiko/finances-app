import { expect, test } from '@playwright/test';
import { addExpense, openApp } from './helpers';

test.describe('OP-01 saisie', () => {
  test('saisie clavier complète avec calcul, validation par Entrée', async ({ page }) => {
    await openApp(page);
    await addExpense(page, '6x15', 'Restaurant', 'Alimentation');
    await expect(
      page.getByRole('status').getByText('Opération enregistrée : −90,00 €'),
    ).toBeVisible();
    await page.goto('#/operations');
    await expect(page.getByRole('button', { name: /Restaurant, −90,00 €/ })).toBeVisible();
  });

  test('accepte 12,5+3 et -(10+5,3) et refuse un montant invalide avec un message correctif', async ({
    page,
  }) => {
    await openApp(page);
    await page.keyboard.press('n');
    const dialog = page.getByRole('dialog');
    const amount = dialog.getByRole('textbox', { name: 'Montant', exact: true });
    await amount.fill('12,5+3');
    await expect(dialog.getByText('Résultat : 15,50 €')).toBeVisible();
    await amount.fill('-(10+5,3)');
    await expect(dialog.getByText('Résultat : 15,30 €')).toBeVisible();
    await amount.fill('12a');
    await amount.press('Enter');
    await expect(
      dialog.getByText('Montant invalide. Exemples acceptés : 12,50 ou 6x15.'),
    ).toBeVisible();
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
  });

  test('bascule revenu en un geste et « Enregistrer et nouveau » enchaîne', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('n');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: 'Revenu' }).check();
    await dialog.getByRole('textbox', { name: 'Montant', exact: true }).fill('1240');
    await dialog.getByRole('combobox', { name: /Libellé/ }).fill('Salaire');
    await dialog.getByRole('radio', { name: 'Revenu', exact: true }).last().check();
    await dialog.getByRole('button', { name: 'Enregistrer et nouveau' }).click();
    await expect(dialog.getByRole('textbox', { name: 'Montant', exact: true })).toHaveValue('');
    await expect(dialog.getByRole('textbox', { name: 'Montant', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await page.goto('#/');
    await expect(page.getByText('+1 240,00 €').first()).toBeVisible();
  });

  test('autocomplétion du libellé avec la catégorie habituelle', async ({ page }) => {
    await openApp(page);
    await addExpense(page, '2,5', 'Café', 'Alimentation');
    await page.keyboard.press('n');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Montant', exact: true }).fill('3');
    const label = dialog.getByRole('combobox', { name: /Libellé/ });
    await label.fill('caf');
    await expect(dialog.getByRole('option', { name: /Café/ })).toBeVisible();
    await label.press('ArrowDown');
    await label.press('Enter');
    await expect(label).toHaveValue('Café');
    await expect(dialog.getByRole('radio', { name: 'Alimentation' })).toBeChecked();
  });

  test('OP-03 charge sans date affichée en tête du mois', async ({ page }) => {
    await openApp(page);
    await addExpense(page, '10', 'Courses', 'Alimentation');
    await page.keyboard.press('n');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Montant', exact: true }).fill('550');
    await dialog.getByRole('combobox', { name: /Libellé/ }).fill('Loyer');
    await dialog.getByRole('radio', { name: 'Logement' }).check();
    await dialog.getByRole('button', { name: 'Sans date' }).click();
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.goto('#/operations');
    const headers = page.locator('h3');
    await expect(headers.first()).toHaveText(/Charges sans date/);
  });

  test('brouillon conservé si la page se ferme pendant la saisie', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('n');
    await page
      .getByRole('dialog')
      .getByRole('textbox', { name: 'Montant', exact: true })
      .fill('42');
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.locator('#main')).toBeVisible();
    await page.keyboard.press('n');
    await expect(page.getByText('Brouillon restauré.')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByRole('textbox', { name: 'Montant', exact: true }),
    ).toHaveValue('42');
  });
});
