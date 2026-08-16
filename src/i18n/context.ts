import { createContext, useContext } from 'react';
import type { SupportedLocale } from './locales';
import type { MessageKey } from './messages';

export interface I18nValue {
  locale: SupportedLocale;
  t: (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string;
}

export const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
