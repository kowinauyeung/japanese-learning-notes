import { expect, test } from '@playwright/test';
import { seed } from './fixtures';

test('saves user settings across a reload and applies the durable theme', async ({ page }) => {
  await seed(page, {
    signedIn: true,
    profile: {
      nickname: 'Before',
      language: 'ja',
      translationLanguage: 'en',
      theme: 'system',
    },
  });
  await page.goto('/settings');

  const displayLanguage = page.getByLabel('表示言語');
  const translationLanguage = page.getByLabel(/AI 翻訳言語/);
  await expect(displayLanguage.locator('option[value="zh-Hant"]')).toHaveText('中文');
  await expect(displayLanguage.locator('option[value="yue-Hant"]')).toHaveCount(0);
  expect(await translationLanguage.locator('option').allTextContents()).toEqual([
    'English',
    '日本語',
    '中文',
    '廣東話',
    '한국어',
    'Español',
  ]);
  await page.getByLabel(/ニックネーム/).fill('Kowin');
  await translationLanguage.selectOption('yue-Hant');
  await page.getByLabel('テーマ').selectOption('dark');
  await displayLanguage.selectOption('zh-Hant');
  await page.getByRole('button', { name: '儲存設定' }).click();

  await expect(page.getByText('已儲存。')).toBeVisible();
  // `data-theme` on `<html>` is what `src/index.css` keys its custom
  // properties on (`:root[data-theme='dark']`), and every Tailwind colour
  // utility reads from those — so this is the one attribute the dark palette
  // actually depends on reaching the DOM.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('link', { name: '學習總覽' })).toBeVisible();

  await page.getByRole('button', { name: '＋新增', exact: true }).click();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const addWordDialog = page.getByRole('dialog', { name: '新增單字' });
  await expect(addWordDialog.getByLabel('翻譯語言')).toHaveValue('廣東話');
  await addWordDialog.getByRole('button', { name: '取消' }).click();

  await page.reload();
  await expect(page.getByLabel('暱稱')).toHaveValue('Kowin');
  await expect(page.getByLabel('顯示語言')).toHaveValue('zh-Hant');
  await expect(page.getByLabel(/AI 翻譯語言/)).toHaveValue('yue-Hant');
  await expect(page.getByLabel('主題')).toHaveValue('dark');

  await page.goto('/account');
  await expect(page.getByText('Kowin', { exact: true })).toBeVisible();
});

test('previews language and theme without persisting them before save', async ({ page }) => {
  await seed(page, {
    signedIn: true,
    profile: {
      nickname: 'Before',
      language: 'ja',
      translationLanguage: 'en',
      theme: 'light',
    },
  });
  await page.goto('/settings');

  await page.getByLabel('テーマ').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByLabel('表示言語').selectOption('zh-Hant');
  await expect(page.getByRole('link', { name: '學習總覽' })).toBeVisible();
  await expect(page.getByLabel('暱稱')).toHaveValue('Before');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('link', { name: '学習サマリー' })).toBeVisible();
  await expect(page.getByLabel('ニックネーム')).toHaveValue('Before');
});

