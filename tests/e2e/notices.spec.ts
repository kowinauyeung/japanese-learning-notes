import { expect, test, type Locator } from '@playwright/test';
import { seed } from './fixtures';

/**
 * The bottom of the viewport, where three fixed elements compete for the same
 * corner: the offline pill, the update prompt, and the add button.
 *
 * Each of the first two used to place itself, and a comment on each said it was
 * clear of the others. Measured, none of that held. At 360 the offline pill
 * covered the add button completely — `z-40` over `z-20`, so being offline took
 * away the control the reader reaches for most. From the `nav` breakpoint up to
 * roughly 1128px the prompt sat squarely inside the pill: every laptop width.
 * Below that breakpoint the two still clipped by eight pixels.
 *
 * End-to-end and not a component test because the claim is about three
 * elements from three files sharing one viewport, which is the one thing a
 * component test cannot see. Geometry rather than a screenshot: the failure is
 * "these boxes intersect", and asserting it directly says why a diff appeared
 * instead of leaving a reviewer to find it in a PNG.
 *
 * Chromium only. The overlap is box arithmetic, and both engines agree on it —
 * WebKit is reserved for claims about how something is painted.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Zero for boxes that merely touch, positive only for real overlap. */
function intersection(a: Box, b: Box): { width: number; height: number } | null {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? { width, height } : null;
}

async function boxesOf(named: Record<string, Locator>): Promise<[string, Box][]> {
  const found: [string, Box][] = [];
  for (const [name, locator] of Object.entries(named)) {
    // The add button is `nav:hidden`, so above the breakpoint it is absent by
    // design rather than missing.
    if ((await locator.count()) === 0) continue;
    const box = await locator.first().boundingBox();
    if (box) found.push([name, box]);
  }
  return found;
}

/**
 * Widths chosen from what actually failed rather than from a device list: 360
 * is where the pill swallowed the add button, 699 and 700 straddle the `nav`
 * breakpoint where the prompt changes its offset, and 1024 and 1100 are inside
 * the laptop range where the two overlapped completely.
 */
const WIDTHS = [360, 480, 699, 700, 1024, 1100, 1280];

test.describe('the bottom of the viewport', () => {
  for (const updateWaiting of [true, false]) {
    test(`keeps every fixed panel clear of the others${updateWaiting ? ' while a build is waiting' : ''}`, async ({
      page,
      context,
    }) => {
      await seed(page, { signedIn: true, updateWaiting });
      await page.goto('/');
      await context.setOffline(true);

      const panels = {
        prompt: page.getByRole('status').filter({ hasText: '新しいバージョン' }),
        notice: page.getByRole('status').filter({ hasText: 'オフライン' }),
        add: page.getByRole('button', { name: '単語を追加' }),
      };

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const expectedPanels = [
          'notice',
          ...(updateWaiting ? ['prompt'] : []),
          ...(width < 700 ? ['add'] : []),
        ].sort();
        await expect
          .poll(async () => (await boxesOf(panels)).map(([name]) => name).sort())
          .toEqual(expectedPanels);
        const boxes = await boxesOf(panels);

        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const [nameA, a] = boxes[i]!;
            const [nameB, b] = boxes[j]!;
            expect(
              intersection(a, b),
              `${nameA} and ${nameB} overlap at ${width}px wide`,
            ).toBeNull();
          }
        }
      }
    });
  }
});
