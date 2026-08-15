import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { I18nProvider } from '@/i18n/I18nProvider';

function JapaneseI18n({ children }: { children: ReactNode }) {
  return <I18nProvider locale="ja">{children}</I18nProvider>;
}

export function renderWithI18n(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { ...options, wrapper: JapaneseI18n });
}
