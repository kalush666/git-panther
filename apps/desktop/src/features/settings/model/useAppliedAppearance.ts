import { useEffect } from 'react';

import { ipc } from '../../../shared/ipc';
import { CODE_FONTS, useAppearanceStore } from '../../../shared/preferences/appearance';

/** Applies the interface size and code font to the whole app. */
export function useAppliedAppearance(): void {
  const interfaceScale = useAppearanceStore((state) => state.interfaceScale);
  const codeFont = useAppearanceStore((state) => state.codeFont);

  useEffect(() => {
    void ipc.setZoom(interfaceScale);
  }, [interfaceScale]);

  useEffect(() => {
    const family = CODE_FONTS.find((font) => font.id === codeFont)?.family ?? null;
    const root = document.documentElement.style;
    // Without an override the design token's bundled font applies.
    if (family) root.setProperty('--gp-font-mono', family);
    else root.removeProperty('--gp-font-mono');
  }, [codeFont]);
}
