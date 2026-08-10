import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  OVERLAPPING_SETS,
  seed,
  seedSignedIn,
  watchForBlanking,
  WORD_SETS,
  WORDS,
} from './fixtures';

/** The words in 収録語, in the order the set stores them. */
const memberOrder = (page: Page) =>
  page.locator('[data-drop-list="members"] li a[href^="/vocabulary/"]');

/**
 * Those words as a list of hrefs, for `expect.poll`.
 *
 * Matched on href rather than on text: furigana splits a headword into separate
 * `<ruby>` elements, so the accessible name of a row interleaves its readings.
 */
const memberHrefs = (page: Page) =>
  memberOrder(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('href')));

/**
 * Press on `grip`, move to the top of `row`, release.
 *
 * Hand-driven rather than `locator.dragTo`, for the reason the implementation
 * is hand-rolled: this is a pointer-events gesture, not HTML5 drag-and-drop,
 * and it needs intermediate moves — a single jump from press to release never
 * produces the `pointermove` the drop target is chosen on.
 */
async function dragOnto(page: Page, grip: Locator, row: Locator): Promise<void> {
  const from = await grip.boundingBox();
  const to = await row.boundingBox();
  if (!from || !to) throw new Error('nothing to drag: one of the two rows is not laid out');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Two moves: the first starts the drag, the second lands in the target's top
  // half, which is the half that means "insert before this row".
  await page.mouse.move(to.x + to.width / 2, to.y + to.height, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 5 });
  await page.mouse.up();
}

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
      page.getByText('下の一覧からドラッグ、または「＋ 追加」で入れてください'),
    ).toBeVisible();

    await page.getByPlaceholder('見出し語・読み方・タグ・意味・例文で検索').fill('ちょうこう');
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
    await page.getByPlaceholder('見出し語・読み方・タグ・意味・例文で検索').fill('ちょうこう');
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
   * applied *everywhere* a set is counted; the practice chip was reading
   * `entryIds.length` and promising cards its own queue could not deal.
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

    await page.goto('/practice/flashcards');
    await expect(page.getByRole('button', { name: /ニュースセット/ })).toContainText('0');
    await expect(page.getByRole('button', { name: /仕事セット/ })).toContainText('1');
  });

  /**
   * The gesture, end to end, and the only place it can be seen: it is a pointer
   * driving a hit test over a live layout, and neither half exists in jsdom.
   * The arithmetic underneath it is unit-tested; what this proves is that a
   * press, a move and a release over the real page reach it at all.
   */
  test('drags a word from the notebook into the top of the set', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: WORD_SETS });
    await page.goto('/wordsets/set-work');
    await expect(memberOrder(page)).toHaveCount(2);

    await dragOnto(
      page,
      page.getByRole('button', { name: 'ちょっとを並び替え' }),
      memberOrder(page).first(),
    );

    await expect
      .poll(() => memberHrefs(page))
      .toEqual(['/vocabulary/w-chotto', '/vocabulary/w-kiriwake', '/vocabulary/w-choukou']);
  });

  /**
   * Reordering is the half with no alternative: words join at the end, and
   * until the rows could be dragged the study order was fixed by the order they
   * happened to be filed in.
   */
  test('drags a member above another to change the study order', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: WORD_SETS });
    await page.goto('/wordsets/set-work');

    await dragOnto(
      page,
      page.getByRole('button', { name: '兆候を並び替え' }),
      memberOrder(page).first(),
    );

    await expect
      .poll(() => memberHrefs(page))
      .toEqual(['/vocabulary/w-choukou', '/vocabulary/w-kiriwake']);

    // And it survives a reload, so what moved was the stored order and not the
    // rows on screen.
    await page.reload();
    await expect
      .poll(() => memberHrefs(page))
      .toEqual(['/vocabulary/w-choukou', '/vocabulary/w-kiriwake']);
  });

  /**
   * Every write here ends in `refresh()`, and a provider that reports itself as
   * loading during that refresh takes the whole page down with it: the route
   * renders 読み込み中… in place of everything, then puts it back. On a fast
   * connection that is a flash; on a slow one the set disappears while a word
   * is being added to it, and the scroll position goes with it.
   */
  test('adding a word does not blank the page it was added from', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: WORD_SETS });
    await page.goto('/wordsets/set-work');
    await expect(memberOrder(page)).toHaveCount(2);

    const blanked = await watchForBlanking(page);
    await page.getByRole('button', { name: '＋ 追加' }).click();
    await expect(memberOrder(page)).toHaveCount(3);

    expect(await blanked()).toBe(false);
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
