import { useEffect, useMemo, type ReactNode } from 'react';
import { I18nContext, type I18nValue } from './context';
import { detectBrowserLocale, type SupportedLocale } from './locales';
import { messages } from './messages';

/**
 * `locale` is deliberately injectable rather than read from persistence here.
 * The settings layer can pass a UserProfile preference later without making
 * translation code depend on Firestore or on the profile's loading lifecycle.
 */
export function I18nProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale?: SupportedLocale;
}) {
  const resolvedLocale = useMemo(() => locale ?? detectBrowserLocale(), [locale]);
  const value = useMemo<I18nValue>(
    () => ({
      locale: resolvedLocale,
      t: (key, params) => {
        const message = messages[resolvedLocale][key];
        if (!params) return message;
        return message.replaceAll(/\{([^}]+)\}/g, (token, name: string) =>
          Object.hasOwn(params, name) ? String(params[name]) : token,
        );
      },
    }),
    [resolvedLocale],
  );

  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = resolvedLocale;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [resolvedLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
