import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { importWorkbook, openApp } from './helpers';

const SCREENS = [
  '#/',
  '#/operations',
  '#/budget',
  '#/analytics',
  '#/settings/general',
  '#/settings/categories',
  '#/settings/data',
  '#/import',
];

for (const scheme of ['light', 'dark'] as const) {
  test(`aucune violation serious ou critical, thème ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await importWorkbook(page);
    for (const route of SCREENS) {
      await page.goto(route);
      await expect(page.locator('#main')).toBeVisible();
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(
        blocking.map(
          (v) =>
            `${route} ${v.id}: ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(' | ')}`,
        ),
      ).toEqual([]);
    }
    await page.keyboard.press('n');
    await expect(page.getByRole('dialog')).toBeVisible();
    const dialogResults = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(
      dialogResults.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => v.id),
    ).toEqual([]);
  });
}

test('navigation clavier : lien d’évitement et focus visible', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Aller au contenu' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});
