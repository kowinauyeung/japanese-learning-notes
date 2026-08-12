import { expect, test } from '@playwright/test';
import { makeSessions, seed, seedSignedIn, WORDS } from './fixtures';

/**
 * 履歴 — the drills that have happened, and the words still going wrong.
 *
 * What is only observable here: a session written by one screen read back by
 * another, the cursor walking a second page, and 復習 handing a scope across a
 * navigation and having the drill already running on arrival. The resolution of
 * a deleted word out of a recorded session is pure and lives in
 * tests/unit/history.test.ts.
 */

const sessionRows = (page: import('@playwright/test').Page) =>
  page.locator('section', { has: page.getByRole('heading', { name: '練習履歴' }) }).locator('li');

test.describe('history', () => {
  test('says plainly when nothing has been drilled yet', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/history');

    await expect(page.getByText('まだ練習の記録がありません')).toBeVisible();
    // No weak words either, so the panel is absent rather than empty.
    await expect(page.getByRole('heading', { name: '苦手な語' })).toBeHidden();
  });

  /**
   * The write and the read are different screens over the same collection, and
   * nothing but a round trip shows they agree — the session is recorded by the
   * practice route and paged back by this one.
   */
  test('shows a session recorded by an actual drill', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/practice/flashcards');
    await page.getByRole('button', { name: '#仕事' }).click();
    await page.getByRole('button', { name: '開始する' }).click();

    await page.getByRole('button', { name: /裏を見る/ }).click();
    await page.getByRole('button', { name: /もう一度/ }).click();

    await page.goto('/history');
    await expect(sessionRows(page)).toHaveCount(1);
    await expect(sessionRows(page).first()).toContainText('フラッシュカード');
    await expect(sessionRows(page).first()).toContainText('0 / 1');
    // The stored label, not one rebuilt now — it says what was drilled that day.
    await expect(sessionRows(page).first()).toContainText('#仕事');
    // And the word that was missed is named, and links to itself.
    await expect(
      sessionRows(page).first().locator('a[href="/vocabulary/w-kiriwake"]'),
    ).toBeVisible();
  });

  /**
   * The only screen in the app that pages. `listSessions` is tested against the
   * emulator; what is untested until here is a component walking the cursor.
   */
  test('walks the cursor to the older sessions', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, sessions: makeSessions(25) });
    await page.goto('/history');

    await expect(sessionRows(page)).toHaveCount(20);
    await page.getByRole('button', { name: 'もっと見る' }).click();

    await expect(sessionRows(page)).toHaveCount(25);
    // Gone once there is nothing after the page on screen.
    await expect(page.getByRole('button', { name: 'もっと見る' })).toBeHidden();
  });

  /**
   * 復習 is a link, and what it carries has to survive the navigation: the scope
   * in the query string *and* the instruction to begin. Landing on the setup
   * screen instead would look like the button had done nothing.
   */
  test('starts a drill scoped to the weak words', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, weak: ['w-kiriwake', 'w-choukou'] });
    await page.goto('/history');

    await expect(page.getByRole('heading', { name: /苦手な語/ })).toBeVisible();
    await page.getByRole('link', { name: '書き取り練習で復習' }).click();

    // Already dealing, not asking: the progress counter only exists mid-session.
    await expect(page.getByLabel('進捗')).toHaveText('1 / 2');
    await expect(page).toHaveURL(/weak=1/);
  });

  /**
   * The scope can be empty — every weak word deleted since, or a hand-edited
   * URL — and an auto-start that dealt nothing would record a 0 / 0 session.
   * Falling through to the setup screen is what says so instead.
   */
  test('falls back to the setup screen when the scope matches nothing', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/practice/flashcards?weak=1&start=1');

    await expect(page.getByText('0 件が対象')).toBeVisible();
    await expect(page.getByRole('button', { name: '開始する' })).toBeDisabled();
  });
});
