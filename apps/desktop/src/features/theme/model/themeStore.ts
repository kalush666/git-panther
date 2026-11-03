import type { ThemeName } from '@git-panther/design-tokens';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'system' | ThemeName;

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
