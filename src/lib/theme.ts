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

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentTheme);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
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
      document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
      setThemeState(currentTheme());
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return { theme, setTheme, toggle };
}
