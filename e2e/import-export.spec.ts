import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { importWorkbook, openApp } from './helpers';

test.describe('IO-01 import du classeur', () => {
  test('importe les opérations sans aucun écart de solde et produit un rapport', async ({
    page,
  }) => {
    await openApp(page);
    const started = Date.now();
    await page.goto('#/import');
    await page.setInputFiles('input[type=file]', 'src/test/fixtures/finances-fictif.xlsx');
    await expect(page.getByText('Aucun écart')).toBeVisible();
    await expect(page.getByText('Avril2026, ligne 43 — Ligne sans montant')).toBeVisible();
    await expect(
      page.getByText(
        /Mois absents du classeur : Mai 2026, Juin 2026, Juillet 2026, Août 2026, Septembre 2026/,
      ),
    ).toBeVisible();
    await expect(page.getByText(/Octobre2026 : report G2 saisi à la main/)).toBeVisible();
    await page.getByRole('button', { name: 'Importer 364 opérations' }).click();
    await expect(page.getByText('364 opérations importées.')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(3000 + 2000); // < 3 s for the import itself, plus navigation
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger le rapport d’import' }).click();
    const report = readFileSync(await (await download).path(), 'utf8');
    expect(report).toContain('| Octobre2026 | 45 |');
    expect(report).toContain('Opérations importées : 364');
    await page.goto('#/?m=2026-10');
    await expect(page.getByText(/^\+2\s051,32\s€$/).first()).toBeVisible();
  });

  test('l’import est annulable en un clic', async ({ page }) => {
    await openApp(page);
    await importWorkbook(page);
    await page.getByRole('button', { name: 'Annuler cet import' }).click();
    await expect(page.getByRole('status').getByText('Import annulé.')).toBeVisible();
    await page.goto('#/operations?preset=all');
    await expect(page.getByText('Aucune opération pour l’instant')).toBeVisible();
  });
});

test.describe('IO-02 export et réimport', () => {
  test('export JSON puis réimport dans un navigateur vierge : données identiques octet pour octet', async ({
    browser,
  }) => {
    const first = await browser.newContext({ locale: 'fr-FR' });
    const page = await first.newPage();
    await openApp(page);
    await importWorkbook(page);
    await page.goto('#/settings/data');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter la sauvegarde (JSON)' }).click();
    const file = test.info().outputPath('export.json');
    await (await download).saveAs(file);
    const original = readFileSync(file, 'utf8');
    expect((await download).suggestedFilename()).toMatch(
      /^finances_\d{4}-\d{2}-\d{2}_\d{4}\.json$/,
    );
    await first.close();

    const second = await browser.newContext({ locale: 'fr-FR' });
    const page2 = await second.newPage();
    await openApp(page2);
    await page2.goto('#/import');
    await page2.setInputFiles('input[type=file]', file);
    await expect(page2.getByText('Somme de contrôle vérifiée')).toBeVisible();
    await page2.getByRole('button', { name: 'Restaurer la sauvegarde' }).click();
    await expect(page2.getByText(/opérations importées\./)).toBeVisible();
    await page2.goto('#/settings/data');
    const download2 = page2.waitForEvent('download');
    await page2.getByRole('button', { name: 'Exporter la sauvegarde (JSON)' }).click();
    const again = readFileSync(await (await download2).path(), 'utf8');
    const dataOf = (text: string): string => text.slice(text.indexOf('"data":'));
    expect(dataOf(again)).toBe(dataOf(original));
    expect(JSON.parse(again).checksum).toBe(JSON.parse(original).checksum);
    await second.close();
  });

  test('export CSV avec BOM, point-virgule et protection contre les formules', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('n');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Montant', exact: true }).fill('5');
    await dialog.getByRole('combobox', { name: /Libellé/ }).fill('=HYPERLINK("x")');
    await dialog.getByRole('radio', { name: 'Loisirs' }).check();
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.goto('#/settings/data');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter en CSV' }).click();
    const csv = readFileSync(await (await download).path(), 'utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Date;Période;Montant;Devise;Type;Catégorie');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(';-5,00;EUR;Dépense;Loisirs;');
  });
});
