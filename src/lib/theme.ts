import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/**
 * The initial value is already on <html> — index.html sets it before first
 * paint so the page never flashes the wrong theme. This hook only has to keep
 * React in step with it.
 */
function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/**
 * Browser chrome has to follow the theme the page actually renders, which stops
 * matching the OS preference the moment someone picks one by hand. The two
 * colours are carried on the meta tag in index.html so the pre-paint script
 * there and this function share a single source.
 */
function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = meta.dataset[next] ?? meta.content;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentTheme);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    localStorage.setItem('theme', next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  // Follow the OS only while the user has not made an explicit choice.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem('theme')) return;
      applyTheme(event.matches ? 'dark' : 'light');
      setThemeState(currentTheme());
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return { theme, setTheme, toggle };
}
