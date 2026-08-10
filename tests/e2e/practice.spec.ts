import { expect, test } from '@playwright/test';
import { seed, seedSignedIn, WORDS } from './fixtures';

/**
 * A practice session from the setup screen to the recorded result.
 *
 * What is only observable here: the setup screen's count agreeing with the
 * queue it starts, the session surviving a route param change, and the fact
 * that a finished session actually reaches the store — the 苦手のみ count on
 * the next visit is read back from the same place the write went.
 *
 * What is deliberately not here: which words a filter selects, how the shuffle
 * orders them, and whether a typed answer matches. Those are pure functions,
 * exhaustively covered in tests/unit/practice.test.ts and
 * tests/unit/dictation.test.ts, and a Playwright case for another filter
 * combination costs seconds and proves less.
 */

test.describe('flashcards', () => {
  test.beforeEach(async ({ page }) => {
    await seedSignedIn(page);
  });

  test('counts the matches, then deals exactly that many cards', async ({ page }) => {
    await page.goto('/practice/flashcards');
    await expect(page.getByText('3 件が対象')).toBeVisible();

    // A tag chip narrows it; the count is the promise the queue has to keep.
    await page.getByRole('button', { name: '#仕事' }).click();
    await expect(page.getByText('1 件が対象')).toBeVisible();

    await page.getByRole('button', { name: '開始する' }).click();
    await expect(page.getByLabel('進捗')).toHaveText('1 / 1');
  });

  test('blocks starting a session with nothing in it', async ({ page }) => {
    await page.goto('/practice/flashcards');
    await page.getByRole('button', { name: '#仕事' }).click();
    await page.getByRole('button', { name: 'N5' }).click();

    await expect(page.getByText('0 件が対象')).toBeVisible();
    await expect(page.getByText('条件に合う語がありません')).toBeVisible();
    await expect(page.getByRole('button', { name: '開始する' })).toBeDisabled();
  });

  test('hides the answer buttons until the card is flipped', async ({ page }) => {
    await page.goto('/practice/flashcards');
    await page.getByRole('button', { name: '開始する' }).click();

    // Recording 「わかった」 before the meaning is on screen would measure
    // confidence rather than recall, and 苦手な語 is built out of these.
    await expect(page.getByRole('button', { name: 'わかった' })).toBeHidden();
    await page.getByRole('button', { name: '裏を見る' }).click();
    await expect(page.getByRole('button', { name: 'わかった' })).toBeVisible();
  });

  test('records the session, and the failed word comes back as 苦手', async ({ page }) => {
    await page.goto('/practice/flashcards');
    await page.getByRole('button', { name: '#仕事' }).click();
    await page.getByRole('button', { name: '開始する' }).click();

    await page.getByRole('button', { name: '裏を見る' }).click();
    await page.getByRole('button', { name: 'もう一度' }).click();

    await expect(page.getByText('0 / 1')).toBeVisible();
    // Matched by destination, not by name: furigana splits 切り分け into
    // separate ruby elements, so the accessible name interleaves the readings
    // (「切 き り 分 わ け」) and no substring of the headword survives.
    await expect(page.getByRole('list').getByRole('link')).toHaveAttribute(
      'href',
      '/vocabulary/w-kiriwake',
    );

    // Read back through a fresh load of the store, not from the summary that
    // is still on screen: the claim is that the write happened.
    await page.goto('/practice/dictation');
    await expect(page.getByText('苦手な語のみ')).toContainText('1 語');
  });
});

test.describe('dictation', () => {
  test('marks a typed answer and advances to the next word', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/practice/dictation');
    await page.getByRole('button', { name: '#仕事' }).click();
    await page.getByRole('button', { name: '開始する' }).click();

    await page.getByLabel('聞こえた語').fill('きりわけ');
    await page.getByRole('button', { name: '答え合わせ' }).click();

    await expect(page.getByText('✅ 正解')).toBeVisible();
    await page.getByRole('button', { name: '次へ' }).click();
    await expect(page.getByText('1 / 1')).toBeVisible();
  });
});

test.describe('the practice setup screen', () => {
  test('offers 苦手のみ against the words already recorded wrong', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, weak: ['w-choukou'] });
    await page.goto('/practice/flashcards');

    await expect(page.getByText('苦手な語のみ')).toContainText('1 語');
    await page.getByRole('checkbox').check();
    await expect(page.getByText('1 件が対象')).toBeVisible();

    await page.getByRole('button', { name: '開始する' }).click();
    await expect(page.getByText('兆候')).toBeVisible();
  });

  /** `:mode` is user-editable, and the app has exactly two modes. */
  test('sends an unknown mode back to the dashboard', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/practice/nonsense');
    await expect(page).toHaveURL('/');
  });
});
