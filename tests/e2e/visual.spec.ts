import { expect, test } from '@playwright/test';
import { OVERSIZE_SET, OVERSIZE_WORDS, seed, seedSignedIn, WORDS } from './fixtures';

/**
 * Visual regression — a small set of baselines, deliberately.
 *
 * These exist for one class of defect that every other layer in this repo is
 * structurally blind to: **the markup is correct and the rendering is not.**
 * The case that shipped was `<ruby>` receiving a layout class, which drops the
 * element out of its ruby formatting context so the browser lays `<rt>` out
 * beside the word instead of above it. The DOM is identical either way, so
 * neither TypeScript, nor tests/component/Ruby.test.tsx, nor a serialised DOM
 * snapshot can see it. Only a real browser with real CSS can.
 *
 * The set is kept small on purpose. A screenshot suite that fails often gets
 * ignored, and an ignored gate is worse than no gate. A handful of images over
 * the places where layout carries meaning — furigana, the pitch line, the
 * heatmap grid at both widths, the two page shells — is a set whose red light
 * is worth reading.
 *
 * Baselines are generated on Linux (`yarn test:visual:update`), because macOS
 * and Linux hint Japanese glyphs differently and a laptop-authored baseline
 * fails on every CI run for reasons unrelated to the change.
 *
 * If one of these fails, the diff is a bug report. Regenerating the baseline is
 * how a real regression gets committed — see the testing section of CLAUDE.md.
 */

