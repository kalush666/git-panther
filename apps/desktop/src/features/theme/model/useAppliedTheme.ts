import { useEffect, useSyncExternalStore } from 'react';

import { resolveTheme, useThemeStore } from '../../../shared/preferences/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** Keeps `<html data-theme>` in sync with the user's preference and the OS theme. */
export function useAppliedTheme(): void {
  const preference = useThemeStore((state) => state.preference);
  const prefersDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark);
  const theme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
