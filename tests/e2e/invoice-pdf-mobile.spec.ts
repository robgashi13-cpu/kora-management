import { expect, test } from '@playwright/test';

const widths = [320, 390, 430];

test.describe('invoice + pdf mobile layout', () => {
  test('invoice tab and pdf preview keep actions visible with clean console/network', async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => {
      failedRequests.push(`${request.method()} ${request.url()} -> ${request.failure()?.errorText || 'failed'}`);
    });

    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'Invoices' }).click();
      await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();

      const actionBar = page.locator('[aria-label="Invoice mobile action bar"]');
      await expect(actionBar).toBeVisible();
      const downloadButton = page.getByRole('button', { name: /Download \(\d+\)/ });
      await expect(downloadButton).toBeVisible();
      await expect(page.getByRole('button', { name: 'Select valid' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Preview' })).toBeVisible();

      const nav = page.locator('[aria-label="Mobile quick navigation"]');
      await expect(nav).toBeVisible();
      const [actionBarBox, navBox, downloadBox] = await Promise.all([actionBar.boundingBox(), nav.boundingBox(), downloadButton.boundingBox()]);
      expect(actionBarBox, `Invoice action bar should render at width ${width}`).toBeTruthy();
      expect(navBox, `Bottom nav should render at width ${width}`).toBeTruthy();
      expect(downloadBox, `Download button should render at width ${width}`).toBeTruthy();
      if (actionBarBox && navBox && downloadBox) {
        expect(actionBarBox.y + actionBarBox.height).toBeLessThanOrEqual(navBox.y + 1);
        expect(downloadBox.y + downloadBox.height).toBeLessThanOrEqual(navBox.y + 1);
      }

      const previewButton = page.getByRole('button', { name: 'View' }).first();
      await previewButton.scrollIntoViewIfNeeded();
      await previewButton.click();

      await expect(page.getByText('Preview & Edit Invoice')).toBeVisible();
      await expect(page.locator('[aria-label="PDF preview actions"]')).toBeVisible();
      const actions = ['Download', 'Print', 'Close'] as const;
      for (const action of actions) {
        const button = page.getByRole('button', { name: action }).first();
        await expect(button).toBeVisible();
        const box = await button.boundingBox();
        expect(box, `${action} button should have a bounding box at width ${width}`).toBeTruthy();
        if (box) {
          expect(box.y + box.height).toBeLessThanOrEqual(844);
        }
      }

      await expect(page).toHaveScreenshot(`invoice-mobile-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
      });

      await page.getByRole('button', { name: 'Close' }).first().click();
      await expect(page.getByText('Preview & Edit Invoice')).not.toBeVisible();

      await page.getByRole('button', { name: 'PDF' }).click();
      await expect(page.getByRole('heading', { name: 'PDF' })).toBeVisible();
      await page.getByRole('button', { name: 'Fatura' }).first().click();
      await expect(page.locator('[aria-label="PDF preview actions"]')).toBeVisible();
      await expect(page).toHaveScreenshot(`pdf-preview-mobile-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Close' }).first().click();
    }

    expect(consoleErrors, `Console errors detected:\n${consoleErrors.join('\n')}`).toEqual([]);
    expect(failedRequests, `Network request failures detected:\n${failedRequests.join('\n')}`).toEqual([]);
  });
});
