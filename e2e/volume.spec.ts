import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Volume test: 50 000 operations (run `pnpm fixture:demo --perf` first; CI does).
 * Targets (spec §11): filter < 100 ms, dashboard < 300 ms, JSON export < 2 s.
 */
const DATASET = 'e2e/.data/perf-50000.json';

/** Longest User Timing measure of that name (fails if none was recorded). */
async function longest(page: Page, name: string): Promise<number> {
  const durations = await page.evaluate(
    (n) => performance.getEntriesByName(n).map((e) => e.duration),
    name,
  );
  expect(durations.length, `no "${name}" measure recorded`).toBeGreaterThan(0);
  return Math.max(...durations);
}

test.describe('50 000 opérations', () => {
  test.skip(!existsSync(DATASET), 'Generate the dataset with: pnpm fixture:demo --perf');
  test.skip(({ browserName }) => browserName !== 'chromium', 'Measured on Chromium');
  test.setTimeout(180_000);

  test('filtre < 100 ms, tableau de bord < 300 ms, export JSON < 2 s', async ({ page }) => {
    // Real clock here (no fixed time): User Timing measures need performance.now().
    await page.goto('#/import');
    await page.setInputFiles('input[type=file]', DATASET);
    await page.getByRole('button', { name: 'Restaurer la sauvegarde' }).click({ timeout: 60_000 });
    await expect(page.getByText(/opérations importées\./)).toBeVisible({ timeout: 60_000 });

    const started = Date.now();
    await page.goto('#/');
    await expect(page.getByText('Dépenses par catégorie')).toBeVisible({ timeout: 30_000 });
    const dashboardLoad = Date.now() - started;
    const derive = await longest(page, 'finances:derive');
    const dashboard = await longest(page, 'finances:dashboard');

    await page.goto('#/operations?preset=all');
    // A transfer is one row for two legs: the list shows slightly fewer rows than operations.
    const count = page.getByText(/^\d[\d\s]* opérations?$/);
    await expect(count).toBeVisible({ timeout: 30_000 });
    const rows = Number((await count.innerText()).replace(/\D/g, ''));
    expect(rows).toBeGreaterThan(49_000);
    await page.evaluate(() => performance.clearMeasures('finances:filter'));
    await page.getByRole('searchbox').fill('cafe');
    await expect
      .poll(async () => Number((await count.innerText()).replace(/\D/g, '')))
      .toBeLessThan(rows);
    const filter = await longest(page, 'finances:filter');
    await page.mouse.wheel(0, 20_000);
    await page.mouse.wheel(0, -10_000);

    await page.goto('#/settings/data');
    const download = page.waitForEvent('download');
    const exportStart = Date.now();
    await page.getByRole('button', { name: 'Exporter la sauvegarde (JSON)' }).click();
    await download;
    const exportTime = Date.now() - exportStart;

    console.log(JSON.stringify({ dashboardLoad, derive, dashboard, filter, exportTime }));
    expect(filter).toBeLessThan(100);
    // Dashboard: shared figures (derive) + computing and rendering every card.
    expect(derive + dashboard).toBeLessThan(300);
    expect(exportTime).toBeLessThan(2000);
  });
});
