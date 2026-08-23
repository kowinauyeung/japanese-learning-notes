import { expect, test } from '@playwright/test';
import { OVERSIZE_WORDS, seed, seedSignedIn, WORD_SETS, WORDS } from './fixtures';

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

  /**
   * The shortcuts are covered as DOM events in
   * tests/component/FlashcardSession.test.tsx. What only a browser shows is
   * that a real key press reaches a listener bound to `document` when nothing
   * on the page has focus — which is the state a session starts in.
   */
  test('runs a whole card from the keyboard', async ({ page }) => {
    await page.goto('/practice/flashcards');
    await page.getByRole('button', { name: '#仕事' }).click();
    await page.getByRole('button', { name: '開始する' }).click();

    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /わかった/ })).toBeVisible();
    await page.keyboard.press('ArrowRight');

    await expect(page.getByText('1 / 1')).toBeVisible();
  });

  test('asks before throwing a session away, and stays put if refused', async ({ page }) => {
    await page.goto('/practice/flashcards');
    await page.getByRole('button', { name: '開始する' }).click();

    await page.keyboard.press('Escape');
    const dialog = page.getByRole('dialog', { name: '練習を中断しますか？' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('進捗')).toBeVisible();

    await page.getByRole('button', { name: '中断' }).click();
    await page.getByRole('button', { name: '中断する' }).click();
    // Back on the setup screen, with the session discarded rather than scored.
    await expect(page.getByRole('button', { name: '開始する' })).toBeVisible();
  });

  /**
   * もう一度 means "those words again", not "run the filters again". The
   * session has already been recorded by the time the summary renders, so a
   * perfect 苦手のみ run has cleared every word it drilled — re-filtering
   * restarts into an empty queue and a 0 / 0 summary, at the moment the learner
   * did best.
   */
  test('restarts a perfect 苦手のみ session with the same words, not an empty queue', async ({
    page,
  }) => {
    await seed(page, { signedIn: true, entries: WORDS, weak: ['w-choukou'] });
    await page.goto('/practice/flashcards');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '開始する' }).click();

    await page.getByRole('button', { name: '裏を見る' }).click();
    await page.getByRole('button', { name: /わかった/ }).click();
    await expect(page.getByText('1 / 1')).toBeVisible();

    await page.getByRole('button', { name: 'もう一度' }).click();

    await expect(page.getByLabel('進捗')).toHaveText('1 / 1');
    await expect(page.getByRole('button', { name: /裏を見る/ })).toBeVisible();
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
  test('shows and can clear an older tag selected from the URL', async ({ page }) => {
    const entries = Array.from({ length: 11 }, (_, index) => ({
      ...WORDS[0],
      id: `tagged-${index}`,
      headword: `語${index}`,
      tags: [index === 0 ? '古いタグ' : `タグ${index}`],
      createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    }));
    await seed(page, { signedIn: true, entries });

    await page.goto('/practice/flashcards?tag=' + encodeURIComponent('古いタグ'));

    const selected = page.getByRole('button', { name: '#古いタグ' });
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1 件が対象')).toBeVisible();

    await selected.click();
    await expect(selected).toBeHidden();
    await expect(page.getByText('11 件が対象')).toBeVisible();
  });

  test('offers 苦手のみ against the words already recorded wrong', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, weak: ['w-choukou'] });
    await page.goto('/practice/flashcards');

    await expect(page.getByText('苦手な語のみ')).toContainText('1 語');
    await page.getByRole('checkbox').check();
    await expect(page.getByText('1 件が対象')).toBeVisible();

    await page.getByRole('button', { name: '開始する' }).click();
    await expect(page.getByText('兆候')).toBeVisible();
  });

  /**
   * The quick range is the one filter whose value the learner never types, so
   * it is the one where the control and the count can disagree without anyone
   * noticing. The clock is frozen at 2026-06-24 by `seed`, which is what makes
   * 「直近1週間」 a fixed window here rather than a moving one.
   */
  test('narrows to the last week from a single chip', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/practice/flashcards');
    await expect(page.getByText('3 件が対象')).toBeVisible();

    await page.getByRole('button', { name: '直近1週間' }).click();

    // 2026-06-17 onward: two words are in this week, ちょっと is from January.
    await expect(page.getByLabel('開始日')).toHaveValue('2026-06-17');
    await expect(page.getByText('2 件が対象')).toBeVisible();
  });

  test('filters on 品詞 and 語種', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/practice/flashcards');

    await page.getByLabel('品詞').selectOption('副詞');
    await expect(page.getByText('1 件が対象')).toBeVisible();

    await page.getByLabel('品詞').selectOption('');
    await page.getByLabel('語種').selectOption('漢語');
    await expect(page.getByText('1 件が対象')).toBeVisible();
  });

  /**
   * `weakIdsOf` counts progress rows and the drill counts entries. A word
   * answered wrong and then deleted keeps its row — nothing prunes the map —
   * so a count taken from the rows alone advertises words that cannot be
   * drilled, and ticking the toggle yields nothing.
   */
  test('counts only the weak words that still exist', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, weak: ['w-choukou', 'deleted-long-ago'] });
    await page.goto('/practice/flashcards');

    await expect(page.getByText('苦手な語のみ')).toContainText('1 語');
  });

  /**
   * The 単語集 row is absent whenever there are none, which is the design's
   * rule for a notebook that has not organised anything yet. The pair of cases
   * is what stops the row being quietly dropped altogether.
   */
  test('hides the 単語集 row when the learner has no sets', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/practice/flashcards');

    // Scoped to main: 単語集 is also a nav link, which is always there.
    await expect(page.getByRole('main').getByText('JLPTレベル')).toBeVisible();
    await expect(page.getByRole('main').getByText('単語集')).toBeHidden();
  });

  test('narrows the drill to the members of a 単語集', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: WORD_SETS });
    await page.goto('/practice/flashcards');
    await expect(page.getByText('3 件が対象')).toBeVisible();

    await page.getByRole('button', { name: /仕事セット/ }).click();
    await expect(page.getByText('2 件が対象')).toBeVisible();

    // And it composes with the other chips rather than replacing them.
    await page.getByRole('button', { name: 'N1' }).click();
    await expect(page.getByText('1 件が対象')).toBeVisible();
  });

  /** `:mode` is user-editable, and the app has exactly two modes. */
  test('sends an unknown mode back to the dashboard', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/practice/nonsense');
    await expect(page).toHaveURL('/');
  });
});

