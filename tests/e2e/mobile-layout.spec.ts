import { expect, test } from '@playwright/test';

const widths = [320, 360, 390, 414, 430];

test.describe('mobile adaptive actions', () => {
  test('shell + FAB are visible across phone widths', async ({ page }) => {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-mobile-shell="true"]')).toBeVisible();
      await expect(page.locator('.app-mobile-nav')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add sale' })).toBeVisible();

      const bounds = await page.getByRole('button', { name: 'Add sale' }).boundingBox();
      expect(bounds).toBeTruthy();
      if (bounds) {
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      }
    }
  });

  test('mobile visual snapshots for key shell widths', async ({ page }) => {
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot(`mobile-shell-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
});
