import { UI_LANGUAGES } from '@/domain/user';
import type { ThemePreference, UiLanguage, UserProfile } from '@/domain/user';

const supported = new Set<string>(UI_LANGUAGES);

/** Browser locales may include regions; only Traditional Chinese is accepted for Chinese. */
export function resolveUiLanguage(languages: readonly string[]): UiLanguage {
  for (const value of languages) {
    const language = value.replace('_', '-');
    if (supported.has(language)) return language as UiLanguage;
    const lower = language.toLowerCase();
    if (
      lower === 'zh-tw' ||
      lower === 'zh-hk' ||
      lower === 'zh-mo' ||
      lower.startsWith('zh-hant')
    ) {
      return 'zh-Hant';
    }
    const base = lower.split('-')[0];
    if (base && supported.has(base)) return base as UiLanguage;
  }
  return 'en';
}

export function defaultUserProfile(
  uid: string,
  nickname: string,
  languages: readonly string[],
  savedTheme: string | null,
): UserProfile {
  const language = resolveUiLanguage(languages);
  const theme: ThemePreference =
    savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system'
      ? savedTheme
      : 'system';
  return {
    uid,
    nickname: nickname.trim().slice(0, 50),
    language,
    translationLanguage: language,
    theme,
    createdAt: '',
    updatedAt: '',
  };
}
