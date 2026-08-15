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

  test('opens a word in a dialog without leaving the list', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('link', { name: /兆候/ }).click();

    const dialog = page.getByRole('dialog', { name: '単語' });
    await expect(dialog).toContainText('何かが起こる前ぶれ。');
    // The list is still there underneath — that is the whole point of it being
    // a dialog rather than a navigation.
    await expect(page.getByText('3 語')).toBeVisible();
    // And the address is the word's own, so it can be copied or reloaded.
    await expect(page).toHaveURL(/\/vocabulary\/w-choukou$/);
  });

  /**
   * The address is real, so a reload of it has to mean the page rather than the
   * dialog. That is why the dialog is held in React state and not in
   * `location.state`, which the browser restores across a reload — see
   * `lib/vocabDialog.tsx`.
   */
  test('reloading the dialog’s address lands on the full page', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('link', { name: /兆候/ }).click();
    await expect(page.getByRole('dialog', { name: '単語' })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('dialog', { name: '単語' })).toBeHidden();
    await expect(page.getByRole('heading', { name: /MANIFEST/ })).toBeVisible();
  });

  /** Back closes it and leaves you where you were, which is what a dialog owes. */
  test('going back closes the dialog and keeps the page behind it', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('link', { name: /兆候/ }).click();
    await expect(page.getByRole('dialog', { name: '単語' })).toBeVisible();

    await page.goBack();

    await expect(page.getByRole('dialog', { name: '単語' })).toBeHidden();
    await expect(page).toHaveURL(/\/vocabulary$/);
    await expect(page.getByText('3 語')).toBeVisible();
  });

  test('reaches the full page from the dialog', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('link', { name: /兆候/ }).click();
    await page.getByRole('link', { name: '詳細を見る' }).click();

    await expect(page.getByRole('heading', { name: /MANIFEST/ })).toBeVisible();
    await expect(page.getByRole('dialog', { name: '単語' })).toBeHidden();

    /**
     * One press of Back, not two. The dialog pushed this address by hand when
     * it opened, so a 詳細を見る that pushed it again left a duplicate entry the
     * reader cannot see — and the first Back appeared to do nothing, because it
     * moved between two entries showing the same page.
     */
    await page.goBack();
    await expect(page).toHaveURL(/\/vocabulary$/);
    await expect(page.getByText('3 語')).toBeVisible();
  });

  test('says so plainly when nothing matches', async ({ page }) => {
    await page.goto('/vocabulary?q=' + encodeURIComponent('存在しない語'));
    await expect(page.getByText('条件に合う単語がありません')).toBeVisible();
  });
});

/**
 * The nav is the app's table of contents, and its order is a claim about how
 * the notebook is used: collect words, organise them, drill them, look back.
 * Nothing else asserts it, so a rename or a dropped destination would otherwise
 * reach a reviewer as a diff nobody had to justify.
 */
