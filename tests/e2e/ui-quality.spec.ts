import { expect, test } from '@playwright/test';

type Rect = { x: number; y: number; width: number; height: number };

const intersects = (a: Rect, b: Rect) => (
  a.x < b.x + b.width
  && a.x + a.width > b.x
  && a.y < b.y + b.height
  && a.y + a.height > b.y
);

test.describe('UI overlap + mobile swipe guardrails', () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(errors, `Console errors detected:\n${errors.join('\n')}`).toEqual([]);
  });

  test('critical layout regions do not overlap', async ({ page }) => {
    const boxes = await page.evaluate(() => {
      const getRect = (selector: string) => {
        const element = document.querySelector(selector) as HTMLElement | null;
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };

      return {
        topbar: getRect('.app-topbar'),
        content: getRect('.app-content'),
        mobileNav: getRect('.app-mobile-nav'),
      };
    });

    expect(boxes.topbar).toBeTruthy();
    expect(boxes.content).toBeTruthy();

    if (boxes.topbar && boxes.content) {
      expect(intersects(boxes.topbar as Rect, boxes.content as Rect)).toBeFalsy();
    }

    if (boxes.mobileNav && boxes.content) {
      expect(intersects(boxes.mobileNav as Rect, boxes.content as Rect)).toBeFalsy();
    }
  });

  test('captures visual snapshots at key widths and zoom', async ({ page }) => {
    for (const width of [390, 768, 1366, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => { document.body.style.zoom = '1.5'; });
      await expect(page).toHaveScreenshot(`dashboard-${width}-zoom150.png`, { fullPage: true, animations: 'disabled' });

      await page.evaluate(() => { document.body.style.zoom = '1.25'; });
      await expect(page).toHaveScreenshot(`dashboard-${width}-zoom125.png`, { fullPage: true, animations: 'disabled' });
    }
  });

  test('sold rows support swipe-left actions without vertical-scroll accidental trigger', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Swipe gestures are mobile-only.');

    const soldRow = page.locator('[data-sold-swipe-row="true"].cars-sold-row').first();
    await soldRow.scrollIntoViewIfNeeded();
    await expect(soldRow).toBeVisible();

    const box = await soldRow.boundingBox();
    expect(box).toBeTruthy();

    if (!box) return;

    await page.mouse.move(box.x + box.width - 12, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 96, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect(page.getByRole('button', { name: 'More actions' }).first()).toBeVisible();

    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 24, box.y + box.height + 120, { steps: 8 });
    await page.mouse.up();

    await expect(page.getByRole('button', { name: 'More actions' }).first()).toBeVisible();
  });
});
