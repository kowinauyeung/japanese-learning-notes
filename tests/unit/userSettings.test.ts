import { describe, expect, it } from 'vitest';
import { sanitizeUserProfile } from '@/lib/sanitize';
import { defaultUserProfile, resolveUiLanguage } from '@/lib/userPreferences';

describe('resolveUiLanguage', () => {
  it('uses Traditional Chinese for Hong Kong and Taiwan browser locales', () => {
    expect(resolveUiLanguage(['zh-HK'])).toBe('zh-Hant');
    expect(resolveUiLanguage(['zh-TW'])).toBe('zh-Hant');
  });

  it('falls back to English instead of accepting Simplified Chinese', () => {
    expect(resolveUiLanguage(['zh-CN', 'zh'])).toBe('en');
  });

  it('uses the first supported locale in the browser preference list', () => {
    expect(resolveUiLanguage(['fr-FR', 'es-MX', 'ja-JP'])).toBe('es');
  });
});

describe('defaultUserProfile', () => {
  it('starts translation in the same language as the browser and follows the system theme', () => {
    const profile = defaultUserProfile('u1', ' Kowin ', ['ja-JP'], null);
    expect(profile).toMatchObject({
      uid: 'u1',
      nickname: 'Kowin',
      language: 'ja',
      translationLanguage: 'ja',
      theme: 'system',
    });
  });

  it('keeps an existing local theme choice when creating the durable copy', () => {
    expect(defaultUserProfile('u1', 'K', ['en'], 'dark').theme).toBe('dark');
  });
});

describe('sanitizeUserProfile', () => {
  it('keeps Hong Kong Cantonese as a translation-only preference', () => {
    expect(
      sanitizeUserProfile('u1', {
        nickname: 'Kowin',
        language: 'zh-Hant',
        translationLanguage: 'yue-Hant',
        theme: 'system',
      }),
    ).toMatchObject({ language: 'zh-Hant', translationLanguage: 'yue-Hant' });
  });

  it('does not admit Hong Kong Cantonese as a display language', () => {
    expect(
      sanitizeUserProfile('u1', {
        nickname: 'Kowin',
        language: 'yue-Hant',
        translationLanguage: 'yue-Hant',
        theme: 'system',
      }),
    ).toMatchObject({ language: 'en', translationLanguage: 'yue-Hant' });
  });

  it('coerces stale or unsupported settings without admitting Simplified Chinese', () => {
    expect(
      sanitizeUserProfile('u1', {
        nickname: 123,
        language: 'zh-CN',
        translationLanguage: 'ko',
        theme: 'sepia',
      }),
    ).toMatchObject({
      uid: 'u1',
      nickname: '123',
      language: 'en',
      translationLanguage: 'ko',
      theme: 'system',
    });
  });
});
