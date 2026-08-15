import { describe, expect, it } from 'vitest';
import { matchSupportedLocale, resolveLocale } from '@/i18n/locales';

describe('locale resolution', () => {
  it.each([
    ['en-GB', 'en'],
    ['ja-JP', 'ja'],
    ['ko-KR', 'ko'],
    ['es-MX', 'es'],
    ['zh-Hant', 'zh-Hant'],
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh_MO', 'zh-Hant'],
  ] as const)('maps the supported browser locale %s to %s', (language, expected) => {
    expect(matchSupportedLocale(language)).toBe(expected);
  });

  it.each(['zh-Hans', 'zh-CN', 'zh-SG', 'zh', 'fr-FR'])(
    'does not silently enable an unsupported locale for %s',
    (language) => {
      expect(matchSupportedLocale(language)).toBeNull();
    },
  );

  it('uses the next browser preference when the first language is unsupported', () => {
    expect(resolveLocale(['fr-FR', 'ko-KR', 'ja-JP'])).toBe('ko');
  });

  it('falls back to English when every browser preference is unsupported', () => {
    expect(resolveLocale(['zh-CN', 'fr-FR'])).toBe('en');
    expect(resolveLocale([])).toBe('en');
  });
});
