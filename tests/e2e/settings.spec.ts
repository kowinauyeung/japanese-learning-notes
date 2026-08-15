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

  await page.getByLabel(/ニックネーム/).fill('Kowin');
  await page.getByLabel('表示言語').selectOption('zh-Hant');
  await page.getByLabel(/AI 翻訳言語/).selectOption('es');
  await page.getByLabel('テーマ').selectOption('dark');
  await page.getByRole('button', { name: '設定を保存' }).click();

  await expect(page.getByText('保存しました。')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('link', { name: '儀表板' })).toBeVisible();

  await page.getByRole('button', { name: '＋新增', exact: true }).click();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(page.getByLabel('訳の言語')).toHaveValue('スペイン語');
  await page.getByRole('button', { name: 'キャンセル' }).click();

  await page.reload();
  await expect(page.getByLabel(/ニックネーム/)).toHaveValue('Kowin');
  await expect(page.getByLabel('表示言語')).toHaveValue('zh-Hant');
  await expect(page.getByLabel(/AI 翻訳言語/)).toHaveValue('es');
  await expect(page.getByLabel('テーマ')).toHaveValue('dark');
});