/**
 * The session summary, which is the one screen a long headword reaches only by
 * being answered wrong — and so the one no other spec here walks into.
 *
 * The missed list is a flex row of headword and definition, the same shape as
 * the dashboard's recent list and with the same defect in it: a flex item does
 * not shrink below its content unless told to, so one long headword turned a
 * 48px row into a 552px one and pushed もう一度 and 間違えた語だけ — the two controls
 * the summary exists to offer — several screens down.
 *
 * **The row is measured rather than the buttons, and that is a correction.**
 * The first version of this asserted the button's `boundingBox().y` against the
 * viewport height, which reads as the more direct statement of the harm and is
 * not a sound measurement: Playwright scrolls an element into view before
 * clicking it, so whatever scroll position the last card left behind carries
 * into the summary and shifts a viewport-relative y by however far the page had
 * moved. It failed at 1169 on one run and passed on the next with the defect
 * still in place. Row height is the thing that actually regresses and it does
 * not depend on where the page happens to be scrolled.
 */
test.describe('the summary of a session that went badly', () => {
  test('keeps a missed row one line high when the word is very long', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await seed(page, { signedIn: true, entries: [...WORDS, ...OVERSIZE_WORDS] });
    await page.goto('/practice/flashcards');
    await page.getByRole('button', { name: '開始する' }).click();

    // Every card wrong, so all five words land in the missed list.
    for (let i = 0; i < WORDS.length + OVERSIZE_WORDS.length; i += 1) {
      await page.getByRole('button', { name: '裏を見る' }).click();
      await page.getByRole('button', { name: 'もう一度' }).click();
    }
    await expect(page.getByRole('button', { name: '間違えた語だけ' })).toBeVisible();

    const rows = page.getByRole('list').getByRole('link');
    await expect(rows).toHaveCount(WORDS.length + OVERSIZE_WORDS.length);

    const heights = await rows.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().height),
    );
    // ~48px clamped; the two long entries measured 244 and 552 without it.
    expect(Math.max(...heights)).toBeLessThan(100);

    expect(
      await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      }),
    ).toBeLessThanOrEqual(1);
  });
});
