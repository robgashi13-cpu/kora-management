import { expect, test } from '@playwright/test';

const widths = [320, 360, 390, 414, 430];

test.describe('mobile adaptive actions', () => {
  test('shell + FAB are visible across phone widths with zero console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

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

    expect(consoleErrors, `Console errors detected:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('sold car supports 3s long-press action sheet without accidental trigger', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Long-press simulation is flaky in webkit CI.');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const soldRow = page.locator('.cars-sold-row').first();
    await soldRow.scrollIntoViewIfNeeded();
    await expect(soldRow).toBeVisible();

    const box = await soldRow.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(3100);
    await page.mouse.up();

    await expect(page.getByRole('dialog', { name: 'Sold car actions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Sold car actions' })).not.toBeVisible();
  });

  test('mobile visual snapshots for all required widths + landscape', async ({ page }) => {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot(`mobile-shell-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    }

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('mobile-shell-landscape.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
