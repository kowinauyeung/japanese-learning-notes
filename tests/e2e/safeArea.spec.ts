import { expect, test, type Page } from '@playwright/test';
import { seed } from './fixtures';

/**
 * The strips of the screen an installed app is given but does not own.
 *
 * `index.html` asks for `viewport-fit=cover`, so the document is laid out edge
 * to edge. In a browser tab Safari's own chrome covers the notch and the home
 * indicator and nothing shows; installed, with `display: standalone` in the
 * manifest, there is no chrome, and until this change no rule anywhere read
 * `env(safe-area-inset-*)`. The header ran under the status bar and the add
 * button sat under the home indicator — on top of the swipe that leaves the
 * app, so the control the reader reaches for most was the one hardest to hit.
 *
 * **The insets are injected, and that is the only way this claim can be
 * measured.** `env(safe-area-inset-*)` resolves to zero in every browser
 * Playwright can drive and no protocol sets it, so a spec written against
 * `env()` directly passes just as well on a layout that ignores it entirely.
 * `src/index.css` therefore reads the four values into `--safe-*` once, and
 * this overrides those on `:root` with numbers taken off real hardware. What
 * stays untested by geometry is the one line joining the two, so the first test
 * below asserts that join directly.
 *
 * Chromium only. Every claim here is box arithmetic, which both engines agree
 * on; WebKit is reserved for how something is painted.
 */

/** iPhone 14 Pro, held upright: the status bar above, the home indicator below. */
const PORTRAIT = { viewport: { width: 390, height: 844 }, top: 59, right: 0, bottom: 34, left: 0 };

/**
 * The same phone turned sideways. The notch moves into one edge and the
 * rounded corners take the other, so iOS reports both — which is why the layout
 * reads left and right separately instead of one horizontal inset.
 */
const LANDSCAPE = {
  viewport: { width: 844, height: 390 },
  top: 0,
  right: 47,
  bottom: 21,
  left: 47,
};

type Insets = typeof PORTRAIT;

async function applyInsets(page: Page, insets: Insets) {
  await page.setViewportSize(insets.viewport);
  // Appended to <head> after the bundle's own stylesheet, so it wins on order
  // at equal specificity.
  await page.addStyleTag({
    content: `:root {
      --safe-top: ${insets.top}px;
      --safe-right: ${insets.right}px;
      --safe-bottom: ${insets.bottom}px;
      --safe-left: ${insets.left}px;
    }`,
  });
}

function elements(page: Page) {
  return {
    /** The one control pinned to the corner the home indicator occupies. */
    add: page.getByRole('button', { name: '単語を追加' }),
    /** The bottom stack, which places itself with `inset-x-4 bottom-24 mx-safe mb-safe`. */
    notice: page.getByRole('status').filter({ hasText: 'オフライン' }),
    /** Header contents. The bar itself stays full bleed; only what is in it moves. */
    brand: page.getByRole('banner').getByRole('link', { name: '語彙庭' }),
    /**
     * The box inside `<main>` that carries the page gutter and the measure. The
     * inset lives on `<main>` itself, so this is the element that has to have
     * moved — asserting on `<main>` would measure a box that spans the viewport
     * by design and never moves at all.
     */
    content: page.getByRole('main').locator('> div'),
  };
}

async function openSignedInApp(page: Page, context: { setOffline: (v: boolean) => Promise<void> }) {
  await seed(page, { signedIn: true });
  await page.goto('/');
  // The offline pill is one of the two panels in the bottom stack, and the
  // cheapest way to put a panel there.
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'オフライン' })).toBeVisible();
}

/**
 * The join the geometry cannot see.
 *
 * Every other test here proves the layout responds to `--safe-bottom`. None of
 * them can prove `--safe-bottom` is fed by the device, because the value it is
 * fed is zero on every machine this runs on — so a stylesheet declaring
 * `--safe-bottom: 0px` and nothing else would pass every one of them.
 *
 * **The stylesheet, not the computed style, and the difference is why this
 * test exists in the shape it does.** Reading `--safe-bottom` off
 * `getComputedStyle(document.documentElement)` was the obvious way to do it and
 * returns `0px`: `env()` is substituted when the custom property is computed,
 * not deferred to its use sites the way `var()` is, so the computed value of a
 * correctly wired variable is byte for byte the computed value of the constant
 * this is meant to catch. The specified value on the rule keeps the token.
 */
