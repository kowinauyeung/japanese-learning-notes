import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { INPUT_LIMITS } from '../../src/domain/limits';
import { DETAILED_WORD, seed, seedSignedIn, watchForBlanking, WORDS } from './fixtures';

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
/**
 * `exact`, unlike the two above. Playwright matches an accessible name by
 * substring, so a bare 「単語」 also matches 「単語を編集」 — and an assertion
 * that the preview is showing would then pass while the edit form is on screen.
 */
const previewDialog = (page: Page) => page.getByRole('dialog', { name: '単語', exact: true });

test.describe('browsing', () => {
  /**
   * The filters are around 480px of a 390px screen, so on a phone they start
   * folded — otherwise the first word of the notebook is two scrolls below the
   * page the reader opened to read it.
   *
   * The second half is what makes the first half safe: folding hides the
   * controls, and it must never hide the fact that a filter is on. The
   * removable chips are outside the panel for that reason, and this is what
   * says so — a narrowed list that looks unnarrowed is the failure mode of
   * every collapsed filter panel.
   */
  test('folds the filters on a phone, but not what is narrowing the list', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/vocabulary?jlpt=N1');

    const panel = page.getByText('最近のタグ');
    await expect(page.getByText('1 語')).toBeVisible();
    await expect(panel).toBeHidden();
    await expect(page.getByRole('button', { name: 'N1 ✕' })).toBeVisible();

    await page.getByRole('button', { name: /絞り込み/ }).click();

    await expect(panel).toBeVisible();
  });

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

  test('keeps an unbroken search summary inside the viewport', async ({ page }) => {
    const search = 'W'.repeat(INPUT_LIMITS.search);
    await page.goto('/vocabulary');
    await page.getByPlaceholder('見出し語・読み方・タグ・意味・例文で検索').fill(search);

    await expect(
      page.getByRole('button', { name: new RegExp(`^「W{${INPUT_LIMITS.search}}」`) }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  });

  test('keeps furigana and pitch annotations at their content width', async ({ page }) => {
    await page.goto('/vocabulary/w-kiriwake');
    const furigana = page.locator('.has-ruby').first();
    await expect(furigana).toBeVisible();
    expect((await furigana.boundingBox())?.width ?? Infinity).toBeLessThan(400);

    await page.goto('/vocabulary/w-choukou');
    const pitch = page.locator('.has-accent').first();
    await expect(pitch).toBeVisible();
    expect((await pitch.boundingBox())?.width ?? Infinity).toBeLessThan(400);
  });

  test('makes the detail word the lone level-one heading, so heading navigation identifies the entry', async ({
    page,
  }) => {
    await page.goto('/vocabulary/w-choukou');

    // This route, rather than EntryHeadline in isolation, owns the page-level
    // semantics. Without pageHeading here, a heading shortcut skips the word
    // the reader opened to study.
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveCount(1);
    await expect(heading).toContainText('兆候');
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
    await expect(page.getByRole('heading', { name: '概要' })).toBeVisible();
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

  /**
   * Back, with the edit form up rather than the preview.
   *
   * `VocabDialog` remembers which word it is editing rather than a boolean, so
   * that a form left open when the dialog closes cannot greet the *next* word
   * with itself. Back does not go through the form's own close: `popstate` in
   * `VocabDialogProvider` clears the dialog directly, and `VocabDialog` is
   * mounted for the whole session — so the remembered id survives, and the one
   * word it still matches is the word it came from. Reopening that word then
   * skips the note entirely and hands the reader a form they did not ask for.
   */
  test('reopens a word on its note after the edit form was closed by going back', async ({
    page,
  }) => {
    await page.goto('/vocabulary');
    await page.getByRole('link', { name: /兆候/ }).click();
    await previewDialog(page).getByRole('button', { name: '編集' }).click();
    await expect(editDialog(page)).toBeVisible();

    await page.goBack();
    await expect(editDialog(page)).toBeHidden();

    await page.getByRole('link', { name: /兆候/ }).click();

    await expect(previewDialog(page)).toBeVisible();
    await expect(editDialog(page)).toBeHidden();
  });

  test('reaches the full page from the dialog', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('link', { name: /兆候/ }).click();
    await page.getByRole('link', { name: '詳細を見る' }).click();

    await expect(page.getByRole('heading', { name: '概要' })).toBeVisible();
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

  /**
   * What the dialog is *for*, seeded against a note that has more than a
   * definition in it.
   *
   * The dialog used to render its own summary — the sense descriptions, one
   * example, and nothing else — so a word opened from a list dropped the
   * sentence it was met in, its second meaning, its usage notes and its related
   * words, all without saying anything was missing. Against `WORDS`, which
   * record a definition and no more, a summary and the whole note look the
   * same; `DETAILED_WORD` is what tells them apart.
   */
  test('shows the whole note in the dialog, not a summary of it', async ({ page }) => {
    await seed(page, { signedIn: true, entries: [DETAILED_WORD] });
    await page.goto('/vocabulary');
    await page.getByRole('link', { name: /兆候/ }).click();

    const dialog = previewDialog(page);
    await expect(dialog.getByRole('heading', { name: '概要' })).toBeVisible();
    // The sentence the word was met in, which the summary had no place for.
    await expect(dialog.getByText('景気回復の兆候が見えてきた。')).toBeVisible();
    // The *second* sense and the second example: the summary showed one of each.
    await expect(dialog.getByText('病気のはじまりを示すしるし。')).toBeVisible();
    await expect(dialog.getByText('春の兆候を感じる。')).toBeVisible();
    await expect(dialog.getByText('「症状」とは違い、病気そのものを指さない。')).toBeVisible();
    // `exact`, or it also matches 「意味：捕捉地震的前兆」 in the sense above it.
    await expect(dialog.getByText('前兆', { exact: true })).toBeVisible();

    // Still a dialog over the list, not a navigation to the page.
    await expect(page.getByText('1 語')).toBeVisible();
    await expect(page).toHaveURL(/\/vocabulary\/w-choukou$/);
  });

  /**
   * Editing was deliberately absent here on the grounds that a write would
   * leave the page underneath stale. It does not: both screens read the same
   * `EntriesProvider`, and every save ends in its `refresh()`. This is that
   * claim, measured — the list behind the dialog counts the change without
   * being navigated to.
   */
  test('edits the word from the dialog and the list behind it agrees', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('link', { name: /兆候/ }).click();
    await previewDialog(page).getByRole('button', { name: '編集' }).click();

    const form = editDialog(page);
    // One dialog at a time: the form replaces the preview rather than stacking
    // a second focus trap and a second Escape listener on top of it.
    await expect(previewDialog(page)).toBeHidden();
    await form.getByLabel('意味・説明').fill('起こる前のしるし。');
    await form.getByRole('button', { name: '保存する' }).click();

    // Back to the preview, reading the entry the save refreshed.
    await expect(previewDialog(page).getByText('起こる前のしるし。')).toBeVisible();

    // And the list underneath, which was never navigated away from.
    await page.keyboard.press('Escape');
    await expect(previewDialog(page)).toBeHidden();
    await expect(page.getByText('起こる前のしるし。')).toBeVisible();
    await expect(page.getByText('何かが起こる前ぶれ。')).toBeHidden();
  });

  /**
   * Whether the form is open is a fact about *which word* it was opened for,
   * not a flag. Held as a boolean it survives the dialog closing, and the next
   * word opened from any list arrives already inside a form nobody asked for.
   */
  test('opening another word after leaving the form lands on the preview', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('link', { name: /兆候/ }).click();
    await previewDialog(page).getByRole('button', { name: '編集' }).click();
    await expect(editDialog(page)).toBeVisible();

    // Away from the word entirely, without cancelling the form first.
    await page.goBack();
    await expect(editDialog(page)).toBeHidden();

    // ちょっと and not 切り分け: a card's accessible name interleaves the ruby
    // reading with the word, so 切り分け reads as 「切きりり分わけ」 and no
    // regex over the headword alone matches it.
    await page.getByRole('link', { name: /ちょっと/ }).click();
    await expect(previewDialog(page)).toBeVisible();
    await expect(editDialog(page)).toBeHidden();
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
   * The one claim about AI drafting that the component tests cannot make.
   *
   * `tests/component/JsonImport.test.tsx` already covers what the button hands
   * over and that the warning is rendered, and does it in milliseconds — so
   * this deliberately does not re-check either. What is only observable here is
   * the span: the reply crosses the port, goes through `jsonToDraft`, moves the
   * modal to another tab, fills a form nothing typed into, and is then saved
   * through the repository and counted in the list behind it. Five components
   * and a provider, none of which a jsdom render of one panel can see.
   *
   * The model is `backend.e2e.ts`'s stand-in, which answers from the prompt.
   * That is what makes 「兆候」 below an assertion about this request rather
   * than about a fixture that would pass for any word.
   */
  test('fills the form from a drafted reply and saves it', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    await dialog.getByRole('button', { name: 'JSON' }).click();
    await dialog.getByLabel('単語').fill('兆候');
    await dialog.getByRole('button', { name: 'AIで作成' }).click();

    // The import moved the modal to 詳細 and filled it. Asserted on the fields
    // rather than on the tab, because a tab that switched over an empty form is
    // the failure this is looking for.
    await expect(dialog.getByLabel('見出し語')).toHaveValue('兆候');
    await expect(dialog.getByLabel('読み方')).toHaveValue('ちょうこう');
    await expect(dialog.getByLabel('意味・説明')).toHaveValue('兆候の意味');

    // The warning travels with the draft to the screen the reader is now on.
    // On the JSON panel it was a statement about a button; here it is about the
    // twenty fields in front of them, which is where a wrong reading is visible.
    await expect(
      dialog.getByText(/AIが書いた内容なので誤りが含まれることがあります/),
    ).toBeVisible();

    await dialog.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText('兆候の意味')).toBeVisible();

    await page.goto('/vocabulary');
    await expect(page.getByText('4 語')).toBeVisible();
  });

  /**
   * The 簡単 button saves; it does not fill a form and stop.
   *
   * Here and not in tests/component because the claim is the span nothing
   * smaller can see: the reply crosses the port, goes through `jsonToDraft`,
   * skips the tab switch every other import route performs, is written through
   * the repository, and lands the reader on the entry's own page with the
   * modal gone. `tests/component/SimpleForm.test.tsx` already covers which
   * fields arm the button, in milliseconds, so this does not re-check that.
   *
   * The reply is `backend.e2e.ts`'s stand-in, which answers from the prompt —
   * so 「兆候」 below is an assertion about this request rather than about a
   * fixture that would pass for any word.
   */
  test('saves a drafted word outright instead of stopping at the twenty-field form', async ({
    page,
  }) => {
    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    await dialog.getByLabel('見出し語').fill('兆候');
    await dialog.getByRole('button', { name: 'AIで作成して保存' }).click();

    // The URL and the closed dialog together, and neither alone.
    //
    // React writes a textarea's value into its text content, so 「兆候の意味」
    // is on screen either way — once as the entry, once as the 意味・説明 box
    // of a 詳細 tab that never saved. Measured: with the direct save reverted,
    // a text assertion passed while the modal was still open in front of it.
    await expect(page).toHaveURL(/\/vocabulary\/[^/]+$/);
    await expect(dialog).toBeHidden();
    await expect(page.getByText('兆候の意味')).toBeVisible();

    await page.goto('/vocabulary');
    await expect(page.getByText('4 語')).toBeVisible();
  });

  /**
   * A draft that never came back leaves the reader somewhere they can finish.
   *
   * The 簡単 button has no room under it for the manual route, so a failure
   * there moves the reader to the tab that has one — and the word has to make
   * the trip, or the first thing they do on arrival is type it again. Both
   * halves are asserted: the reason the model gave, and the sentence that says
   * their input came with them.
   *
   * `quota` rather than `unavailable`, because `unavailable` also makes the
   * port stop reporting itself available — which would confound "the word was
   * carried over" with "the drafting controls went away".
   */
  test('carries the word to the JSON tab when the model does not answer', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, entryDrafting: 'quota' });

    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    await dialog.getByLabel('見出し語').fill('兆候');
    await dialog.getByLabel('出典').fill('会議');
    await dialog.getByRole('button', { name: 'AIで作成して保存' }).click();

    await expect(dialog.getByRole('textbox', { name: '単語' })).toHaveValue('兆候');
    await expect(dialog.getByRole('textbox', { name: '出典' })).toHaveValue('会議');
    await expect(dialog.getByText(/本日のAI利用回数の上限に達しました/)).toBeVisible();
    await expect(dialog.getByText(/入力した内容はこちらに引き継いでいます/)).toBeVisible();
  });

  /**
   * The mark on the quick tab is not the only thing that says AI.
   *
   * 「簡単」 describes the form, not that a model will fill it, so the mark is
   * the whole of the signal — and it is an `aria-hidden` drawing, which is
   * nothing a screen reader can be asked to interpret. Without the word beside
   * it, the one press this dialog exists for is discoverable only by opening
   * the tab and looking.
   */
  test('says AI on the quick tab in words, not only in a drawing', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    await expect(addDialog(page).getByRole('button', { name: 'AI 簡単' })).toBeVisible();
  });

  /**
   * The mark goes when the thing it promises does.
   *
   * `unavailable` is permanent for this reader — a retired model, a project
   * with the API off, a country it is not offered in — so the port stops
   * reporting itself available and `SimpleForm` drops its whole drafting group.
   * A mark left on the tab would then advertise a control that is no longer
   * behind it, which is worse than never having offered one.
   */
  test('drops the mark once drafting has failed for good', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, entryDrafting: 'unavailable' });

    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    await dialog.getByLabel('見出し語').fill('兆候');
    await dialog.getByRole('button', { name: 'AIで作成して保存' }).click();

    // The reason is on screen, so this is the state after the failure and not
    // before it.
    await expect(dialog.getByText(/ここではAI作成を利用できません/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: '簡単', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'AI 簡単' })).toBeHidden();
  });

  /**
   * The sentence the word was met in reaches the note the one press writes.
   *
   * It is the one optional field on the quick tab that changes what comes back:
   * `buildPrompt` asks for the context analysis only when there is a sentence
   * to analyse, and orders the senses by it. `jsonToDraft` then writes it into
   * `context.original` whatever the model said, so the reader's own words are
   * what is stored rather than the model's copy of them.
   *
   * The seeded reply leaves `context` out entirely, which is what makes this an
   * assertion about the threading rather than about the model repeating itself.
   */
  test('carries the sentence into the note a one-press draft saves', async ({ page }) => {
    await seed(page, {
      signedIn: true,
      entries: WORDS,
      entryDraftingReply: JSON.stringify({ headword: '兆候', definition: 'きざし。' }),
    });

    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    await dialog.getByLabel('見出し語').fill('兆候');
    await dialog.getByLabel('出会った文').fill('あやしい兆候ではあるのだろうけれど');
    await dialog.getByRole('button', { name: 'AIで作成して保存' }).click();

    await expect(page.getByText('この文での使われ方')).toBeVisible();
    await expect(page.getByText('あやしい兆候ではあるのだろうけれど')).toBeVisible();
  });

  /**
   * A reply that will not import stays on screen to be corrected.
   *
   * The drafting button is also the only button that can throw the reply away,
   * and the allowance is spent by the time it does. `JsonImport` used to write
   * the raw box itself; moving the import into the modal dropped that for the
   * tab it came from, so a malformed reply was refused into an empty box with
   * nothing left to fix.
   *
   * The reply is seeded rather than provoked: `INPUT_LIMITS.importWord` is
   * `ENTRY_LIMITS.headword`, so no word a reader can type produces a note too
   * long for itself, and the stand-in otherwise always answers correctly.
   */
  test('leaves a malformed reply in the paste box instead of discarding it', async ({ page }) => {
    await seed(page, {
      signedIn: true,
      entries: WORDS,
      entryDraftingReply: 'sorry, I cannot do that',
    });

    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    await dialog.getByRole('button', { name: 'JSON' }).click();
    await dialog.getByLabel('単語').fill('兆候');
    await dialog.getByRole('button', { name: 'AIで作成' }).click();

    await expect(dialog.getByText('JSON として解析できませんでした。')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'AI の返した JSON を貼り付け' })).toHaveValue(
      'sorry, I cannot do that',
    );
  });

  /**
   * A note can import cleanly and still be refused by the save.
   *
   * `sanitizeDraft` will not bound the pitch accent against the reading — its
   * comment says the form owns that rule, "where it can be shown and corrected
   * instead" — so a model answering 9 for a three-mora word passes the import
   * and fails `draftError`. The quick tab has neither the reading nor the
   * accent on it, so a refusal there left the reader reading a sentence about
   * an accent on a form with no accent on it.
   */
  test('moves a refused draft to the form that has the field it was refused for', async ({
    page,
  }) => {
    await seed(page, {
      signedIn: true,
      entries: WORDS,
      entryDraftingReply: JSON.stringify({
        headword: '兆候',
        reading: 'ちょうこう',
        definition: 'きざし。',
        pitchAccent: 9,
      }),
    });

    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    await dialog.getByLabel('見出し語').fill('兆候');
    await dialog.getByRole('button', { name: 'AIで作成して保存' }).click();

    // The detailed form, with the drafted values in it and the accent on screen
    // — not the quick tab it was pressed from, and not a saved note.
    await expect(dialog.getByLabel('読み方')).toHaveValue('ちょうこう');
    await expect(dialog.getByLabel(/アクセント/)).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/vocabulary$/);
  });

  /**
   * A reason that has been superseded stops being shown.
   *
   * `JsonImport.generate` cleared it as its first act; lifting the state into
   * the modal dropped that. So a draft that failed and then worked on a retry
   * left the failure behind on the JSON panel, waiting to describe a request
   * that had since succeeded to whoever next opened that tab.
   *
   * The seed is edited between the two presses rather than reseeded: the
   * stand-in reads it per request, and a reload would take the modal with it.
   */
  test('drops a failure the retry disproved, instead of showing it on the next visit', async ({
    page,
  }) => {
    await seed(page, { signedIn: true, entries: WORDS, entryDrafting: 'quota' });

    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    const quota = dialog.getByText(/本日のAI利用回数の上限に達しました/);
    await dialog.getByRole('button', { name: 'JSON' }).click();
    await dialog.getByLabel('単語').fill('兆候');
    await dialog.getByRole('button', { name: 'AIで作成' }).click();
    await expect(quota).toBeVisible();

    await page.evaluate(() => {
      delete (window as unknown as { __GOITEI_E2E__: { entryDrafting?: string } }).__GOITEI_E2E__
        .entryDrafting;
    });
    await dialog.getByRole('button', { name: 'AIで作成' }).click();
    await expect(dialog.getByLabel('読み方')).toHaveValue('ちょうこう');

    await dialog.getByRole('button', { name: 'JSON' }).click();
    await expect(quota).toBeHidden();
  });

  /**
   * A save that outlived its dialog does not close the one that replaced it.
   *
   * Closing does not cancel a `create` that has already gone, and the close
   * button stays live while a request is out on purpose. So the write finishes
   * against a dialog that is no longer there — and its completion used to call
   * `onSaved` and `onClose` regardless, closing whatever was open by then and
   * navigating away from wherever the reader had got to.
   *
   * The note itself is still written, and that is deliberate: it was asked for.
   * What belongs to the run that asked is the reaction, not the write.
   */
  test('does not close a reopened dialog when the save from the closed one lands', async ({
    page,
  }) => {
    await seed(page, { signedIn: true, entries: WORDS, entrySave: 'defer' });

    await page.goto('/vocabulary');
    const dialog = addDialog(page);

    await page.getByRole('button', { name: '＋追加' }).click();
    await dialog.getByLabel('見出し語').fill('兆候');
    await dialog.getByRole('button', { name: 'AIで作成して保存' }).click();
    // The drafting is done and the write is what is outstanding now.
    await expect(dialog.getByRole('button', { name: '作成中…' })).toBeVisible();
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).toBeHidden();

    // A second dialog, which knows nothing about the write still in flight.
    await page.getByRole('button', { name: '＋追加' }).click();
    await dialog.getByLabel('見出し語').fill('清高');

    await page.evaluate(async () => {
      (
        window as unknown as { __GOITEI_E2E_RELEASE_ENTRY_SAVE__?: () => void }
      ).__GOITEI_E2E_RELEASE_ENTRY_SAVE__?.();
      // Settled here rather than by asserting straight after: the write's own
      // continuation and React's commit both run after `evaluate` returns, so an
      // assertion made outside could pass before the closing it is looking for
      // had a chance to happen.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });

    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('見出し語')).toHaveValue('清高');
    await expect(page).toHaveURL(/\/vocabulary$/);
  });

  /**
   * A request that outlived its dialog does not unlock the one that replaced it.
   *
   * The close button stays live while a draft is out, on purpose, as the way out
   * of a request that hangs. So a reader can close, reopen and press again, and
   * the first reply then lands with the second still in flight. Reporting the
   * unlock on the reply alone brought 保存する back over a form the second reply
   * was about to overwrite — the exact case the lock exists to prevent.
   *
   * Here rather than in tests/component: what is under test is the modal's own
   * bookkeeping, and `EntryFormModal` resolves its repository through a provider
   * no component test may reach. `SimpleForm.test.tsx` covers the other half —
   * that two requests never share a name — which is what makes the comparison
   * this asserts mean anything.
   */
  test('does not let a request from a closed dialog unlock the one that replaced it', async ({
    page,
  }) => {
    await seed(page, { signedIn: true, entries: WORDS, entryDraftingHangs: true });

    await page.goto('/vocabulary');
    const dialog = addDialog(page);
    const save = dialog.getByRole('button', { name: '保存する' });

    // First request, then abandoned by closing the dialog.
    await page.getByRole('button', { name: '＋追加' }).click();
    await dialog.getByLabel('見出し語').fill('兆候');
    await dialog.getByRole('button', { name: 'AIで作成して保存' }).click();
    await expect(save).toBeDisabled();
    await dialog.getByRole('button', { name: '閉じる' }).click();

    // Second request, in a session that knows nothing about the first.
    await page.getByRole('button', { name: '＋追加' }).click();
    await dialog.getByLabel('見出し語').fill('清高');
    await dialog.getByRole('button', { name: 'AIで作成して保存' }).click();
    await expect(save).toBeDisabled();

    // The abandoned one answers. It must change nothing here.
    await page.evaluate(async () => {
      (
        window as unknown as { __GOITEI_E2E_RELEASE_DRAFT__?: () => void }
      ).__GOITEI_E2E_RELEASE_DRAFT__?.();
      /*
        Settled inside the evaluate, and this is the assertion's whole footing.

        Resolving the held promise only queues the reply's continuation; the
        hook's `finally`, the caller's setter and React's commit all run after
        `evaluate` returns. `toBeDisabled` passes on its first poll, so asserted
        outside it can pass simply by arriving before the unlock it is looking
        for — green whether or not the guard exists.

        Two frames rather than a timeout: the first lets the microtask queue
        drain and React schedule, the second lets it paint what it scheduled.
      */
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await expect(save).toBeDisabled();
  });

  /**
   * The panel's fields keep their value across an import that resolves late.
   *
   * `loadJson` reads 出会った文 and 出典 to build the context it hands
   * `jsonToDraft`, and the paste button calls it after an await — after a
   * clipboard read that a browser may put its own confirmation in front of, for
   * as long as the reader takes to answer. Through the closure those two were
   * whatever they held when the button was pressed, so a 出典 typed during the
   * wait was dropped from the entry that arrived.
   *
   * Only reachable through the clipboard: the drafting button disables these
   * fields while its request is out, and this one cannot, because the wait is a
   * dialog the browser owns and may never show.
   *
   * Here rather than in tests/component because what is under test is
   * `loadJson`, which lives in the modal and needs the entries provider behind
   * it — the reply has to cross the panel, the modal and `jsonToDraft` before
   * the assertion means anything.
   */
  test('keeps a source typed while the clipboard was still being read', async ({ page }) => {
    // A clipboard the test resolves by hand, so "still being read" is a state
    // the test controls rather than a race it hopes for.
    await page.addInitScript(() => {
      let release: ((text: string) => void) | undefined;
      (window as unknown as { releaseClipboard: (text: string) => void }).releaseClipboard = (
        text,
      ) => release?.(text);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          readText: () =>
            new Promise<string>((resolve) => {
              release = resolve;
            }),
        },
      });
    });

    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    const dialog = addDialog(page);
    await dialog.getByRole('button', { name: 'JSON' }).click();
    await dialog.getByRole('button', { name: 'クリップボードから貼り付け' }).click();

    // Typed after the read started and before it finished.
    await dialog.getByLabel('出典').fill('会議');
    await page.evaluate(() =>
      (window as unknown as { releaseClipboard: (text: string) => void }).releaseClipboard(
        '{"headword":"兆候","definition":"きざし。"}',
      ),
    );

    // The panel is gone by now — the import moved the modal to 詳細 — so this
    // 出典 is the form's, not the one that was typed into.
    await expect(dialog.getByLabel('出典')).toHaveValue('会議');
    await expect(dialog.getByLabel('見出し語')).toHaveValue('兆候');
  });

  /**
   * Tags reach `?tag=…`, so they may not contain whitespace or punctuation. The
   * form has to say which tag is the problem rather than refusing silently.
   */
  test('names the tag it will not accept', async ({ page }) => {
    await page.goto('/vocabulary');
    await page.getByRole('button', { name: '＋追加' }).click();

    // On 詳細, because 簡単 no longer carries タグ: everything the drafting
    // button fills better than a person typing at capture time came off that
    // tab, and the validation is the form's rather than any one tab's.
    const dialog = addDialog(page);
    await dialog.getByRole('button', { name: '詳細' }).click();
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
   * #23: a denied save used to render the same 保存できませんでした as a typo
   * or a dropped connection — retrying a lockout never clears it, which is the
   * ambiguity `loadErrorMessage` exists to remove. End-to-end because the layer
   * under test is the wiring — `entryRepositoryFor` (`src/lib/backend.e2e.ts`)
   * rejecting with Firestore's own `permission-denied`, and the modal choosing
   * what to render. The branch itself is `tests/unit/loadError.test.ts`.
   */
  test('shows the access-denied message on a denied save, not the generic one', async ({
    page,
  }) => {
    await seed(page, { signedIn: true, entries: WORDS, entrySave: 'denied' });
    await page.goto('/vocabulary/w-choukou');
    await page.getByRole('button', { name: '編集' }).click();

    const dialog = editDialog(page);
    await dialog.getByLabel('意味・説明').fill('起こる前のしるし。');
    await dialog.getByRole('button', { name: '保存する' }).click();

    await expect(
      dialog.getByText(
        'アクセスが許可されていません。一度サインアウトして、サインインし直してください。',
      ),
    ).toBeVisible();
    await expect(dialog.getByText('保存できませんでした。', { exact: true })).toBeHidden();

    // Not only the message: the denial is rejected before the in-memory store
    // is touched (`entryRepositoryFor.update` in `src/lib/backend.e2e.ts`
    // checks `entrySave` first), so the stored entry must still read the way
    // it did before this attempt.
    await page.reload();
    await expect(page.getByText('何かが起こる前ぶれ。')).toBeVisible();
    await expect(page.getByText('起こる前のしるし。')).toBeHidden();
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
   * isValidIsoDate in tests/unit/sanitize.test.ts, and it stays in the form
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
      // Both measured one level in, because both outer boxes are now full
      // bleed: they carry the device's safe-area insets so their backgrounds
      // still reach the screen edge, and the box that carries the gutter and
      // the measure is the child. Comparing `<main>` itself, which is what this
      // did while it *was* that box, now compares the viewport to a centred
      // 1024px column and reports a 128px misalignment that is not there.
      const innerFooter = footer.firstElementChild;
      const innerMain = main.firstElementChild;
      if (!innerFooter || !innerMain) return null;
      const f = innerFooter.getBoundingClientRect();
      const m = innerMain.getBoundingClientRect();
      return {
        gapBelow: Math.round(window.innerHeight - footer.getBoundingClientRect().bottom),
        left: Math.round(f.left - m.left),
        width: Math.round(f.width - m.width),
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