test.describe('visual', () => {
  /**
   * Only the committed platform. Elsewhere Playwright would find no baseline
   * for `{platform}`, write the current rendering as one, and fail — which
   * looks like a broken test and invites committing a macOS baseline that then
   * fails on every CI run. Skipping says what to do instead.
   */
  test.skip(
    process.platform !== 'linux',
    'Baselines are generated on Linux. Run `yarn test:visual:update`.',
  );

  /**
   * Chromium alone for the shots that are not about ruby.
   *
   * WebKit is here for one class of difference, and every extra baseline is a
   * file somebody has to regenerate and read. A page shell, a heatmap grid and
   * a card layout render the same in both up to antialiasing — which is exactly
   * what a second baseline would spend its life reporting.
   */
  const notRuby = 'Chromium covers this; WebKit is here for the ruby cases.';

  test('the login screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', notRuby);
    await seed(page, {});
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();

    await expect(page).toHaveScreenshot('login.png');
  });

  /**
   * The furigana one. 切り分け has two kanji runs with okurigana between them,
   * so it renders two separate `<ruby>` elements with plain text in between —
   * every part of the arrangement the class-placement bug disturbs.
   */
  test('furigana sits above the word it reads', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/vocabulary/w-kiriwake');

    const heading = page.locator('.has-ruby').first();
    await expect(heading).toBeVisible();
    await expect(heading).toHaveScreenshot('furigana-heading.png');
  });

  /**
   * The clamped headword, shot in **both** engines. This is the one the second
   * project exists for.
   *
   * `line-clamp-1` was used here first and shipped a bug that no test, no
   * baseline and no local check could see: it compiles to `display:
   * -webkit-box`, and iOS Safari lays a `<ruby>` out inside one by painting the
   * annotation and dropping the base — so every headword on the dashboard
   * rendered as bare furigana with the kanji simply absent. Chromium renders
   * the same declaration correctly, and Chromium is all this suite had.
   *
   * `truncate` replaces it: `overflow` and `white-space` clip a line without
   * touching `display`, so nothing goes near the ruby formatting context. What
   * this shot has to show, in each engine, is both halves at once — the reading
   * sitting above its kanji, *and* the kanji still there.
   *
   * Playwright's WebKit does not reproduce the original defect, which is worth
   * knowing before trusting this: it is a WebKit build, not iOS Safari. So this
   * baseline documents the correct rendering rather than having been proved to
   * go red on the bug — the assertion that *was* proved red is the
   * `-webkit-box` guard below, which is about the cause instead of the symptom.
   */
  test('the reading sits above a headword that is clamped to one line', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, { signedIn: true, entries: [...WORDS, ...OVERSIZE_WORDS] });
    // The vocabulary grid and not the dashboard, which carries the same clamp:
    // the heatmap scrolls itself to today on mount, and `toHaveScreenshot`
    // waits for the element to stop moving before it shoots. In WebKit that
    // wait never ends, so the shot times out rather than failing on pixels.
    await page.goto('/vocabulary');

    const headword = page.locator('.has-ruby').first();
    await expect(headword).toBeVisible();
    await expect(headword).toHaveScreenshot('clamped-headword.png');
  });

  /**
   * The pitch line, for the same reason as the furigana above and no other.
   *
   * Everything else about the accent is covered without pixels: the mora
   * arithmetic in tests/unit/mora.test.ts, which border lands on which mora in
   * tests/component/PitchAccent.test.tsx, and the whole round trip end to end
   * in vocabulary.spec.ts. **None of them can see whether the line is drawn.**
   * It is a border on each mora span, so a zero width, a transparent colour, or
   * a later rule resetting `border` leaves every one of those assertions green
   * and the notation invisible.
   *
   * 兆候 is 0（平板）: ちょうこう is four mora, the first low and the rest high,
   * with no fall anywhere in the word. The baseline therefore shows an overline
   * beginning after ちょ and running unbroken to the end, with no downward tick
   * — which is also what distinguishes 平板 from 尾高, the one distinction the
   * notation exists to carry.
   */
  test('the pitch line sits above the mora it marks', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/vocabulary/w-choukou');

    const accent = page.locator('.has-accent').first();
    await expect(accent).toBeVisible();
    await expect(accent).toHaveScreenshot('pitch-accent.png');
  });

  /**
   * The heatmap is a CSS grid whose whole content is position and colour: a
   * broken column count or a shifted week boundary says something false about
   * when the learner studied, and reads as ordinary output while doing it.
   * Frozen clock and fixed data come from fixtures.ts.
   */
  test('the contribution heatmap', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', notRuby);
    await seedSignedIn(page);
    await page.goto('/');

    const heatmap = page.locator('section').filter({ hasText: '6月' }).first();
    await expect(heatmap).toBeVisible();
    await expect(heatmap).toHaveScreenshot('heatmap.png');
  });

  /**
   * The same grid at 375, the width where the year stops fitting. Everything
   * above is shot at the 1280 in playwright.config.ts, where fifty-three
   * columns sit inside the card with room to spare — so no committed baseline
   * has ever seen the heatmap in the state a phone renders it in.
   *
   * tests/e2e/dashboard.spec.ts measures the scroll offset and is the test that
   * would catch the scroller opening on last summer again. This one is about
   * what surrounds that offset and only a browser can report: the weekday
   * column staying outside the scroller instead of being carried off with the
   * year, the cells keeping their size rather than being squeezed by `flex-1`,
   * and the legend still sitting under a card half the width the shot above
   * assumes. A wrong answer to any of those is a heatmap that reads as normal
   * output while saying something false about when the learner studied.
   */
  test('the contribution heatmap on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', notRuby);
    await page.setViewportSize({ width: 375, height: 667 });
    await seedSignedIn(page);
    await page.goto('/');

    const heatmap = page.locator('section').filter({ hasText: '6月' }).first();
    await expect(heatmap).toBeVisible();
    await expect(heatmap).toHaveScreenshot('heatmap-mobile.png');
  });

  /**
   * One full page, for the shell the other three sit inside: header, navigation
   * and the card grid. Scoped to a signed-in dashboard with fixed data so the
   * only thing that can move it is a change to the layout itself.
   *
   * This one also catches the `<ruby>` class defect, because `TodayWord` passes
   * `block` too — but it reports it as 3px of page height, against 73px becoming
   * 89px in the targeted shot above. Both go red; 16px inside a 244px crop is
   * legible and 3px off a 1280x1135 page is a puzzle. That is the case for
   * keeping small, targeted baselines even where a full-page one overlaps them.
   *
   * Worth knowing before reading that diff: under the real defect the targeted
   * shot fails for two reasons at once. The annotation moves, and `.has-ruby`
   * travels onto `<ruby>` with the rest of the class, so the locator resolves to
   * the first `<ruby>` and the crop narrows from 切り分け to 切 alone. It fails
   * either way, which is what the gate is for, but the diff is not purely a
   * story about placement.
   */
  test('the dashboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', notRuby);
    await seedSignedIn(page);
    await page.goto('/');
    await expect(page.getByText('今週学んだ語')).toBeVisible();

    await expect(page).toHaveScreenshot('dashboard.png', { fullPage: true });
  });

  /**
   * A note long enough to break the layout, shot where it broke it.
   *
   * The defect: an unbroken run of Latin characters has no break opportunity,
   * so before `overflow-wrap: anywhere` it set the width of its card, the card
   * set the width of the grid, and the grid set the scroll width of the
   * document. On a phone the browser answers a document wider than the viewport
   * by zooming out to fit it — so the symptom was the *whole page* rendering as
   * a narrow column against a field of white, with nothing at all wrong at the
   * place the diff would point to.
   *
   * The measurement in the describe below is what proves the overflow is gone,
   * and it is the assertion that would catch a regression. This shot is here for
   * what a measurement cannot see: whether the ellipsis lands, whether the JLPT
   * pill is still inside the card, and — the reason a Japanese app cannot use a
   * plain `truncate` here without checking — whether clipping the headword to
   * one line clips the furigana off the top of it, since the annotation is drawn
   * above the base text inside the same line box.
   */
  test('a headword too long for its card is clipped, not spilled', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', notRuby);
    await seed(page, { signedIn: true, entries: [...WORDS, ...OVERSIZE_WORDS] });
    await page.goto('/vocabulary');

    const cards = page.locator('a[href^="/vocabulary/"]');
    await expect(cards.first()).toBeVisible();
    // `main > div`, not `main`. `<main>` is now the full-bleed box that carries
    // the device's side insets so its background still reaches the screen edge,
    // and the column with the gutter and the `max-w-5xl` measure is its child.
    // Shooting `<main>` captures the viewport's full 1280px and 256px of page
    // background either side of the grid — which is not what this baseline is
    // of, and would have quietly widened every future comparison.
    await expect(page.locator('main > div')).toHaveScreenshot('long-entry-cards.png');
  });

  /**
   * The same note on the dashboard list, which fails differently: the row is
   * flex, and a flex item will not shrink below its content unless it is told
   * to, so the headword pushed the definition and the date out of the row
   * rather than wrapping inside it.
   *
   * At 375 because that is the width the screenshots in the bug report were
   * taken at, and the width where a row that will not shrink has least room to
   * hide.
   */
  test('a long headword keeps the dashboard row on one line at 375', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', notRuby);
    await page.setViewportSize({ width: 375, height: 667 });
    await seed(page, { signedIn: true, entries: [...WORDS, ...OVERSIZE_WORDS] });
    await page.goto('/');

    const recent = page.locator('section').filter({ hasText: '最近追加した語' }).first();
    await expect(recent).toBeVisible();
    await expect(recent).toHaveScreenshot('long-entry-rows.png');
  });
});

