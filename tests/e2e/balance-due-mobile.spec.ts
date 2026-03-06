import { expect, test } from '@playwright/test';

const widths = [320, 390, 430];

test.describe('balance due mobile layout', () => {
  test('bottom nav routes to Balance Due and key sections render cleanly', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'Balance Due' }).click();
      await expect(page.getByRole('heading', { name: 'Balance Due' })).toBeVisible();
      await expect(page.getByText('Grand Total')).toBeVisible();
      await expect(page.getByText('Shipped')).toBeVisible();
      await expect(page.getByText('Sold')).toBeVisible();
      await expect(page.getByPlaceholder('Search by car, plate, VIN, id')).toBeVisible();

      const nav = page.locator('[aria-label="Mobile quick navigation"]');
      await expect(nav).toBeVisible();
      await expect(page.getByRole('button', { name: 'Balance Due' })).toHaveAttribute('aria-current', 'page');

      const navBox = await nav.boundingBox();
      const searchBox = await page.getByPlaceholder('Search by car, plate, VIN, id').boundingBox();
      expect(navBox, `Bottom nav should render at width ${width}`).toBeTruthy();
      expect(searchBox, `Search should render at width ${width}`).toBeTruthy();
      if (navBox && searchBox) {
        expect(searchBox.y + searchBox.height).toBeLessThanOrEqual(navBox.y);
      }

      await expect(page).toHaveScreenshot(`balance-due-mobile-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
      });

      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Balance Due' }).click();
      await expect(page.getByRole('heading', { name: 'Balance Due' })).toBeVisible();
    }

    expect(consoleErrors, `Console errors detected:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
