import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  FULL_SET,
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
      page.getByText('ここに単語をドラッグ、または「＋ 追加」で入れてください'),
    ).toBeVisible();

    await page.getByPlaceholder('見出し語・読み方・タグ・意味・例文で検索').fill('ちょうこう');
    await page.getByRole('button', { name: '＋ 追加' }).click();

    await expect(page.getByRole('heading', { level: 1, name: /1 語/ })).toBeVisible();
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
    await expect(page.getByRole('heading', { level: 1, name: /2 語/ })).toBeVisible();

    await page
      .locator('li', { has: page.locator('a[href="/vocabulary/w-choukou"]') })
      .getByRole('button', { name: '削除' })
      .click();

    await expect(page.getByRole('heading', { level: 1, name: /1 語/ })).toBeVisible();
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
    await expect(page.getByRole('heading', { level: 1, name: /1 語/ })).toBeVisible();

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
   * The grip is a 44px target, and a whole row is a much larger one. Dragging
   * only ever from the grip was the first thing that turned out to be hard to
   * do with a mouse.
   */
  test('drags a word by its body, not only by its grip', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: WORD_SETS });
    await page.goto('/wordsets/set-work');

    await dragOnto(
      page,
      // The headword itself, which is row body rather than grip. `exact`
      // because this word reads as itself, so 「ちょっと（ちょっと）」 would
      // otherwise match the reading too.
      page.locator('[data-drop-list="candidates"] li').first().getByText('ちょっと', {
        exact: true,
      }),
      memberOrder(page).first(),
    );

    await expect
      .poll(() => memberHrefs(page))
      .toEqual(['/vocabulary/w-chotto', '/vocabulary/w-kiriwake', '/vocabulary/w-choukou']);
  });

  /**
   * What the movement threshold is for, and it has to be a press that *moves* —
   * `locator.click()` releases on the pixel it pressed, so it would open the
   * word with the threshold removed and prove nothing. A hand pressing a row
   * drifts a pixel or two; without the slop that is a drag, and the click it
   * ends with is swallowed as the drag's own.
   */
  test('still opens the word when a press on a row drifts slightly', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: WORD_SETS });
    await page.goto('/wordsets/set-work');

    const row = await memberOrder(page).first().boundingBox();
    if (!row) throw new Error('the first member is not laid out');
    const x = row.x + row.width / 2;
    const y = row.y + row.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 3, y - 2);
    await page.mouse.up();

    await expect(page).toHaveURL(/\/vocabulary\/w-kiriwake$/);
  });

  /** Adding a filtered list one row at a time is the thing this replaces. */
  test('adds every word on screen at once', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/wordsets');
    await page.getByLabel('新しい単語集の名前').fill('全部');
    await page.getByRole('button', { name: '作成' }).click();

    await page.getByRole('button', { name: '表示中の 3 語を追加' }).click();

    await expect
      .poll(() => memberHrefs(page))
      .toEqual(['/vocabulary/w-kiriwake', '/vocabulary/w-choukou', '/vocabulary/w-chotto']);
    // And the picker is empty afterwards, because it excludes what the set holds.
    await expect(page.getByText('条件に合う単語がありません')).toBeVisible();
  });

  /**
   * A set holding a word that has since been deleted renders fewer rows than it
   * stores, and every index arriving from the DOM counts rendered rows. Passing
   * one straight to `reorderMembers` moved whichever id occupied that slot —
   * here the stale one, so the write went out and nothing on screen changed.
   *
   * Both entry points are covered because they are separate code paths, and the
   * keyboard one is the only way to reorder without a pointer.
   */
  test('reorders by drag around a member whose word was deleted', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: FULL_SET });
    await page.goto('/vocabulary/w-kiriwake');
    await page.getByRole('button', { name: '削除' }).click();
    await page.getByRole('button', { name: '削除する' }).click();

    await page.goto('/wordsets/set-all');
    await expect
      .poll(() => memberHrefs(page))
      .toEqual(['/vocabulary/w-choukou', '/vocabulary/w-chotto']);

    await dragOnto(
      page,
      page.getByRole('button', { name: 'ちょっとを並び替え' }),
      memberOrder(page).first(),
    );

    await expect
      .poll(() => memberHrefs(page))
      .toEqual(['/vocabulary/w-chotto', '/vocabulary/w-choukou']);
  });

  test('reorders by keyboard around a member whose word was deleted', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: FULL_SET });
    await page.goto('/vocabulary/w-kiriwake');
    await page.getByRole('button', { name: '削除' }).click();
    await page.getByRole('button', { name: '削除する' }).click();

    await page.goto('/wordsets/set-all');
    await expect
      .poll(() => memberHrefs(page))
      .toEqual(['/vocabulary/w-choukou', '/vocabulary/w-chotto']);

    await page.getByRole('button', { name: 'ちょっとを並び替え' }).press('ArrowUp');

    await expect
      .poll(() => memberHrefs(page))
      .toEqual(['/vocabulary/w-chotto', '/vocabulary/w-choukou']);
  });

  /**
   * A press that begins on a control belongs to that control. `pointerdown` on
   * 削除 bubbles to the row, so without a bail-out a hand that drifts past the
   * threshold turns it into a drag — and the click that would have removed the
   * word is swallowed as the drag's own. The failure is not "the button did
   * nothing", it is "the button did something else".
   */
  test('removes the word when the press on 削除 drifts', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: WORD_SETS });
    await page.goto('/wordsets/set-work');

    const remove = page
      .locator('li', { has: page.locator('a[href="/vocabulary/w-choukou"]') })
      .getByRole('button', { name: '削除' });
    const box = await remove.boundingBox();
    if (!box) throw new Error('the 削除 button is not laid out');

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 6, y + 3, { steps: 3 });
    await page.mouse.up();

    await expect.poll(() => memberHrefs(page)).toEqual(['/vocabulary/w-kiriwake']);
  });

  /**
   * Emptying a set confirms first, unlike removing one row. What it destroys is
   * the study order, which took dragging to build and is recorded nowhere else,
   * so a mis-press costs the arrangement rather than one word.
   */
  test('empties the set only after confirming, and keeps the words', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: WORD_SETS });
    await page.goto('/wordsets/set-work');

    await page.getByRole('button', { name: '表示中の 2 語を削除' }).click();
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(memberOrder(page)).toHaveCount(2);

    await page.getByRole('button', { name: '表示中の 2 語を削除' }).click();
    await page.getByRole('button', { name: '外す' }).click();

    await expect.poll(() => memberHrefs(page)).toEqual([]);
    await page.goto('/vocabulary');
    await expect(page.getByText('3 語')).toBeVisible();
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
