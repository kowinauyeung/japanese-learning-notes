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
  test('sends an unauthenticated visitor to the login screen', async ({ page }) => {
    await seed(page, { entries: WORDS });
    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
    // The project this build talks to is printed so nobody edits production
    // while believing they are on dev.
    await expect(page.getByText('demo-goitei')).toBeVisible();
  });

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