test.describe('visual — the empty notebook', () => {
  /**
   * Not a screenshot. The empty state drops the word-of-the-day card and
   * collapses the hero row to one full-width column, which is a layout branch
   * a populated screenshot never reaches — but it is also the one branch cheap
   * enough to assert on directly.
   */
  test('collapses the hero row to a single column with no words', async ({ page }) => {
    await seed(page, { signedIn: true, entries: [] });
    await page.goto('/');

    await expect(page.getByText('今日の単語')).toBeHidden();
    await expect(page.getByText('JLPTレベル（全 0 語）')).toBeVisible();
  });
});

/**
 * The overflow itself, measured rather than photographed.
 *
 * This is the assertion that actually states the property — "no long value makes
 * the document wider than the viewport" — and unlike the screenshots above it
 * runs on every platform, needs no committed baseline, and cannot be made to
 * pass by regenerating anything. The images say the clipping *looks* right; this
 * says the page does not scroll sideways.
 *
 * `scrollWidth` on the documentElement and not on the card, because the bug is
 * not local to the element holding the long word: the visible symptom was a
 * dashboard zoomed out to a narrow column, and the cause was one row several
 * sections away. Anything that widens the document is caught here wherever it
 * lives.
 *
 * One pixel of tolerance because a scrollbar or a sub-pixel layout rounding can
 * put `scrollWidth` a fraction above `clientWidth` on a page that does not
 * scroll; the defect being guarded against was hundreds of pixels wide.
 */
