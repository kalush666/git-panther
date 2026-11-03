import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { contrastRatio } from './contrast.ts';
import { renderTokensCss } from './css.ts';
import { LANE_COLOR_COUNT, laneToken, themedTokens, type ThemeName } from './tokens.ts';

describe('laneToken', () => {
  it('wraps lanes beyond the palette', () => {
    expect(laneToken(0)).toBe('lane-0');
    expect(laneToken(LANE_COLOR_COUNT + 2)).toBe('lane-2');
  });
});

const THEMES: ThemeName[] = ['dark', 'light'];
const TEXT_TOKENS = ['text-primary', 'text-secondary', 'text-muted', 'accent-text'] as const;
const BACKGROUND_TOKENS = ['bg-canvas', 'bg-surface', 'bg-raised', 'bg-overlay'] as const;
const WCAG_AA_TEXT = 4.5;
const WCAG_AA_NON_TEXT = 3;

describe.each(THEMES)('%s theme', (theme) => {
  it.each(TEXT_TOKENS.flatMap((text) => BACKGROUND_TOKENS.map((bg) => [text, bg] as const)))(
    '%s meets WCAG AA on %s',
    (text, background) => {
      const ratio = contrastRatio(themedTokens[text][theme], themedTokens[background][theme]);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    },
  );

  it.each(['accent', 'accent-hover'] as const)('on-accent text is readable on %s', (fill) => {
    const ratio = contrastRatio(themedTokens['on-accent'][theme], themedTokens[fill][theme]);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it.each(Array.from({ length: LANE_COLOR_COUNT }, (_, lane) => laneToken(lane)))(
    '%s is distinguishable from the canvas',
    (lane) => {
      const ratio = contrastRatio(themedTokens[lane][theme], themedTokens['bg-canvas'][theme]);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
    },
  );
});

describe('generated tokens.css', () => {
  it('is up to date with tokens.ts (run `pnpm tokens` if this fails)', () => {
    const committed = readFileSync(
      fileURLToPath(new URL('../generated/tokens.css', import.meta.url)),
      'utf8',
    );
    expect(committed.replaceAll('\r\n', '\n')).toBe(renderTokensCss());
  });

  it('defines every themed token for both themes', () => {
    const css = renderTokensCss();
    for (const name of Object.keys(themedTokens)) {
      expect(css.match(new RegExp(`--gp-${name}:`, 'g'))).toHaveLength(THEMES.length);
    }
  });
});
