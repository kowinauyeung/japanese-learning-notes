import { expect, test } from '@playwright/test';
import { seed, WORDS } from './fixtures';

/**
 * The gate around everything. `AppLayout` bounces an unauthenticated visitor to
 * /login carrying where they were trying to go, and `safeRedirect` decides
 * whether that destination is honoured.
 *
 * `safeRedirect` is unit-tested exhaustively in tests/unit/redirect.test.ts —
 * what only a browser can show is that the value actually reaches it through
 * history state, and that the round trip lands where it should.
 */
test.describe('signing in', () => {
  /**
   * `/` is a public homepage, not a redirect. A visitor deciding whether to
   * hand over a Google account has to be able to read what the app is for
   * first — and Google's OAuth review asks for the same page.
   */
  test('shows an unauthenticated visitor the homepage, not the login form', async ({ page }) => {
    await seed(page, { entries: WORDS });
    await page.goto('/');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: '語彙庭', level: 1 })).toBeVisible();
    // Both the consent line and the footer point at it — the page has to reach
    // the policy, and it does so twice on purpose.
    await expect(page.getByRole('link', { name: /プライバシー/ })).toHaveCount(2);
  });

  /**
   * The half that matters for the data: opening `/` to visitors must not open
   * anything else. Every route holding a notebook still redirects.
   */
  for (const path of ['/vocabulary', '/wordsets', '/history', '/account', '/practice/flashcards']) {
    test(`still sends an unauthenticated visitor away from ${path}`, async ({ page }) => {
      await seed(page, { entries: WORDS });
      await page.goto(path);

      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
      // The project this build talks to is printed so nobody edits production
      // while believing they are on dev.
      await expect(page.getByText('demo-goitei')).toBeVisible();
    });
  }

  /** The four documents are readable with no account at all. */
  for (const path of ['/about', '/privacy', '/terms', '/support']) {
    test(`serves ${path} to a visitor with no account`, async ({ page }) => {
      await seed(page, {});
      await page.goto(path);

      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(/最終更新 \d{4}-\d{2}-\d{2}/)).toBeVisible();
    });
  }

  test('returns to the page that was asked for, query string and all', async ({ page }) => {
    await seed(page, { entries: WORDS });
    await page.goto('/vocabulary?jlpt=N1');

    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('button', { name: 'Google でログイン' }).click();

    // Dropping the search string would silently return a bookmarked filtered
    // view to the unfiltered one.
    await expect(page).toHaveURL(/\/vocabulary\?jlpt=N1$/);
    await expect(page.getByText('1 語')).toBeVisible();
  });

  test('goes to the dashboard when there was no destination', async ({ page }) => {
    await seed(page, { entries: WORDS });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Google でログイン' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('今週学んだ語')).toBeVisible();
  });
});

test.describe('signing out', () => {
  test('returns to the login screen and stops serving the notebook', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS });
    await page.goto('/vocabulary');
    await expect(page.getByText('3 語')).toBeVisible();

    await page.getByRole('button', { name: 'アカウントメニュー' }).click();
    await page.getByRole('button', { name: 'ログアウト' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('3 語')).toBeHidden();
  });
});
