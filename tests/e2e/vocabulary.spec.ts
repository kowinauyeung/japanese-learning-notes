import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSignedIn, watchForBlanking } from './fixtures';

/**
 * The notebook's whole reason to exist: find a word, read it, add one, change
 * one, remove one.
 *
 * Filtering and sorting are already covered exhaustively over pure functions in
 * tests/unit/filters.test.ts, so these do not re-enumerate them. What is only
 * observable here is that the URL, the router and the in-memory list stay in
 * agreement across a navigation — and that a write is reflected in the list
 * afterwards, which is a provider concern no unit test reaches.
 */

test.beforeEach(async ({ page }) => {
  await seedSignedIn(page);
});

/**
 * Form fields are reached through the dialog rather than the page. Unscoped,
 * `getByLabel('見出し語')` also matches the Browse sort control behind the
 * modal, whose 「見出し語順」 option is part of that select's accessible name.
 */
const addDialog = (page: Page) => page.getByRole('dialog', { name: '単語を追加' });
const editDialog = (page: Page) => page.getByRole('dialog', { name: '単語を編集' });

test.describe('browsing', () => {
  test('lists every word, then narrows on a substring', async ({ page }) => {
    await page.goto('/vocabulary');
    await expect(page.getByText('3 語')).toBeVisible();

    // Substring matching is what makes searching Japanese work without a
    // tokenizer: 兆 finds 兆候 because it is literally a substring.
    await page.getByPlaceholder('見出し語・読み方・タグ・意味・例文で検索').fill('兆');

    await expect(page.getByText('1 語')).toBeVisible();
    await expect(page.getByRole('link', { name: /兆候/ })).toBeVisible();
  });

  test('puts the filter in the URL so the view can be linked', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByPlaceholder('見出し語・読み方・タグ・意味・例文で検索').fill('兆');
    await expect(page).toHaveURL(/[?&]q=/);

    // The real assertion: a fresh load of that URL restores the same view.
    await page.reload();
    await expect(page.getByText('1 語')).toBeVisible();
  });

  test('opens a word and shows the detail the card omits', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('link', { name: /兆候/ }).click();

    await expect(page).toHaveURL(/\/vocabulary\/w-choukou$/);
    await expect(page.getByText('何かが起こる前ぶれ。')).toBeVisible();
    await expect(page.getByRole('heading', { name: /MANIFEST/ })).toBeVisible();
  });

  test('says so plainly when nothing matches', async ({ page }) => {
    await page.goto('/vocabulary?q=' + encodeURIComponent('存在しない語'));
    await expect(page.getByText('条件に合う単語がありません')).toBeVisible();
  });
});

test.describe('adding a word', () => {
  test('saves it and lands on its detail page', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    await dialog.getByLabel('見出し語').fill('清高');
    await dialog.getByLabel('読み方').fill('せいこう');
    await dialog.getByLabel('意味・説明').fill('清らかで気高いこと。');
    await dialog.getByRole('button', { name: '保存する' }).click();

    await expect(page.getByText('清らかで気高いこと。')).toBeVisible();
    // And the list it came from knows about it.
    await page.goto('/vocabulary');
    await expect(page.getByText('4 語')).toBeVisible();
  });

  test('refuses to save without the two required fields', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    await dialog.getByRole('button', { name: '保存する' }).click();
    await expect(dialog.getByText('見出し語は必須です。')).toBeVisible();

    await dialog.getByLabel('見出し語').fill('清高');
    await dialog.getByRole('button', { name: '保存する' }).click();
    await expect(dialog.getByText('意味・説明は必須です。')).toBeVisible();
  });

  /**
   * Tags reach `?tag=…`, so they may not contain whitespace or punctuation. The
   * form has to say which tag is the problem rather than refusing silently.
   */
  test('names the tag it will not accept', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    await dialog.getByLabel('見出し語').fill('清高');
    await dialog.getByLabel('意味・説明').fill('清らかで気高いこと。');
    await dialog.getByLabel('タグ').fill('a/b');
    await dialog.getByRole('button', { name: '保存する' }).click();

    await expect(dialog.getByText(/タグに使えない文字があります.*a\/b/)).toBeVisible();
  });
});

