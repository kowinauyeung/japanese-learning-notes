import { expect, test, type BrowserContext, type Page } from '@playwright/test';
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
 * The insets are set through the DevTools protocol, so what these tests measure
 * is the real thing: `Emulation.setSafeAreaInsetsOverride` makes
 * `env(safe-area-inset-*)` resolve to the given values, and the layout is then
 * observed the way any other layout is. Nothing here knows how the stylesheet
 * is written.
 *
 * Chromium only. Every claim is box arithmetic, which both engines agree on;
 * WebKit is reserved for how something is painted. The override is a Chromium
 * protocol method, which is the second reason.
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
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: insets.top, left: insets.left, bottom: insets.bottom, right: insets.right },
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

async function openSignedInApp(page: Page, context: BrowserContext) {
  await seed(page, { signedIn: true });
  await page.goto('/');
  // The offline pill is one of the two panels in the bottom stack, and the
  // cheapest way to put a panel there.
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'オフライン' })).toBeVisible();
}

/**
 * Guards every measurement below.
 *
 * If the override ever stops taking effect — a protocol method renamed, a
 * browser build without it — `env()` quietly returns to zero and every
 * assertion here passes against a layout that ignores the insets entirely,
 * which is the exact defect this file exists for. So one test reads the value
 * back out of a real declaration first.
 */
test('sets insets the page can actually see, so the rest is not measuring zero', async ({
  page,
  context,
}) => {
  await openSignedInApp(page, context);
  await applyInsets(page, PORTRAIT);

  const seen = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
    probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const result = { top: style.paddingTop, bottom: style.paddingBottom };
    probe.remove();
    return result;
  });

  expect(seen).toEqual({ top: `${PORTRAIT.top}px`, bottom: `${PORTRAIT.bottom}px` });
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
 * `env()` is zero everywhere except an installed app on a notched device, so
 * these declarations are inert for almost every reader — and inert has to mean
 * *unchanged*, not "shifted by a few pixels nobody measured". A `bottom` that
 * had been rewritten as an inset rather than added to one would put the add
 * button flat against the edge here.
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
