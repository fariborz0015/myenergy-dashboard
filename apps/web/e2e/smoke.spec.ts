import { expect, test } from '@playwright/test';

test.describe('demo device', () => {
  test('connects to the demo station and shows SOC and runtime', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('power station');

    await page.getByTestId('demo-button').click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // SOC ring: a number followed by the percent sign.
    const status = page.getByRole('status').filter({ hasText: '%' }).first();
    await expect(status).toContainText(/\d{1,3}\s*%/);

    // Runtime estimate (charging → "to full", discharging → "left").
    await expect(page.getByTestId('runtime')).toContainText(/(\d+[dhm]).*(left|to full)|Fully charged/);

    // Per-rail switches are wired up and reflect the device.
    await expect(page.locator('#switch-acOutput')).toHaveAttribute('data-state', 'checked');
  });

  test('toggles the AC output and the device confirms it', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('empty-demo').click();
    const ac = page.locator('#switch-acOutput');
    await expect(ac).toHaveAttribute('data-state', 'checked');
    await ac.click();
    await expect(ac).toHaveAttribute('data-state', 'unchecked');
    // Still off after the optimistic window: confirmed by a 50 status frame.
    await page.waitForTimeout(4500);
    await expect(ac).toHaveAttribute('data-state', 'unchecked');
  });
});

test('every page renders, with or without the API', async ({ page }) => {
  for (const path of ['/planner', '/history', '/settings']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page.goto('/planner');
  await expect(page.getByTestId('planner-runtime')).not.toHaveText('—');
});
