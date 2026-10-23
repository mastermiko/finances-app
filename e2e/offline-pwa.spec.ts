import { expect, test } from '@playwright/test';
import { addExpense, openApp } from './helpers';

test.describe('PWA hors ligne', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Service worker offline emulation is reliable in Chromium only',
  );

  test('toutes les fonctions restent disponibles réseau coupé', async ({ page, context }) => {
    await openApp(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#main')).toBeVisible();
    await addExpense(page, '3,20', 'Boulangerie', 'Alimentation');
    for (const route of [
      '#/operations',
      '#/budget',
      '#/analytics',
      '#/settings/data',
      '#/import',
    ]) {
      await page.goto(route);
      await expect(page.locator('#main h1').first()).toBeVisible();
    }
    await context.setOffline(false);
  });
});
