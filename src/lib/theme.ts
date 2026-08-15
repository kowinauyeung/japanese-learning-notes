import type { ThemePreference } from '@/domain/user';

export type Theme = 'light' | 'dark';

/**
 * The initial value is already on <html> — index.html sets it before first
 * paint so the page never flashes the wrong theme. This hook only has to keep
 * React in step with it.
 */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/**
 * Browser chrome has to follow the theme the page actually renders, which stops
 * matching the OS preference the moment someone picks one by hand. The two
 * colours are carried on the meta tag in index.html so the pre-paint script
 * there and this function share a single source.
 */
export function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = meta.dataset[next] ?? meta.content;
}

export function applyThemePreference(preference: ThemePreference): Theme {
  localStorage.setItem('theme', preference);
  const resolved =
    preference === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
  applyTheme(resolved);
  return resolved;
}
