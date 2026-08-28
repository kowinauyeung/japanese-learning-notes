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
    // The row counts the missed words; the words themselves are one click away.
    await expect(sessionRows(page).first()).toContainText('間違えた語 1');
  });

  /**
   * The row is a summary and the dialog is where the parts that do not fit go —
   * the words that were missed, which the row can only count, and the run in
   * full. The row became a single button to make it openable at all: a control
   * cannot hold controls, so the links had to move somewhere with room.
   */
  test('opens a session to see the run and which words were missed', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/practice/flashcards');
    await page.getByRole('button', { name: '#仕事' }).click();
    await page.getByRole('button', { name: '開始する' }).click();
    await page.getByRole('button', { name: /裏を見る/ }).click();
    await page.getByRole('button', { name: /もう一度/ }).click();

    await page.goto('/history');
    await sessionRows(page).first().getByRole('button').click();

    const dialog = page.getByRole('dialog', { name: 'フラッシュカード' });
    await expect(dialog).toContainText('0 / 1');
    await expect(dialog).toContainText('0%');

    // The claim that needs a browser is that the run written by the practice
    // screen is the run read back here. What the filter does to it, and how a
    // deleted word draws, are covered in `tests/component`.
    const run = dialog.locator('ol');
    await expect(run.locator('a[href="/vocabulary/w-kiriwake"]')).toBeVisible();
    await expect(run.getByRole('listitem')).toHaveCount(1);
    await expect(run.getByRole('img', { name: '不正解' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'すべて 1' })).toBeVisible();
  });

  /**
   * Two dialogs, and a stack rather than a swap.
   *
   * Opening a word closes the session dialog on purpose — two modals over each
   * other is one Escape closing both and a backdrop belonging to neither — but
   * closing the word used to leave the bare history page, so reading one word
   * out of a drill cost the whole session you were reading.
   *
   * Here rather than in a component test because the two dialogs are driven by
   * different things: the session by this route's own state, the word by a
   * provider that pushes the address bar and listens for `popstate`.
   */
  test('returns to the session after closing a word opened from inside it', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/practice/flashcards');
    await page.getByRole('button', { name: '#仕事' }).click();
    await page.getByRole('button', { name: '開始する' }).click();
    await page.getByRole('button', { name: /裏を見る/ }).click();
    await page.getByRole('button', { name: /もう一度/ }).click();

    await page.goto('/history');
    await sessionRows(page).first().getByRole('button').click();

    const session = page.getByRole('dialog', { name: 'フラッシュカード' });
    await session.locator('a[href="/vocabulary/w-kiriwake"]').click();

    // Never both at once: the session steps back while the word is showing.
    const word = page.getByRole('dialog', { name: '単語' });
    await expect(word).toBeVisible();
    await expect(session).toBeHidden();
    await expect(page).toHaveURL(/\/vocabulary\/w-kiriwake$/);

    await word.getByRole('button', { name: '閉じる' }).click();

    await expect(word).toBeHidden();
    await expect(session).toBeVisible();
    await expect(page).toHaveURL(/\/history$/);
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
   * The dashboard panel and 履歴 read the same collection from different
   * screens, and the panel is the only place the *newest of each mode* is
   * asked for — a distinction no unit test over a fixed array can show has
   * survived the round trip.
   */
  test('shows the newest session of each mode on the dashboard', async ({ page }) => {
    await seed(page, {
      signedIn: true,
      entries: WORDS,
      sessions: [
        {
          id: 'e2e-session-1',
          mode: 'flashcard',
          filterLabel: '古い記録',
          total: 3,
          correct: 1,
          words: [],
          startedAt: '2026-06-01T00:00:00.000Z',
          finishedAt: '2026-06-01T00:05:00.000Z',
        },
        {
          id: 'e2e-session-2',
          mode: 'flashcard',
          filterLabel: '新しい記録',
          total: 3,
          correct: 3,
          words: [],
          startedAt: '2026-06-02T00:00:00.000Z',
          finishedAt: '2026-06-02T00:05:00.000Z',
        },
      ],
    });
    await page.goto('/');

    const panel = page.locator('section', {
      has: page.getByRole('heading', { name: '最新の練習' }),
    });
    // The newer of the two flashcard runs, not the first one found.
    await expect(panel).toContainText('3 / 3');
    await expect(panel).toContainText('新しい記録');
    await expect(panel).not.toContainText('古い記録');
    // Dictation has never been drilled, so it keeps the empty state.
    await expect(panel).toContainText('まだ実施していません');
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