test('reads the device insets rather than a constant the tests can satisfy', async ({ page }) => {
  await seed(page, { signedIn: true });
  await page.goto('/');

  const declared = await page.evaluate(() => {
    const sides = ['top', 'right', 'bottom', 'left'] as const;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRule[];
      // Cross-origin sheets throw rather than return nothing. There are none in
      // this build, but a font or an extension would make this the difference
      // between skipping a sheet and failing the test for the wrong reason.
      try {
        rules = Array.from(sheet.cssRules);
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (!(rule instanceof CSSStyleRule) || rule.selectorText !== ':root') continue;
        // Whitespace stripped rather than trimmed: the production build
        // minifies the declaration to `env(safe-area-inset-top,0px)`, and the
        // dev server does not, so comparing the raw text passes in one and
        // fails in the other.
        const values = sides.map((side) =>
          rule.style.getPropertyValue(`--safe-${side}`).replace(/\s+/g, ''),
        );
        if (values.every(Boolean)) return values;
      }
    }
    return null;
  });

  expect(declared).toEqual([
    'env(safe-area-inset-top,0px)',
    'env(safe-area-inset-right,0px)',
    'env(safe-area-inset-bottom,0px)',
    'env(safe-area-inset-left,0px)',
  ]);
});

test('keeps the add button and the notices above the home indicator', async ({ page, context }) => {
  await openSignedInApp(page, context);
  await applyInsets(page, PORTRAIT);

  const { add, notice } = elements(page);
  const floor = PORTRAIT.viewport.height - PORTRAIT.bottom;

  const addBox = (await add.boundingBox())!;
  expect(addBox, 'the add button is `nav:hidden`, so a phone width must find it').not.toBeNull();
  // Its own 20px offset is still there on top of the inset — the inset is added
  // to the design's spacing, not substituted for it.
  expect(addBox.y + addBox.height).toBeLessThanOrEqual(floor - 20);

  const noticeBox = (await notice.boundingBox())!;
  expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(floor);
});

test('starts the header below the status bar instead of under it', async ({ page, context }) => {
  await openSignedInApp(page, context);
  await applyInsets(page, PORTRAIT);

  const { brand } = elements(page);
  const box = (await brand.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(PORTRAIT.top);
});

test('clears the notch and the rounded corners when the phone is turned sideways', async ({
  page,
  context,
}) => {
  await openSignedInApp(page, context);
  await applyInsets(page, LANDSCAPE);

  const { add, brand, content, notice } = elements(page);
  const rightEdge = LANDSCAPE.viewport.width - LANDSCAPE.right;

  for (const [name, locator] of [
    ['the header brand', brand],
    ['the page content', content],
    ['the offline notice', notice],
  ] as const) {
    const box = (await locator.boundingBox())!;
    expect(box, `${name} was not on screen to measure`).not.toBeNull();
    expect(box.x, `${name} starts inside the left inset`).toBeGreaterThanOrEqual(LANDSCAPE.left);
    expect(box.x + box.width, `${name} runs past the right inset`).toBeLessThanOrEqual(rightEdge);
  }

  // 844px is above the `nav` breakpoint, where the add button is hidden and the
  // header's own 単語を追加 takes over — so the corner it defended is empty.
  expect(await add.count()).toBe(0);
});

/**
 * The other half of the change, and the one a browser tab actually sees.
 *
 * `env()` falls back to `0px` everywhere except an installed app on a notched
 * device, so these declarations are inert for almost every reader — and inert
 * has to mean *unchanged*, not "shifted by a few pixels nobody measured". A
 * `bottom` that had been rewritten as an inset rather than added to one would
 * put the add button flat against the edge here.
 */
test('leaves the layout exactly where it was when the device asks for nothing', async ({
  page,
  context,
}) => {
  await openSignedInApp(page, context);
  await page.setViewportSize({ width: 390, height: 844 });

  const { add, notice } = elements(page);
  const addBox = (await add.boundingBox())!;
  expect(addBox.x + addBox.width).toBe(390 - 20);
  expect(addBox.y + addBox.height).toBe(844 - 20);

  const noticeBox = (await notice.boundingBox())!;
  expect(noticeBox.x).toBe(16);
});