test.describe('long values must not widen the page', () => {
  const overflow = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });

  /*
    Every screen a long value can reach, because the first pass fixed the two
    that were reported and left four that were not. The word set detail page in
    particular was 6,115 pixels wide at a 1,280 viewport: `min-width: auto` is
    the default for a grid item *and* for a flex item, so the picker and member
    panels each refused to go below their content, and the one row holding a long
    headword carried the whole page with it. A per-screen loop is what stops the
    next one being found in a screenshot instead.
  */
  for (const { name, path, prepare } of [
    { name: 'the dashboard', path: '/' },
    { name: 'the vocabulary grid', path: '/vocabulary' },
    { name: 'the word set list', path: '/wordsets' },
    { name: 'the word set detail page', path: '/wordsets/set-oversize' },
    {
      // The 6,115-pixel case was the picker and member panels, and both are
      // behind 編集 now — reached without it this row measures the card grid
      // and the panels it exists for are never laid out at all.
      name: 'the word set editor',
      path: '/wordsets/set-oversize',
      prepare: async (page: import('@playwright/test').Page) => {
        await page.getByRole('button', { name: '編集', exact: true }).click();
        // The measurement below is the test; this is what makes it measure
        // anything. `overflow()` reads `documentElement.scrollWidth` the moment
        // it is called, so a click that has not yet laid the panels out is
        // measured as the card grid — a green result reported for a screen the
        // long headword never reached.
        await expect(page.locator('[data-drop-list="members"]')).toBeVisible();
      },
    },
    { name: 'the flashcard setup', path: '/practice/flashcards' },
    { name: 'the dictation setup', path: '/practice/dictation' },
  ] as {
    name: string;
    path: string;
    prepare?: (page: import('@playwright/test').Page) => Promise<void>;
  }[]) {
    for (const width of [375, 1280]) {
      test(`${name} does not scroll sideways at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await seed(page, {
          signedIn: true,
          entries: [...WORDS, ...OVERSIZE_WORDS],
          wordSets: OVERSIZE_SET,
        });
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        await prepare?.(page);

        expect(await overflow(page)).toBeLessThanOrEqual(1);
      });
    }
  }

  /*
    Height, which the overflow measurement above is blind to and which is how
    three of the four missed cases actually presented.

    Nothing here overflowed once `overflow-wrap: anywhere` landed — the long
    value wrapped instead, and then grew its container downwards: a word set
    card eight lines tall setting the height of every card in its row, and a
    filter chip six lines tall that stopped reading as a control.

    One assertion per test rather than both in one, because the first failure
    ends the test: with the two together a card at 872px hid whether the chip
    was still 152px, and a red proof that cannot see its second case is not a
    proof of it.

    The bounds are generous on purpose. This guards against a clamp being
    removed, not against a particular pixel — a card is ~112px and fails at 200.
  */
  test('a long word set name does not decide the height of its whole row', async ({ page }) => {
    await seed(page, { signedIn: true, entries: WORDS, wordSets: OVERSIZE_SET });
    await page.goto('/wordsets');

    const card = page.locator('a[href="/wordsets/set-oversize"]');
    await expect(card).toBeVisible();
    expect((await card.boundingBox())?.height ?? 0).toBeLessThan(200);
  });

  test('a long word set name keeps its filter chip the shape of a control', async ({ page }) => {
    await seed(page, {
      signedIn: true,
      entries: [...WORDS, ...OVERSIZE_WORDS],
      wordSets: OVERSIZE_SET,
    });
    await page.goto('/practice/dictation');

    const chip = page.getByRole('button', { name: /W{20,}/ }).first();
    await expect(chip).toBeVisible();
    expect((await chip.boundingBox())?.height ?? 0).toBeLessThan(48);
  });

  /**
   * The word-set description, which overflows downward rather than sideways.
   *
   * An essay in that field pushed the member list off the screen with nothing
   * on the page to say it was still down there, so the set read as empty. Ten
   * lines, then a control to open the rest.
   */
  test('a very long word set description collapses behind a control', async ({ page }) => {
    await seed(page, {
      signedIn: true,
      entries: WORDS,
      wordSets: [
        {
          id: 'set-wordy',
          name: '長い説明のセット',
          description: 'この単語集の説明はとても長い。'.repeat(80),
          entryIds: ['w-kiriwake'],
        },
      ],
    });
    await page.goto('/wordsets/set-wordy');

    const description = page.getByText('この単語集の説明はとても長い。').first();
    await expect(description).toBeVisible();

    // Collapsed: the member list is what has to stay reachable, and the whole
    // point of the clamp is that it is on screen without scrolling past an essay.
    const collapsed = await description.evaluate((el) => el.clientHeight);
    await page.getByRole('button', { name: 'もっと見る' }).click();
    const expanded = await description.evaluate((el) => el.clientHeight);

    expect(expanded).toBeGreaterThan(collapsed);
    await expect(page.getByRole('button', { name: '折りたたむ' })).toBeVisible();
  });
});

/**
 * The cause rather than the symptom, and the only assertion here that could be
 * proved red against the defect it exists for.
 *
 * A `<ruby>` inside a `display: -webkit-box` loses its base text on iOS Safari:
 * the annotation paints and the kanji does not. `line-clamp` compiles to
 * exactly that, so clamping a headword to one line — which looks like a pure
 * layout decision — silently deletes the word from the screen on the device
 * most of this app is read on.
 *
 * Reading `display` off the element is the whole check, and it looks like an
 * implementation detail until you know what it stands for: `-webkit-box` there
 * *is* the bug, and there is no rendered-output assertion that can see it,
 * because Playwright's WebKit renders the case correctly and only the real
 * device does not.
 *
 * **Only the WebKit run can fail it, and that is the point.** Given the same
 * `line-clamp` declaration Chromium computes `display: flow-root` and WebKit
 * computes `-webkit-box` — measured, both engines, on the reverted code. So the
 * Chromium copy of this test is green whether the bug is present or not, and
 * the second project is not redundancy here but the entire mechanism.
 *
 * It takes no screenshot, so unlike the baselines above it also runs on a
 * laptop — where those are skipped and this is the only thing standing between
 * a clamp and another iPhone-only regression.
 */
test.describe('a ruby wrapper may never be laid out as a -webkit-box', () => {
  for (const { name, path } of [
    { name: 'the dashboard', path: '/' },
    { name: 'the vocabulary grid', path: '/vocabulary' },
  ]) {
    test(`${name} keeps every headword in normal flow`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await seed(page, { signedIn: true, entries: [...WORDS, ...OVERSIZE_WORDS] });
      await page.goto(path);
      await expect(page.locator('.has-ruby').first()).toBeVisible();

      const displays = await page
        .locator('.has-ruby')
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).display));

      expect(displays.length).toBeGreaterThan(0);
      expect(displays).not.toContain('-webkit-box');
    });
  }
});

/**
 * Every control on a screen is the same box, measured rather than shot.
 *
 * The controls were declared with `min-h-*`, and a native widget treats that
 * as a floor it may exceed — or, in WebKit, as nothing at all. Measured on the
 * reverted code, on the practice setup at 390px with a coarse pointer: the two
 * dropdowns came back **25px** tall and the two date fields beside them 36px,
 * against a `min-h-9` that asked for 36 from all four. So the row stepped, and
 * the halves of it that stepped were the halves the reader touches.
 *
 * **The Chromium copy of this test cannot see that.** On the same reverted
 * code Chromium reports 36, 36, 36, 36 — every control at the floor, the row
 * aligned, the bug invisible. It fails here only on the height being 36 rather
 * than the 44 a touch target has to be. As with the `line-clamp` case above,
 * the second engine is the mechanism and not redundancy.
 *
 * `isMobile` and `hasTouch` are what make the measurement the phone's one: the
 * coarse-pointer rule in `index.css` raises control text to 16px to stop iOS
 * zooming the page, which is what grows each widget past its declared floor by
 * its own different amount. Without them this measures a laptop.
 *
 * A measurement and not a baseline, for the reason the WebKit project exists:
 * a screenshot here would compare against — and `--update-snapshots` would
 * overwrite — the Chromium PNG beside it. `boundingBox()` is browser
 * independent, so the same claim can be made in both engines.
 */
test.describe('one control shape', () => {
  test.use({ isMobile: true, hasTouch: true });
  const CONTROL_HEIGHT = 44;

  test('a dropdown and a date field are the same box', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSignedIn(page);
    await page.goto('/practice/flashcards');
    await expect(page.getByLabel('品詞')).toBeVisible();

    const boxes = await Promise.all(
      ['品詞', '語種', '開始日', '終了日'].map((label) => page.getByLabel(label).boundingBox()),
    );

    expect(boxes.map((box) => box?.height)).toEqual([
      CONTROL_HEIGHT,
      CONTROL_HEIGHT,
      CONTROL_HEIGHT,
      CONTROL_HEIGHT,
    ]);
    // Stacked in one column at this width, so a widget refusing to shrink to
    // its track shows up as a width that is not the width of the others.
    expect(new Set(boxes.map((box) => box?.width)).size).toBe(1);
  });
});
