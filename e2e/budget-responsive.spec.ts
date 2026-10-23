import { expect, test } from '@playwright/test';
import { addExpense, importWorkbook, openApp, trackPageErrors } from './helpers';

test('BUD-01 enveloppe par catégorie, jauge et alerte à 80 %', async ({ page }) => {
  await openApp(page);
  await page.goto('#/budget');
  const food = page.getByRole('textbox', { name: 'Alimentation' });
  await food.fill('100');
  await food.press('Enter');
  await expect(page.getByRole('meter', { name: 'Budget Alimentation' })).toBeVisible();
  await addExpense(page, '85', 'Courses', 'Alimentation');
  await expect(
    page.getByRole('status').getByText('Alimentation : 80 % du budget atteint.'),
  ).toBeVisible();
  await page.goto('#/');
  await expect(page.getByText(/Alimentation : 85\s*%\s*du budget consommé/)).toBeVisible();
});

for (const width of [320, 768, 1024, 1920]) {
  test(`mise en page sans défilement horizontal à ${width} px @mobile`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = trackPageErrors(page);
    await openApp(page);
    await importWorkbook(page);
    for (const route of [
      '#/',
      '#/operations',
      '#/budget',
      '#/analytics',
      '#/settings',
      '#/settings/rules',
      '#/import',
    ]) {
      await page.goto(route);
      await expect(page.locator('#main')).toBeVisible();
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, route).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
}
