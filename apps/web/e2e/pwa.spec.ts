import { expect, test } from '@playwright/test';

/**
 * Installed-app checks against the app server (pnpm app:build && pnpm app:start):
 *   APP_URL=http://localhost:3210 pnpm exec playwright test pwa --project=desktop
 */
const APP_URL = process.env.APP_URL;
test.skip(!APP_URL, 'set APP_URL to the running app server');

test('is installable and precaches the app shell', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${APP_URL}/dashboard`);
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel=manifest]')?.href;
    return href ? ((await (await fetch(href)).json()) as { display: string; icons: { sizes: string }[] }) : null;
  });
  expect(manifest?.display).toBe('standalone');
  expect(manifest?.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));

  // Service worker installed and precached the shell.
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active, null, { timeout: 30_000 });
  await page.waitForFunction(
    async () => {
      const keys = await caches.keys();
      if (!keys.length) return false;
      const entries = await (await caches.open(keys[0]!)).keys();
      return entries.some((r) => r.url.endsWith('/planner')) && entries.some((r) => r.url.includes('/_next/static/'));
    },
    null,
    { timeout: 30_000 },
  );

  // Opening with the server stopped is checked manually (Playwright's offline emulation
  // blocks navigations before the service worker sees them): see README → Install as an app.
});
