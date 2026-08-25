import { expect, test } from '@playwright/test';
import { seed } from './fixtures';

/**
 * #23: `Account.tsx` used to render whatever string the SDK's rejection
 * carried straight to the page — `Missing or insufficient permissions.`, in
 * English, describing an internal condition in the vocabulary of the library
 * rather than of the product. `loadErrorMessage` is the seam #22 built for
 * exactly this.
 *
 * End-to-end because the layer under test is the wiring: `entryRepositoryFor`
 * (`src/lib/backend.e2e.ts`) rejecting the export walk's first read with
 * Firestore's own `permission-denied`, `exportEverything` propagating it
 * unchanged, and the route choosing what to render. The branch itself is
 * `tests/unit/loadError.test.ts`.
 */
test('shows the access-denied message on a denied export, not the SDK’s own string', async ({
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
  // The half that fails without the fix: the SDK's own English string, which
  // `cause.message` used to pass straight through.
  await expect(page.getByText('Missing or insufficient permissions.')).toBeHidden();
  // Nor the generic wording, which would mean the denial branch was never
  // reached at all.
  await expect(page.getByText('エクスポートできませんでした。', { exact: true })).toBeHidden();
  expect(pageErrors).toEqual([]);
});
