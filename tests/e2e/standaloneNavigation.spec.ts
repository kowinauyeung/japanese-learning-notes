import { expect, test, type Page } from '@playwright/test';
import { seed } from './fixtures';

/**
 * Every route has to be leavable without a browser back button.
 *
 * `public/manifest.webmanifest` asks for `display: standalone`, so an installed
 * app is a window with no chrome: no address bar, no back button, and on iOS no
 * gesture that substitutes for one. Whatever the page itself offers is the
 * entire set of exits, and a route that offers none is a window the reader has
 * to close and reopen.
 *
 * `/login` was one. The card had sign-in, the terms and the privacy policy, and
 * the footer's four links all lead further out rather than back — so a visitor
 * who read the landing page and tapped through to sign in, then thought better
 * of it, had nowhere to press. The brand mark is the way home from every other
 * public shell, so it is a link here too.
 *
 * End-to-end because the claim is about routing: what is asserted is that the
 * URL actually changed, not that something that looks like a link is on screen.
 * Chromium only — nothing here is about how a page is painted.
 */

/**
 * The brand mark, which is the exit every shell already had — the header of
 * `PublicLayout`, the header of the signed-in layout, and now the login card.
 * One locator across all of them on purpose: an exit that is somewhere
 * different on every screen is one a reader has to find each time.
 */
const HOME = { name: '語彙庭', exact: true } as const;

/**
 * Asserted visible before it is clicked, and the extra line is the point.
 *
 * Clicking a locator that does not exist waits out the whole test timeout and
 * reports thirty seconds of nothing, which reads as an infrastructure problem
 * rather than as the missing exit it is. Measured against the shipped login
 * screen, that is exactly what happened. The assertion fails in five with the
 * route in the message.
 */
async function expectHome(page: Page, from: string) {
  const home = page.getByRole('link', HOME).first();
  await expect(home, `${from} offers no way back to the landing page`).toBeVisible();
  await home.click();
  await expect(page).toHaveURL('/');
}

/** Signed out, where `/` is the landing page rather than a redirect. */
const PUBLIC_ROUTES = ['/login', '/about', '/privacy', '/terms', '/support'];

for (const path of PUBLIC_ROUTES) {
  test(`leaves ${path} without a back button`, async ({ page }) => {
    await seed(page, {});
    await page.goto(path);

    await expectHome(page, path);
  });
}

/**
 * A mistyped address reaches `NotFound` through the router's error boundary
 * rather than a catch-all route, which makes it the one screen here that is
 * arrived at by accident — and the one where being stuck is most likely.
 */
test('leaves a mistyped address without a back button', async ({ page }) => {
  await seed(page, {});
  await page.goto('/no-such-page');

  await expectHome(page, '/no-such-page');
});

/**
 * The signed-in half. Its exit is the same mark in the sticky header, and it is
 * reachable at a phone width too — where the navigation collapses into a
 * hamburger and the brand is the only thing left in the bar.
 */
test('leaves a signed-in route at a phone width, where the nav is behind a menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, { signedIn: true });
  await page.goto('/history');

  await expectHome(page, '/history');
});
