import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CodeFont = 'bundled' | 'cascadia' | 'consolas';

/** Monospace fonts for diffs, SHAs and code. Only the bundled one ships with the app. */
export const CODE_FONTS: ReadonlyArray<{ id: CodeFont; label: string; family: string | null }> = [
  { id: 'bundled', label: 'JetBrains Mono (bundled)', family: null },
  { id: 'cascadia', label: 'Cascadia Mono', family: "'Cascadia Mono', 'Cascadia Code', monospace" },
  { id: 'consolas', label: 'Consolas', family: 'Consolas, monospace' },
];

export const INTERFACE_SIZES: ReadonlyArray<{ scale: number; label: string }> = [
  { scale: 0.9, label: 'Compact (90%)' },
  { scale: 1, label: 'Default (100%)' },
  { scale: 1.1, label: 'Large (110%)' },
  { scale: 1.25, label: 'Larger (125%)' },
];

interface AppearanceState {
  interfaceScale: number;
  codeFont: CodeFont;
  setInterfaceScale: (scale: number) => void;
  setCodeFont: (font: CodeFont) => void;
}

/** How the interface looks beyond the theme; remembered across sessions. */
export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      interfaceScale: 1,
      codeFont: 'bundled',
      setInterfaceScale: (interfaceScale) => {
        set({ interfaceScale });
      },
      setCodeFont: (codeFont) => {
        set({ codeFont });
      },
    }),
    { name: 'git-panther.appearance' },
  ),
);
