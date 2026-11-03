import type { ThemeName } from '@git-panther/design-tokens';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'system' | ThemeName;

export const THEME_PREFERENCES: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export function isThemePreference(value: string): value is ThemePreference {
  return THEME_PREFERENCES.some((option) => option.value === value);
}

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: 'system',
      setPreference: (preference) => set({ preference }),
    }),
    { name: 'git-panther.theme' },
  ),
);

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ThemeName {
  if (preference !== 'system') {
    return preference;
  }
  return systemPrefersDark ? 'dark' : 'light';
}
