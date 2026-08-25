import { expect, test } from '@playwright/test';
import { seed, WORD_SETS, WORDS } from './fixtures';

/**
 * #84: a read that failed because the network was down used to stay failed
 * until the reader reloaded — every provider loads once from an effect keyed
 * on its repository, and nothing re-read when the connection came back.
 *
 * Each case below signs in while offline, so the provider's one-shot mount
 * read is the one that fails, then restores the connection and asserts the
 * screen fills in place — no `page.reload()` anywhere in this file, because a
 * reload passing is exactly the failure mode this issue is about; the claim is
 * that nothing has to leave and come back.
 *
 * Signing in rather than `page.goto`-while-offline reaches the same failure
 * without fighting Playwright's offline emulation: `context.setOffline(true)`
 * blocks every request the browser makes, including the one `page.goto` needs
 * to fetch the app itself, so offline has to be set only after the app (and
 * its login screen) has already loaded — `tests/e2e/notices.spec.ts` relies on
 * the same ordering. `authPort.signIn()` is a synchronous in-memory update in
 * the e2e substitute, so it still succeeds offline and remounts every
 * provider, which is the one moment their mount effect runs.
 *
 * End-to-end because the layer under test is the wiring shared by all four
 * providers: `useRetryOnReconnect` reacting to a real `online` event and
 * calling the repository again. The branch it depends on —
 * `isUnreachable`/`loadErrorMessage` — is `tests/unit/loadError.test.ts`.
 */

const UNREACHABLE = '接続できないため読み込めませんでした。保存済みの単語はそのまま読めます。';

test('re-reads the notebook once the connection returns, with no reload', async ({
  page,
  context,
}) => {
  await seed(page, { entries: WORDS, failWhileOffline: ['entries'] });
  await page.goto('/vocabulary');
  await expect(page).toHaveURL(/\/login$/);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Google でログイン' }).click();
  await expect(page).toHaveURL(/\/vocabulary$/);

  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  await expect(page.getByText('3 語')).toBeHidden();

  await context.setOffline(false);

  await expect(page.getByText(UNREACHABLE)).toBeHidden();
  await expect(page.getByText('3 語')).toBeVisible();
});

test('re-reads 単語集 once the connection returns, with no reload', async ({ page, context }) => {
  await seed(page, { entries: WORDS, wordSets: WORD_SETS, failWhileOffline: ['wordSets'] });
  await page.goto('/wordsets');
  await expect(page).toHaveURL(/\/login$/);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Google でログイン' }).click();
  await expect(page).toHaveURL(/\/wordsets$/);

  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  await expect(page.getByRole('link', { name: /仕事セット/ })).toBeHidden();

  await context.setOffline(false);

  await expect(page.getByText(UNREACHABLE)).toBeHidden();
  await expect(page.getByRole('link', { name: /仕事セット/ })).toBeVisible();
});

/**
 * #24 gave 苦手のみ its own message for a denial or an unreachable read, but
 * left the row disabled until the next reload either way. This is the other
 * half: once progress actually comes back, the row has to notice on its own.
 */
test('re-enables 苦手のみ once the connection returns, with no reload', async ({
  page,
  context,
}) => {
  await seed(page, { entries: WORDS, weak: ['w-choukou'], failWhileOffline: ['progress'] });
  await page.goto('/practice/flashcards');
  await expect(page).toHaveURL(/\/login$/);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Google でログイン' }).click();
  await expect(page).toHaveURL(/\/practice\/flashcards$/);

  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  await expect(page.getByRole('checkbox')).toBeDisabled();

  await context.setOffline(false);

  await expect(page.getByText(UNREACHABLE)).toBeHidden();
  await expect(page.getByText('苦手な語のみ')).toContainText('1 語');
  await expect(page.getByRole('checkbox')).toBeEnabled();
});

/**
 * The profile field itself is not the thing to assert on retry: `SettingsForm`
 * seeds its editable `draft` from `profile` once, on mount, on purpose — a
 * background refresh overwriting what the reader is mid-typing would be its
 * own defect — so the input never reflects a later `storedProfile` update
 * without a remount, retried or not. `data-theme` is driven by the same
 * `storedProfile` directly, outside that frozen draft, which is what makes it
 * the honest thing to check here.
 */
test('re-reads the profile once the connection returns, with no reload', async ({
  page,
  context,
}) => {
  await seed(page, {
    profile: { nickname: 'Kowin', language: 'ja', translationLanguage: 'en', theme: 'dark' },
    failWhileOffline: ['settings'],
  });
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Google でログイン' }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  // The failed read never reached the stored 'dark' — this is the default the
  // profile falls back to.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');

  await context.setOffline(false);

  await expect(page.getByText(UNREACHABLE)).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
