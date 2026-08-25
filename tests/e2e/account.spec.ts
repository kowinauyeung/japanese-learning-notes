import { expect, test } from '@playwright/test';
import { seed } from './fixtures';

/**
 * #23: `Account.tsx` collapsed every export failure to the generic
 * 「エクスポートできませんでした」, including a denial — the one case a
 * dedicated sentence exists for, because retrying it never clears it.
 * (Historically the branch rendered the SDK's own rejection message
 * unchanged, in English; that was already fixed upstream of this PR, so the
 * regression this test catches is the missing denial branch, not the SDK
 * string. The SDK-string assertion below stays as a guard against that
 * earlier shape recurring.) `loadErrorMessage` is the seam #22 built for the
 * distinction.
 *
 * End-to-end because the layer under test is the wiring: `entryRepositoryFor`
 * (`src/lib/backend.e2e.ts`) rejecting the export walk's first read with
 * Firestore's own `permission-denied`, `exportEverything` propagating it
 * unchanged, and the route choosing what to render. The branch itself is
 * `tests/unit/loadError.test.ts`.
 */
test('shows the access-denied message on a denied export, not the generic one', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await seed(page, { signedIn: true, accountExport: 'denied' });
  await page.goto('/account');

  await page.getByRole('button', { name: 'データをエクスポート' }).click();

  await expect(
    page.getByText(
      'アクセスが許可されていません。一度サインアウトして、サインインし直してください。',
    ),
  ).toBeVisible();
  // Guards against the message this branch used to render, unchanged.
  await expect(page.getByText('Missing or insufficient permissions.')).toBeHidden();
  // Nor the generic wording, which would mean the denial branch was never
  // reached at all — this is the half that actually fails without the fix.
  await expect(page.getByText('エクスポートできませんでした。', { exact: true })).toBeHidden();
  expect(pageErrors).toEqual([]);
});

/**
 * #23's third criterion: saving, exporting and deleting are not the same
 * sentence. `load.unreachableSave` already existed for `userSettings`'s save,
 * and reusing it here would tell a reader their export was not *saved* — the
 * wrong operation. This pins the export-specific fallback that exists instead.
 */
test('says the export was not reachable, not that a save failed', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await seed(page, { signedIn: true, accountExport: 'unreachable' });
  await page.goto('/account');

  await page.getByRole('button', { name: 'データをエクスポート' }).click();

  await expect(page.getByText('接続できないためエクスポートできませんでした。')).toBeVisible();
  // The half that fails without the export-specific fallback: both sentences
  // begin identically, so asserting only the one above passes on a substring
  // of the save wording.
  await expect(page.getByText('接続できないため保存できませんでした。')).toBeHidden();
  expect(pageErrors).toEqual([]);
});
