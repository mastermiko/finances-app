import { expect, type Page } from '@playwright/test';

export const FIXTURE = 'src/test/fixtures/finances-fictif.xlsx';

/** Opens the app on a fixed date (the workbook ends in October 2026). */
export async function openApp(
  page: Page,
  route = '#/',
  now = '2026-10-23T10:00:00+02:00',
): Promise<void> {
  await page.clock.setFixedTime(new Date(now));
  await page.goto(route);
  await expect(page.locator('#main')).toBeVisible();
}

export async function importWorkbook(page: Page): Promise<void> {
  await page.goto('#/import');
  await page.setInputFiles('input[type=file]', FIXTURE);
  await expect(page.getByText('Contrôle des soldes du classeur')).toBeVisible();
  await page.getByRole('button', { name: /^Importer \d+ opérations$/ }).click();
  await expect(page.getByRole('button', { name: 'Télécharger le rapport d’import' })).toBeVisible();
}

export async function addExpense(
  page: Page,
  amount: string,
  label: string,
  category: string,
): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Montant', exact: true }).fill(amount);
  await dialog.getByRole('combobox', { name: /Libellé/ }).fill(label);
  await dialog.getByRole('radio', { name: category }).check();
  await dialog.getByRole('textbox', { name: 'Montant', exact: true }).press('Enter');
  await expect(dialog).toBeHidden();
}

/**
 * Collects console errors and uncaught exceptions (CSP or Trusted Types
 * violations, failed chunk loads, render errors). Assert it stays empty.
 */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  // Route + source location: tells which screen and which file triggered the error.
  const where = (): string => new URL(page.url()).hash || '#/';
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const { url, lineNumber, columnNumber } = message.location();
    const source = url ? ` @ ${url.split('/').pop() ?? url}:${lineNumber}:${columnNumber}` : '';
    errors.push(`${where()} ${message.text()}${source}`);
  });
  page.on('pageerror', (error) => errors.push(`${where()} ${error.message}`));
  return errors;
}
