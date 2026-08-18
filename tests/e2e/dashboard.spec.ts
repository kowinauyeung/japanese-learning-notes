import { expect, test } from '@playwright/test';
import { seedSignedIn } from './fixtures';

/**
 * ダッシュボード — the heatmap's horizontal scroll position.
 *
 * Only a real browser can see this. The grid draws a rolling year oldest to
 * newest, so on a phone-width viewport the fifty-three columns overflow their
 * scroller and it opens on last summer, with today off-screen to the right.
 * The DOM is identical either way — every cell is rendered in both — so no
 * component test, serialised snapshot or type can tell the two apart. Nor can
 * the heatmap screenshot baseline, which is shot at 1280 where nothing
 * overflows at all.
 */
test.describe('dashboard', () => {
  /**
   * 375×667 is the narrowest phone still in common use, and the case where the
   * overflow is largest. The clock is frozen at 2026-06-24 by fixtures.ts, so
   * "today" is a fixed cell rather than whatever day the suite happens to run.
   */
  test('opens the heatmap on today rather than on last year', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await seedSignedIn(page);
    await page.goto('/');

    const today = page.getByRole('button', { name: /2026年6月24日/ });
    await expect(today).toBeVisible();

    const scroller = page.locator('section div.overflow-x-auto').first();

    // Horizontal only, and deliberately not `toBeInViewport`: the heatmap sits
    // below the fold on a 667px-tall phone, so a viewport check reports the
    // page's vertical scroll and says nothing about the axis under test.
    const overflow = await scroller.evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow, 'the year must actually overflow, or nothing is being tested')
      .toBeGreaterThan(0);

    const cell = await today.boundingBox();
    const box = await scroller.boundingBox();
    expect(cell).not.toBeNull();
    expect(box).not.toBeNull();
    expect(cell!.x).toBeGreaterThanOrEqual(box!.x);
    expect(cell!.x + cell!.width).toBeLessThanOrEqual(box!.x + box!.width);
  });
});