test('does not reload app data when previewing another display language', async ({ page }) => {
  await seed(page, {
    signedIn: true,
    profile: {
      nickname: 'Before',
      language: 'ja',
      translationLanguage: 'en',
      theme: 'light',
    },
  });
  await page.goto('/settings');
  await expect(page.getByLabel('表示言語')).toBeVisible();

  const readsBefore = await page.evaluate(() =>
    structuredClone(
      (window as unknown as { __GOITEI_E2E_READS__: Record<string, number> }).__GOITEI_E2E_READS__,
    ),
  );

  await page.getByLabel('表示言語').selectOption('zh-Hant');
  await expect(page.getByRole('link', { name: '學習總覽' })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  expect(
    await page.evaluate(() =>
      structuredClone(
        (window as unknown as { __GOITEI_E2E_READS__: Record<string, number> })
          .__GOITEI_E2E_READS__,
      ),
    ),
  ).toEqual(readsBefore);
});

test('shows save failures in the previewed display language', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await seed(page, {
    signedIn: true,
    profile: {
      nickname: 'Before',
      language: 'ja',
      translationLanguage: 'en',
      theme: 'light',
    },
    settingsSave: 'fail',
  });
  await page.goto('/settings');

  await page.getByLabel('表示言語').selectOption('zh-Hant');
  await page.getByRole('button', { name: '儲存設定' }).click();

  await expect(page.getByText('無法儲存設定。')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

/**
 * Not reaching the backend is not one message. #63 gave `unavailable` its own
 * sentence so a lost connection stops reading as a fault in the thing being
 * opened — and that sentence describes a *read*. Routed to a save it told the
 * reader their settings could not be loaded, when what failed was a write that
 * left nothing behind: the save is a `runTransaction`, and a transaction is the
 * one Firestore write that cannot be deferred. Measured with the socket cut, it
 * rejects with `unavailable` after six to ten seconds of retries.
 *
 * End-to-end because the layer under test is the wiring, not the branch: the
 * provider chooses the key, the hook resolves it, and the route renders it.
 * `tests/unit/loadError.test.ts` covers the branch itself.
 */
test('says the settings were not saved, rather than that something could not be loaded', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await seed(page, {
    signedIn: true,
    profile: {
      nickname: 'Before',
      language: 'ja',
      translationLanguage: 'en',
      theme: 'light',
    },
    settingsSave: 'unreachable',
  });
  await page.goto('/settings');

  await page.getByLabel('ニックネーム').fill('After');
  await page.getByRole('button', { name: '設定を保存' }).click();

  await expect(page.getByText('接続できないため保存できませんでした。')).toBeVisible();
  // The half that fails without the fix. Both sentences begin the same way, so
  // asserting only the one above passes on a substring of the wrong message.
  await expect(page.getByText('接続できないため読み込めませんでした。')).toBeHidden();
  // Nor is it the generic wording, which would mean the offline branch was
  // skipped entirely rather than routed to the wrong operation.
  await expect(page.getByText('設定を保存できませんでした。')).toBeHidden();
  expect(pageErrors).toEqual([]);
});

/**
 * The save and the re-read that follows it are two Firestore operations, and
 * only the first decides whether anything was saved.
 *
 * They used to share a `try`. A `get` that failed after the transaction had
 * committed told the reader their settings could not be saved and to try
 * again — for a change the server already had — and the rejection propagated,
 * so the form never advanced its baseline and went on offering to save
 * settings that were saved. Redoing the save would have worked, which is
 * precisely why this would never have been reported: the lie corrects itself
 * the moment the reader believes it.
 */
test('keeps a committed save committed when the re-read after it fails', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await seed(page, {
    signedIn: true,
    profile: {
      nickname: 'Before',
      language: 'ja',
      translationLanguage: 'en',
      theme: 'light',
    },
    settingsRefresh: 'fail',
  });
  await page.goto('/settings');

  await page.getByLabel('ニックネーム').fill('After');
  await page.getByRole('button', { name: '設定を保存' }).click();

  // Read wording, because a read is what failed.
  await expect(page.getByText('接続できないため読み込めませんでした。')).toBeVisible();
  // Never the save wording: the transaction committed, and telling this reader
  // to try again asks them to redo durable work.
  await expect(page.getByText('接続できないため保存できませんでした。')).toBeHidden();
  await expect(page.getByText('設定を保存できませんでした。')).toBeHidden();
  // And the form has to agree. A banner about a failed read is survivable; a
  // form that still claims unsaved changes sends the reader round again.
  await expect(page.getByText('保存していない変更があります。')).toBeHidden();
  await expect(page.getByLabel('ニックネーム')).toHaveValue('After');
  expect(pageErrors).toEqual([]);
});

test('locks the settings draft until a delayed save finishes', async ({ page }) => {
  await seed(page, {
    signedIn: true,
    profile: {
      nickname: 'Before',
      language: 'ja',
      translationLanguage: 'en',
      theme: 'light',
    },
    settingsSave: 'defer',
  });
  await page.goto('/settings');

  await page.getByLabel('ニックネーム').fill('After');
  await page.getByRole('button', { name: '設定を保存' }).click();

  await expect(page.getByLabel('ニックネーム')).toBeDisabled();
  await expect(page.getByLabel('表示言語')).toBeDisabled();
  await expect(page.getByLabel(/AI 翻訳言語/)).toBeDisabled();
  await expect(page.getByLabel('テーマ')).toBeDisabled();

  await page.evaluate(() => {
    const release = (window as unknown as { __GOITEI_E2E_RELEASE_SETTINGS_SAVE__?: () => void })
      .__GOITEI_E2E_RELEASE_SETTINGS_SAVE__;
    if (!release) throw new Error('settings save was not deferred');
    release();
  });

  await expect(page.getByText('保存しました。')).toBeVisible();
  await expect(page.getByText('保存していない変更があります。')).toBeHidden();
  await expect(page.getByLabel('ニックネーム')).toBeEnabled();
});

test('warns before leaving settings with unsaved changes', async ({ page }) => {
  await seed(page, {
    signedIn: true,
    profile: {
      nickname: 'Before',
      language: 'ja',
      translationLanguage: 'en',
      theme: 'light',
    },
  });
  await page.goto('/settings');

  await page.getByLabel('ニックネーム').fill('After');
  await expect(page.getByText('保存していない変更があります。')).toBeVisible();

  await Promise.all([
    page.waitForEvent('dialog').then(async (dialog) => {
      expect(dialog.message()).toBe('設定を保存せずに移動しますか？');
      await dialog.dismiss();
    }),
    page.getByRole('link', { name: '単語', exact: true }).click(),
  ]);
  await expect(page).toHaveURL(/\/settings$/);

  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.accept()),
    page.getByRole('link', { name: '単語', exact: true }).click(),
  ]);
  await expect(page).toHaveURL(/\/vocabulary$/);
});
