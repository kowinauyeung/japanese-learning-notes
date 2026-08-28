import { expect, test } from '@playwright/test';
import { seedSignedIn } from './fixtures';

/**
 * The phone's navigation, and the two claims the restructure has to keep true.
 *
 * The bar holds five slots for seven destinations, so 単語集 and 履歴 moved
 * behind 「その他」 and the two drills became one 練習 tab. Both are places a
 * reader can now fail to reach rather than merely take longer to find, which
 * is what these tests are for: a tab bar that quietly strands a screen is the
 * failure mode of every "we only have five slots" design.
 *
 * Chromium, at a phone width. There is nothing here about how anything is
 * painted — it is which URL a tap lands on, and both engines agree on that.
 */
test.describe('the bottom navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('reaches 単語集 and 履歴, which the bar has no slot for', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/');

    const bar = page.getByRole('navigation', { name: 'メニュー' });
    await bar.getByRole('button', { name: 'その他' }).click();
    await page.getByRole('dialog', { name: 'その他' }).getByText('単語集').click();

    // The URL and what it drew. A route that changes while its screen fails to
    // render is a reader looking at an error where they asked for their sets,
    // and the address bar would say the trip worked.
    await expect(page).toHaveURL(/\/wordsets$/);
    await expect(page.getByRole('heading', { name: '単語集', level: 1 })).toBeVisible();

    await bar.getByRole('button', { name: 'その他' }).click();
    await page.getByRole('dialog', { name: 'その他' }).getByText('履歴').click();

    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole('heading', { name: '履歴', level: 1 })).toBeVisible();
  });

  /**
   * The tab lights up on the four screens 「その他」 leads to, so the reader can
   * see where they are — and they arrived there by closing the sheet.
   *
   * The state a reader cannot see must therefore not follow the one they can:
   * announcing an open dialog on 単語集, 履歴, アカウント and 設定 tells a
   * screen reader there is something on screen to escape from, on four of the
   * app's seven destinations.
   */
  test('does not announce the sheet as open on the screens it leads to', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/wordsets');

    const more = page
      .getByRole('navigation', { name: 'メニュー' })
      .getByRole('button', { name: 'その他' });

    await expect(more).toHaveAttribute('aria-expanded', 'false');

    await more.click();
    await expect(page.getByRole('dialog', { name: 'その他' })).toBeVisible();
  });

  /**
   * The drill switch is the only way to reach 書き取り練習 on a phone: the bar
   * has one 練習 tab and it points at the flashcards.
   *
   * The filters are the assertion rather than the route, because carrying them
   * is the part that can break silently. `Practice` keys its state on the mode,
   * so switching remounts the screen and anything not put into the URL is
   * gone — a learner who had narrowed to 直近1週間 would be handed the whole
   * notebook back, with the count on screen to say so and nothing to say why.
   */
  test('keeps the filters when the drill changes', async ({ page }) => {
    await seedSignedIn(page);
    await page.goto('/');

    await page
      .getByRole('navigation', { name: 'メニュー' })
      .getByRole('link', { name: '練習' })
      .click();
    await expect(page).toHaveURL(/\/practice\/flashcards$/);

    await page.getByRole('button', { name: '直近1週間' }).click();
    await expect(page.getByText('2 件が対象')).toBeVisible();

    /*
     * Read rather than written down. What the week runs from is
     * `quickRangeStart`'s answer, covered exactly in `tests/unit/practice.test.ts`
     * and asserted against a frozen clock in `practice.spec.ts`; repeating the
     * date here would make this test go red for a change in date arithmetic it
     * is not about. The claim is only that the value survives the switch.
     */
    const chosen = await page.getByLabel('開始日').inputValue();
    expect(chosen).not.toBe('');

    await page.getByRole('tab', { name: '書き取り練習' }).click();

    // The route, not the query string: how the filters travel is this
    // screen's business, and asserting the `?` would fail on the mechanism
    // before reaching the assertions below that a learner would notice.
    await expect(page).toHaveURL(/\/practice\/dictation/);
    // A switch that navigates but leaves the flashcard tab selected tells the
    // learner they are still drilling the thing they just moved away from —
    // and tells a screen reader so in as many words.
    await expect(page.getByRole('tab', { name: '書き取り練習' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('開始日')).toHaveValue(chosen);
    await expect(page.getByText('2 件が対象')).toBeVisible();
  });
});
