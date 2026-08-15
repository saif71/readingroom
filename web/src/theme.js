import { useEffect, useState } from 'react';

const STORAGE_KEY = 'readingroom-theme';
const THEMES = ['system', 'light', 'dark'];

export function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (THEMES.includes(value)) return value;
  } catch {
    // localStorage unavailable (private mode etc.) — fall back to system
  }
  return 'system';
}

export function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setThemeAndStore = (next) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — choice just won't persist
    }
    setTheme(next);
  };

  return [theme, setThemeAndStore];
}

/** True when dark mode is active, whatever the source (manual choice or system). */
export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setDark(root.classList.contains('dark')));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return dark;
}