test.describe('navigation', () => {
  test('lists the six destinations in the order the notebook is used', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('navigation').first().getByRole('link')).toHaveText([
      '学習サマリー',
      '単語',
      '単語集',
      'フラッシュカード',
      '書き取り練習',
      '履歴',
    ]);
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

/**
 * The accent, which no other layer sees whole: `mora.ts` is unit-tested and the
 * notation has a component test, but until `w-choukou` carried a `pitchAccent`
 * nothing rendered it against a real route, a real provider and real CSS.
 */
test.describe('the pitch accent', () => {
  test('draws the notation on the word it belongs to, and refuses to save a bad one', async ({
    page,
  }) => {
    await page.goto('/vocabulary/w-choukou');
    // 0（平板）: mora 0 low, the rest high, and no fall anywhere in the word.
    await expect(page.getByText('0（平板）')).toBeVisible();

    await page.getByRole('button', { name: '編集' }).click();
    const dialog = editDialog(page);
    const accent = dialog.getByLabel(/アクセント/);

    // ちょうこう is four mora — five is past the end of the word.
    await accent.fill('5');
    await expect(dialog.getByText('ちょうこう は4拍です。')).toBeVisible();
    await expect(accent).toHaveAttribute('aria-invalid', 'true');

    await dialog.getByRole('button', { name: '保存する' }).click();
    // Refused, not merely flagged: the dialog is still open. And the count is 2
    // on purpose — the field and the footer give the *same* sentence. They gave
    // two different ones until `accentProblem` became the single source, and the
    // footer's was the vaguer of the pair.
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('ちょうこう は4拍です。')).toHaveCount(2);

    await accent.fill('3');
    await dialog.getByRole('button', { name: '保存する' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('3（中高）')).toBeVisible();
  });
});

/**
 * The footer, which is layout twice over.
 *
 * It is shared between the public shell and the signed-in one, and those are
 * not the same width — `max-w-3xl` for reading prose, `max-w-5xl` for the card
 * grid. With the width hard-coded to one of them, the footer's contents sat
 * visibly out of line with every page above it in the other shell.
 *
 * And it has to reach the bottom. The signed-in layout was a plain block, so a
 * short page left the footer floating with page background beneath it, which
 * reads as a stray edge across the screen — visible in dark mode, easy to miss
 * in light.
 */
test.describe('the footer', () => {
  test('lines up with the page above it and sits on the bottom edge', async ({ page }) => {
    // A short page on purpose: a long one hides the pinning bug entirely.
    await page.goto('/wordsets');
    await expect(page.getByText('まだ単語集がありません', { exact: false })).toBeVisible();

    const box = await page.evaluate(() => {
      const footer = document.querySelector('footer');
      const main = document.querySelector('main');
      if (!footer || !main) return null;
      const inner = footer.firstElementChild;
      if (!inner) return null;
      return {
        gapBelow: Math.round(window.innerHeight - footer.getBoundingClientRect().bottom),
        left: Math.round(inner.getBoundingClientRect().left - main.getBoundingClientRect().left),
        width: Math.round(inner.getBoundingClientRect().width - main.getBoundingClientRect().width),
      };
    });

    expect(box).toEqual({ gapBelow: 0, left: 0, width: 0 });
  });
});

/**
 * Layout, which is why this is here and not in a component test: the defect is
 * a scroll container's geometry, and jsdom has no layout to be wrong about.
 */
test.describe('the JSON import tab', () => {
  /**
   * 読み込む is the one control the tab exists to reach, and a ten-row paste box
   * under an expandable schema block put it below the fold. It sits in the modal
   * footer now, outside the scrollport.
   *
   * **Position is asserted across a scroll, not presence.** Two attempts to pin
   * it inside the panel with `position: sticky` failed in ways that every
   * available cheaper assertion passes: the first left 32px of scrollable panel
   * beneath it, the second parked it past its own resting place so it slid 16px
   * over the last of the scroll. Both rendered the button, both had the rule
   * applied, and both were visible to `toBeVisible()`.
   */
  test('keeps 読み込む in one place however far the panel is scrolled', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();
    await addDialog(page).getByRole('button', { name: 'JSON' }).click();
    await page
      .getByLabel('AI の返した JSON を貼り付け')
      .fill(`{\n${'  "filler": 1,\n'.repeat(60)}  "headword": "兆候"\n}`);

    const button = page.getByRole('button', { name: '読み込む' });
    await expect(button).toBeVisible();
    const atTop = await button.boundingBox();

    const scrolled = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"] .overflow-y-auto');
      if (!(panel instanceof HTMLElement)) return 0;
      panel.scrollTop = panel.scrollHeight;
      return panel.scrollTop;
    });
    // The fixture has to actually overflow, or the test proves nothing.
    expect(scrolled).toBeGreaterThan(0);

    await expect(button).toBeVisible();
    expect(await button.boundingBox()).toEqual(atTop);
  });
});
