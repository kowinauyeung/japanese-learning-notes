export const supportedLocales = ['en', 'ja', 'zh-Hant', 'ko', 'es'] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

const traditionalChineseRegions = new Set(['hk', 'mo', 'tw']);

export function matchSupportedLocale(language: string): SupportedLocale | null {
  const parts = language.trim().replaceAll('_', '-').toLowerCase().split('-');
  const primary = parts[0];

  if (primary === 'en' || primary === 'ja' || primary === 'ko' || primary === 'es') {
    return primary;
  }

  if (primary !== 'zh') return null;

  const subtags = new Set(parts.slice(1));
  if (subtags.has('hans') || subtags.has('cn') || subtags.has('sg')) return null;
  if (subtags.has('hant') || [...traditionalChineseRegions].some((region) => subtags.has(region))) {
    return 'zh-Hant';
  }

  // Bare `zh` does not say which writing system the reader uses. Treating it
  // as Traditional Chinese would silently enable a locale the browser did not
  // request, while treating it as Simplified Chinese is outside product scope.
  return null;
}

export function resolveLocale(languages: readonly string[]): SupportedLocale {
  for (const language of languages) {
    const locale = matchSupportedLocale(language);
    if (locale) return locale;
  }
  return 'en';
}

export function detectBrowserLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') return 'en';

  const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  return resolveLocale(languages);
}
