import { expect, test } from '@playwright/test';
import { OVERLAPPING_SETS, seed, seedSignedIn, WORD_SETS, WORDS } from './fixtures';

/**
 * 単語集, from an empty list to a drill scoped to one.
 *
 * What is only observable here: that a set written on one screen is read back
 * by another — the practice setup builds its chips from the same provider, and
 * that hand-off across two routes is the whole point of the feature. Also that
 * removing a word from a set, and deleting the set, leave the notebook alone,
 * which is the promise both buttons make and the one a user cannot undo.
 *
 * What is deliberately not here: which words the search box offers and the
 * order members are stored in. Those are pure and covered in
 * tests/unit/wordSetMembers.test.ts. Resolving a deleted member is covered
 * there too — what the case below adds is that every screen that counts a set
 * goes through that resolution, which no unit test can see.
 */

test.describe('word sets', () => {
  test('creates a set, fills it, and drills it', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/wordsets');
    await expect(
      page.getByText('まだ単語集がありません。名前を入れて作成してください。'),
    ).toBeVisible();

    await page.getByLabel('新しい単語集の名前').fill('会議の語');
    await page.getByRole('button', { name: '作成' }).click();

    // Creating opens the new set: a 単語集 is worth nothing until it has words.
    await expect(page.getByRole('heading', { name: /会議の語/ })).toBeVisible();
    await expect(
      page.getByText('まだ単語がありません。上の検索から追加してください。'),
    ).toBeVisible();

    await page.getByPlaceholder('見出し語・読み方で検索').fill('ちょうこう');
    await page.getByRole('button', { name: '＋ 追加' }).click();

    await expect(page.getByRole('heading', { name: /1 語/ })).toBeVisible();
    // Matched on href rather than on the name: furigana splits a headword into
    // separate <ruby> elements, so its accessible name interleaves the readings.
    await expect(page.locator('a[href="/vocabulary/w-choukou"]')).toBeVisible();

    // The set exists for the practice filter, which reads it from the provider
    // rather than from this page — and counted, so the chip and the queue agree.
    await page.goto('/practice/flashcards');
    await page.getByRole('button', { name: /会議の語/ }).click();
    await expect(page.getByText('1 件が対象')).toBeVisible();
  });

  test('removing a word from a set keeps it in the notebook', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: WORD_SETS });
    await page.goto('/wordsets');
    await page.getByRole('link', { name: /仕事セット/ }).click();
    await expect(page.getByRole('heading', { name: /2 語/ })).toBeVisible();

    await page
      .locator('li', { has: page.locator('a[href="/vocabulary/w-choukou"]') })
      .getByRole('button', { name: '削除' })
      .click();

    await expect(page.getByRole('heading', { name: /1 語/ })).toBeVisible();
    await page.goto('/vocabulary');
    await expect(page.getByText('3 語')).toBeVisible();
  });

  /**
   * A word is not owned by the first set that took it. Membership is a list on
   * each set precisely so that 兆候 can sit in 仕事セット and in a new set at
   * once — a picker that hid words already held *somewhere* would look like a
   * tidier version of the same feature and quietly make sets exclusive.
   */
  test('adds a word to a second set without taking it out of the first', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: WORD_SETS });
    await page.goto('/wordsets');

    await page.getByLabel('新しい単語集の名前').fill('ニュースの語');
    await page.getByRole('button', { name: '作成' }).click();
    await page.getByPlaceholder('見出し語・読み方で検索').fill('ちょうこう');
    await page.getByRole('button', { name: '＋ 追加' }).click();
    await expect(page.getByRole('heading', { name: /1 語/ })).toBeVisible();

    await page.goto('/wordsets');
    await expect(page.getByRole('link', { name: /仕事セット/ })).toContainText('2 語');
    await expect(page.getByRole('link', { name: /ニュースの語/ })).toContainText('1 語');
  });

  /**
   * Deleting a word takes it out of every set that held it — on screen. The id
   * itself stays in `entryIds`: nothing walks the sets on a delete, and
   * `membersOf` resolves the list against the notebook, so a set that outlives
   * a member simply stops listing it. This case is what says the resolution is
   * applied everywhere a set is counted, rather than only where it is listed.
   */
  test('a deleted word leaves every set that held it, and every count of them', async ({
    page,
  }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: OVERLAPPING_SETS });
    await page.goto('/vocabulary/w-choukou');
    await page.getByRole('button', { name: '削除' }).click();
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(page).toHaveURL(/\/vocabulary$/);

    await page.goto('/wordsets');
    await expect(page.getByRole('link', { name: /仕事セット/ })).toContainText('1 語');
    await expect(page.getByRole('link', { name: /ニュースセット/ })).toContainText('0 語');

    await page.getByRole('link', { name: /ニュースセット/ }).click();
    await expect(page.locator('a[href="/vocabulary/w-choukou"]')).toBeHidden();
  });

  test('deleting a set keeps every word it held', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: WORD_SETS });
    await page.goto('/wordsets');
    await page.getByRole('link', { name: /仕事セット/ }).click();

    await page.getByRole('button', { name: 'この単語集を削除' }).click();
    await page.getByRole('button', { name: '削除する' }).click();

    await expect(page).toHaveURL('/wordsets');
    await expect(
      page.getByText('まだ単語集がありません。名前を入れて作成してください。'),
    ).toBeVisible();

    await page.goto('/vocabulary');
    await expect(page.getByText('3 語')).toBeVisible();
  });
});
