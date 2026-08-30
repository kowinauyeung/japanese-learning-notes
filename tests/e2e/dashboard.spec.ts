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
    expect(overflow, 'the year must actually overflow, or nothing is being tested').toBeGreaterThan(
      0,
    );

    const cell = await today.boundingBox();
    const box = await scroller.boundingBox();
    expect(cell).not.toBeNull();
    expect(box).not.toBeNull();
    expect(cell!.x).toBeGreaterThanOrEqual(box!.x);
    expect(cell!.x + cell!.width).toBeLessThanOrEqual(box!.x + box!.width);
  });

  test('re-pins the heatmap to today when a wide viewport becomes narrow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await seedSignedIn(page);
    await page.goto('/');

    const today = page.getByRole('button', { name: /2026年6月24日/ });
    await expect(today).toBeVisible();

    const scroller = page.locator('section div.overflow-x-auto').first();
    // Start from the desktop state that hides the bug from users: the whole
    // year fits, so the heatmap has no reason to pin itself yet.
    await expect
      .poll(async () => scroller.evaluate((node) => node.scrollWidth - node.clientWidth))
      .toBeLessThanOrEqual(0);

    await page.setViewportSize({ width: 375, height: 667 });

    // Prove the viewport change creates the user-visible risk: today can now
    // sit off-screen to the right unless the heatmap pins itself.
    await expect
      .poll(async () => scroller.evaluate((node) => node.scrollWidth - node.clientWidth), {
        message: 'the resize must make the year overflow, or nothing is being tested',
      })
      .toBeGreaterThan(0);

    // The user-facing outcome is today being visible without manually dragging
    // the horizontal scroller after rotating or narrowing the viewport.
    await expect
      .poll(async () => {
        const [cell, box] = await Promise.all([today.boundingBox(), scroller.boundingBox()]);
        if (!cell || !box) return false;
        return cell.x >= box.x && cell.x + cell.width <= box.x + box.width;
      })
      .toBe(true);
  });

  test('keeps a manually scrolled heatmap on older weeks during later resize', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await seedSignedIn(page);
    await page.goto('/');

    const today = page.getByRole('button', { name: /2026年6月24日/ });
    await expect(today).toBeVisible();

    const scroller = page.locator('section div.overflow-x-auto').first();
    // The preservation check only matters in the phone-width layout where a
    // reader can scroll away from today into older weeks.
    await expect
      .poll(async () => scroller.evaluate((node) => node.scrollWidth - node.clientWidth))
      .toBeGreaterThan(0);

    // First prove the normal mobile load still opens on today; otherwise the
    // manual scroll below would not represent a reader leaving the latest week.
    //
    // Polled rather than read once: the overflow above appears when the row is
    // laid out, and the pin is written by an effect after that — so a single
    // read can land in between and see the 0 this is here to rule out.
    await expect
      .poll(async () => scroller.evaluate((node) => node.scrollLeft), {
        message: 'the narrow viewport must initially pin to the newest week',
      })
      .toBeGreaterThan(0);

    await scroller.evaluate((node) => {
      node.scrollLeft = 0;
    });
    // This models a reader deliberately inspecting old history, which must not
    // be undone by incidental layout work after the first automatic pin.
    await expect.poll(async () => scroller.evaluate((node) => node.scrollLeft)).toBe(0);

    const clientWidth = await scroller.evaluate((node) => node.clientWidth);
    await scroller.evaluate((node) => {
      node.style.maxWidth = `${Math.max(1, node.clientWidth - 24)}px`;
    });
    // Trigger the kind of reflow ResizeObserver sees so the test covers the
    // same path that would otherwise yank the reader back to today.
    await expect
      .poll(async () => scroller.evaluate((node) => node.clientWidth))
      .toBeLessThan(clientWidth);

    // The user-visible guarantee is that older weeks stay put after the reader
    // scrolls there; a resize must not turn history into today again.
    await expect
      .poll(async () => scroller.evaluate((node) => node.scrollLeft), {
        message: "a later reflow must not undo the reader's manual scroll",
      })
      .toBe(0);
  });
});
