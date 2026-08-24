import { USER_LIMITS } from '@/domain/limits';
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
    /*
      The one nickname nobody types. It is the provider's display name — or the
      local part of the address when there is none — so `maxLength` on the
      settings field never sees it, and a Google account whose display name runs
      to forty characters would otherwise have a profile written past the limit
      before the user has opened the form. Truncated rather than refused,
      because refusing would mean an account that cannot be created over a name
      the user did not choose and is free to change.
      A provider display name can end in an emoji outside the BMP, so the slice
      below drops a trailing lone high surrogate the same way `sanitizeUserProfile`
      does, rather than leaving one behind at the cut.
    */
    nickname: nickname
      .trim()
      .slice(0, USER_LIMITS.nickname)
      .replace(/[\uD800-\uDBFF]$/u, ''),
    language,
    translationLanguage: language,
    theme,
    createdAt: '',
    updatedAt: '',
  };
}
