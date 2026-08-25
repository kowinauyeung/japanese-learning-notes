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

/**
 * `refresh()` used to clear the old error the instant a retry started, before
 * the new read had landed — harmless against the in-memory adapter's usual
 * same-tick resolution, but against a retry that actually takes time it left
 * a gap rendered as `entries === []`: 「条件に合う単語がありません」, which
 * reads as "your notebook is empty" rather than "still loading". `waitForTimeout`
 * is a deliberate mid-flight snapshot against a delay this seed controls, not
 * a wait on real timing the suite does not own.
 */
test('keeps the old message on screen while a slow retry is in flight, not an empty result', async ({
  page,
  context,
}) => {
  await seed(page, { entries: WORDS, failWhileOffline: ['entries'], entriesReadDelayMs: 600 });
  await page.goto('/vocabulary');
  await expect(page).toHaveURL(/\/login$/);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Google でログイン' }).click();
  await expect(page).toHaveURL(/\/vocabulary$/);
  await expect(page.getByText(UNREACHABLE)).toBeVisible();

  await context.setOffline(false);
  await page.waitForTimeout(300);

  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  await expect(page.getByText('条件に合う単語がありません')).toBeHidden();

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

/**
 * `error` carries a failed `save` as well as a failed read — `save()` and
 * `refresh()` are the same state — so a reconnect after a save failure must
 * not trigger a retry: `refresh()` would re-read the profile the transaction
 * never actually wrote, clear the save error, and tell the reader nothing is
 * wrong with an edit that was never committed.
 */
test('a reconnect after a failed save does not silently clear the save error', async ({
  page,
  context,
}) => {
  await seed(page, {
    signedIn: true,
    profile: { nickname: 'Before', language: 'ja', translationLanguage: 'en' },
    settingsSave: 'unreachable',
  });
  await page.goto('/settings');

  await page.getByLabel('ニックネーム').fill('After');
  await page.getByRole('button', { name: '設定を保存' }).click();

  const SAVE_UNREACHABLE =
    '接続できないため保存できませんでした。しばらくしてからもう一度お試しください。';
  await expect(page.getByText(SAVE_UNREACHABLE)).toBeVisible();

  // A connection blip, not a real reconnect from a failed read — this is
  // exactly the transition `useRetryOnReconnect` fires a retry on, and the
  // claim is that it must not fire one here. Waiting for `OfflineNotice` in
  // between the two matters: back-to-back `setOffline` calls with nothing
  // awaited between them can both dispatch before React ever renders the
  // intermediate offline state, and a transition `useOnline` never rendered
  // is a transition `useRetryOnReconnect` never sees either.
  await context.setOffline(true);
  await expect(page.getByText('オフライン')).toBeVisible();
  await context.setOffline(false);

  await expect(page.getByText(SAVE_UNREACHABLE)).toBeVisible();
});
