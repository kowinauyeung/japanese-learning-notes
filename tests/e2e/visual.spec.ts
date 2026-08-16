import { expect, test } from '@playwright/test';
import { seed, seedSignedIn } from './fixtures';

/**
 * Visual regression — four baselines, deliberately.
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
 * ignored, and an ignored gate is worse than no gate. Four images over the
 * places where layout carries meaning — furigana, the heatmap grid, the two
 * page shells — is a set whose red light is worth reading.
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
