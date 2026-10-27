import { expect, test, type Page } from '@playwright/test';

/**
 * Captures README screenshots of every page with the demo station.
 *   SCREENSHOTS=1 pnpm --filter @myenergy/web test:e2e --project=desktop screenshots
 * History needs the API running with demo data (`pnpm --filter @myenergy/api seed:demo`).
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to capture screenshots');

const OUT = '../../docs/screenshots';
const VIEWPORTS = { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } } as const;

async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByTestId('demo-button').click();
  await expect(page.getByTestId('runtime')).toBeVisible();
  // Let a few frames arrive so the sparkline and counters have data.
  await page.waitForTimeout(6000);
}

for (const theme of ['dark', 'light'] as const) {
  for (const [size, viewport] of Object.entries(VIEWPORTS)) {
    test(`${theme} ${size}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}-${size}-${theme}.png`, fullPage: size === 'desktop' });

      await page.goto('/');
      await page.waitForTimeout(1200);
      await shot('connect');

      await startDemo(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot('dashboard');

      // Client-side navigation keeps the demo connection alive.
      await page.getByRole('link', { name: 'Planner' }).last().click();
      await expect(page.getByTestId('planner-runtime')).toBeVisible();
      await page.waitForTimeout(800);
      await shot('planner');

      await page.getByRole('link', { name: 'History' }).last().click();
      await page.waitForTimeout(2500);
      await shot('history');

      await page.getByRole('link', { name: 'Settings' }).last().click();
      await page.waitForTimeout(800);
      await shot('settings');
    });
  }
}

test('persian rtl', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.addCookies([{ name: 'NEXT_LOCALE', value: 'fa', url: 'http://localhost:3100' }]);
  await page.setViewportSize(VIEWPORTS.desktop);
  await startDemo(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/dashboard-desktop-dark-fa.png` });
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/dashboard-mobile-dark-fa.png` });
});
