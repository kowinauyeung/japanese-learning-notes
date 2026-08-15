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
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('link', { name: '儀表板' })).toBeVisible();

  await page.getByRole('button', { name: '＋新增', exact: true }).click();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(page.getByLabel('訳の言語')).toHaveValue('廣東話');
  await page.getByRole('button', { name: 'キャンセル' }).click();

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
  await expect(page.getByRole('link', { name: '儀表板' })).toBeVisible();
  await expect(page.getByLabel('暱稱')).toHaveValue('Before');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('link', { name: 'ダッシュボード' })).toBeVisible();
  await expect(page.getByLabel('ニックネーム')).toHaveValue('Before');
});
