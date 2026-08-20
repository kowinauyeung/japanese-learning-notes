import { expect, test } from '@playwright/test';
import { OVERSIZE_WORDS, seed, seedSignedIn, WORDS } from './fixtures';

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

  test('the login screen', async ({ page }) => {
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
  test('the contribution heatmap', async ({ page }) => {
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
  test('the contribution heatmap on a phone', async ({ page }) => {
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
  test('the dashboard', async ({ page }) => {
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
  test('a headword too long for its card is clipped, not spilled', async ({ page }) => {
    await seed(page, { signedIn: true, entries: [...WORDS, ...OVERSIZE_WORDS] });
    await page.goto('/vocabulary');

    const cards = page.locator('a[href^="/vocabulary/"]');
    await expect(cards.first()).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('long-entry-cards.png');
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
  test('a long headword keeps the dashboard row on one line at 375', async ({ page }) => {
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

  for (const { name, path } of [
    { name: 'the dashboard', path: '/' },
    { name: 'the vocabulary grid', path: '/vocabulary' },
  ]) {
    for (const width of [375, 1280]) {
      test(`${name} does not scroll sideways at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await seed(page, { signedIn: true, entries: [...WORDS, ...OVERSIZE_WORDS] });
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();

        expect(await overflow(page)).toBeLessThanOrEqual(1);
      });
    }
  }

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
