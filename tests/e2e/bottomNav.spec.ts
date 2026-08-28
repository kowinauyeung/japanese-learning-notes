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
    await expect(page).toHaveURL(/\/wordsets$/);

    await bar.getByRole('button', { name: 'その他' }).click();
    await page.getByRole('dialog', { name: 'その他' }).getByText('履歴').click();
    await expect(page).toHaveURL(/\/history$/);
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

    // 2026-06-17 onward, measured from the clock `seed` freezes: two of the
    // three seeded words are inside it.
    await page.getByRole('button', { name: '直近1週間' }).click();
    await expect(page.getByText('2 件が対象')).toBeVisible();

    await page.getByRole('tab', { name: '書き取り練習' }).click();

    // The route, not the query string: how the filters travel is this
    // screen's business, and asserting the `?` would fail on the mechanism
    // before reaching the two assertions below that a learner would notice.
    await expect(page).toHaveURL(/\/practice\/dictation/);
    await expect(page.getByRole('tab', { name: '書き取り練習' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('開始日')).toHaveValue('2026-06-17');
    await expect(page.getByText('2 件が対象')).toBeVisible();
  });
});
