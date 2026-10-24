import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { importWorkbook, openApp } from './helpers';

/** axe measures contrast as painted: wait until opening animations (opacity) are over. */
async function animationsDone(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // Infinite ones (spinners, skeletons) never finish.
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished),
    ),
  );
}

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
      await animationsDone(page);
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
              .slice(0, 3)
              .map(
                (n) =>
                  `${n.target.join(' ')} — ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 200)}`,
              )
              .join(' | ')}`,
        ),
      ).toEqual([]);
    }
    await page.keyboard.press('n');
    await expect(page.getByRole('dialog')).toBeVisible();
    await animationsDone(page);
    const dialogResults = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(
      dialogResults.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .flatMap((v) =>
          v.nodes
            .slice(0, 5)
            .map(
              (n) =>
                `dialog ${v.id}: ${n.target.join(' ')} — ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 240)}`,
            ),
        ),
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