test.describe('editing and deleting', () => {
  test('edits a word and shows the change immediately', async ({ page }) => {
    await page.goto('/vocabulary/w-choukou');
    await page.getByRole('button', { name: '編集' }).click();

    const dialog = editDialog(page);
    await dialog.getByLabel('意味・説明').fill('起こる前のしるし。');
    await dialog.getByRole('button', { name: '保存する' }).click();

    await expect(page.getByText('起こる前のしるし。')).toBeVisible();
    await expect(page.getByText('何かが起こる前ぶれ。')).toBeHidden();
  });

  /**
   * The same defect as on `/wordsets`, and the reason the fix went into both
   * providers rather than one: saving ends in `refresh()`, and a refresh that
   * reports itself as loading replaces the whole page with 読み込み中…. Editing
   * is where it shows on this side, because adding navigates to the new word
   * and leaves the blanked page behind.
   */
  test('editing a word does not blank the page it was edited on', async ({ page }) => {
    await page.goto('/vocabulary/w-choukou');
    await page.getByRole('button', { name: '編集' }).click();

    const dialog = editDialog(page);
    await dialog.getByLabel('意味・説明').fill('起こる前のしるし。');

    const blanked = await watchForBlanking(page);
    await dialog.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText('起こる前のしるし。')).toBeVisible();

    expect(await blanked()).toBe(false);
  });

  /**
   * The date guard, tested for what it can actually be given.
   *
   * An impossible day like 2026-02-31 cannot be typed at all: the field is
   * <input type="date">, and the browser refuses the value before any of our
   * code runs. Nor can it arrive through JSON import, where sanitizeDraft has
   * already coerced it. So in the running app this guard exists for exactly one
   * input — a cleared field — and that is what is asserted here.
   *
   * The impossible-date rule itself is covered where it is reachable, over
   * isValidIsoDate in tests/unit/sanitize.test.ts, against the Firestore
   * documents in tests/unit/migrationOutput.test.ts, and it stays in the form
   * because a stored document is not obliged to have come from this field.
   */
  test('refuses to save with the learning date cleared', async ({ page }) => {
    await page.goto('/vocabulary/w-choukou');
    await page.getByRole('button', { name: '編集' }).click();

    const dialog = editDialog(page);
    await dialog.getByLabel('学んだ日').fill('');
    await dialog.getByRole('button', { name: '保存する' }).click();

    await expect(dialog.getByText('学習日を正しく入力してください。')).toBeVisible();
  });

  test('asks before deleting, and returns to the list once gone', async ({ page }) => {
    await page.goto('/vocabulary/w-choukou');
    await page.getByRole('button', { name: '削除' }).click();

    await expect(page.getByText(/「兆候」を削除しますか/)).toBeVisible();
    await page.getByRole('button', { name: '削除する' }).click();

    await expect(page).toHaveURL(/\/vocabulary$/);
    await expect(page.getByText('2 語')).toBeVisible();
    await expect(page.getByRole('link', { name: /兆候/ })).toBeHidden();
  });

  test('leaves the word alone when the confirmation is dismissed', async ({ page }) => {
    await page.goto('/vocabulary/w-choukou');
    await page.getByRole('button', { name: '削除' }).click();
    await page.getByRole('button', { name: 'キャンセル' }).click();

    await expect(page).toHaveURL(/\/vocabulary\/w-choukou$/);
    await page.goto('/vocabulary');
    await expect(page.getByText('3 語')).toBeVisible();
  });
});

test.describe('the dashboard', () => {
  /**
   * Counted against the frozen clock in fixtures.ts: two of the three words
   * fall in the ISO week beginning 2026-06-22, and all three in 2026.
   */
  test('counts the week, month and year from learnedOn', async ({ page }) => {
    await page.goto('/');

    // The tile is the label's parent: <div><p>今週学んだ語</p><p>2</p></div>.
    const tile = (label: string) => page.getByText(label).locator('xpath=..');

    await expect(tile('今週学んだ語')).toContainText('2');
    await expect(tile('今月学んだ語')).toContainText('2');
    await expect(tile('今年学んだ語')).toContainText('3');
  });

  test('breaks the notebook down by level', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('JLPTレベル（全 3 語）')).toBeVisible();
  });
});
