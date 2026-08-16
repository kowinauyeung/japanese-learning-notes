import { expect, test } from '@playwright/test';
import { seed, WORDS } from './fixtures';

test('localizes authenticated vocabulary UI without changing Japanese learning content', async ({
  page,
}) => {
  await seed(page, {
    signedIn: true,
    entries: WORDS,
    profile: {
      nickname: 'Learner',
      language: 'en',
      translationLanguage: 'en',
      theme: 'light',
    },
  });

  await page.goto('/vocabulary/w-choukou');

  await expect(page.getByRole('link', { name: 'My progress' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('Part of speech')).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'Noun' })).toBeVisible();
  await expect(page.getByText('Sino-Japanese', { exact: true })).toBeVisible();
  await expect(page.getByText('Source: NHK News')).toBeVisible();
  await expect(page.getByText('何かが起こる前ぶれ。')).toBeVisible();
  await expect(page.getByText(/出處/)).toHaveCount(0);
});

test('uses natural Traditional Chinese labels throughout authenticated vocabulary UI', async ({
  page,
}) => {
  await seed(page, {
    signedIn: true,
    entries: WORDS,
    profile: {
      nickname: 'Learner',
      language: 'zh-Hant',
      translationLanguage: 'yue-Hant',
      theme: 'light',
    },
  });

  await page.goto('/vocabulary/w-choukou');

  await expect(page.getByRole('link', { name: '學習總覽' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '概要' })).toBeVisible();
  await expect(page.getByText('詞性')).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: '名詞' })).toBeVisible();
  await expect(page.getByText('來源：NHK News')).toBeVisible();
});
