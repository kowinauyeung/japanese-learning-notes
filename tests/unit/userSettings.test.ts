import { describe, expect, it } from 'vitest';
import { USER_LIMITS } from '@/domain/limits';
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

  /**
   * The nickname nobody types, and therefore the one the settings field's
   * `maxLength` cannot bound: it is the identity provider's display name, and
   * this profile is written the first time the account signs in — before the
   * form has ever been opened. A provider display name is not the account
   * holder's choice of length.
   */
  it('bounds a display name the account holder never typed', () => {
    const long = 'ゆ'.repeat(USER_LIMITS.nickname + 20);
    expect(defaultUserProfile('u1', long, ['ja'], null).nickname).toHaveLength(
      USER_LIMITS.nickname,
    );
  });

  /**
   * A provider display name that ends in an emoji can have that emoji straddle
   * the truncation boundary. `slice` counts UTF-16 code units, so cutting
   * inside the pair leaves a lone high surrogate — not a character, and not
   * encodable as UTF-8 — as the last unit of a name shown right after sign-in.
   */
  it('drops a trailing lone high surrogate instead of splitting an astral display name', () => {
    const straddling = `${'ゆ'.repeat(USER_LIMITS.nickname - 1)}😀`;
    expect(defaultUserProfile('u1', straddling, ['ja'], null).nickname).toBe(
      'ゆ'.repeat(USER_LIMITS.nickname - 1),
    );
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

  /**
   * `firestore.rules` bounds a nickname at 50 characters, deliberately wider
   * than the product's own 30, so a 31-50 character value can already be in
   * the database — written before this limit existed, or by any path that is
   * not the settings form. Reading one back has to bring it down to the limit
   * every other part of the app assumes, or the avatar initial, the header and
   * the settings field are all working from a ceiling the sanitizer does not
   * actually hold.
   */
  it('brings a stored nickname the rules still allow down to the product limit', () => {
    const stored = 'ゆ'.repeat(USER_LIMITS.nickname + 15);
    expect(sanitizeUserProfile('u1', { nickname: stored }).nickname).toBe(
      stored.slice(0, USER_LIMITS.nickname),
    );
  });

  /**
   * Same hazard as `defaultUserProfile`, reached through the persisted path
   * instead of the provider display name: a stored nickname ending in an emoji
   * that straddles the product limit must not come back with a lone high
   * surrogate as its last unit.
   */
  it('drops a trailing lone high surrogate instead of splitting an astral nickname', () => {
    const straddling = `${'ゆ'.repeat(USER_LIMITS.nickname - 1)}😀`;
    expect(sanitizeUserProfile('u1', { nickname: straddling }).nickname).toBe(
      'ゆ'.repeat(USER_LIMITS.nickname - 1),
    );
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
