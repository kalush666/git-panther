/**
 * Git Panther design tokens — the single source of truth for every visual value.
 * See `.claude/skills/design-system/SKILL.md` for usage rules.
 */

export type ThemeName = 'dark' | 'light';

type Themed = Readonly<Record<ThemeName, string>>;

/** Semantic colours and other theme-dependent values, emitted as `--gp-<name>`. */
export const themedTokens = {
  'bg-canvas': { dark: '#0B0A10', light: '#F7F6FB' },
  'bg-surface': { dark: '#13111A', light: '#FFFFFF' },
  'bg-raised': { dark: '#1B1825', light: '#F1EEF8' },
  'bg-overlay': { dark: '#241F31', light: '#FFFFFF' },
  'border-subtle': { dark: '#262131', light: '#E6E2EF' },
  'border-strong': { dark: '#3A3349', light: '#CFC8DE' },

  'text-primary': { dark: '#EEEBF6', light: '#16131F' },
  'text-secondary': { dark: '#A7A0BB', light: '#4C4560' },
  'text-muted': { dark: '#938CA9', light: '#6A6380' },

  accent: { dark: '#7C4DEB', light: '#6D3FE0' },
  'accent-hover': { dark: '#8456F2', light: '#5B2ED0' },
  'accent-subtle': { dark: '#2A1F47', light: '#ECE4FF' },
  'accent-text': { dark: '#B9A2FB', light: '#5B2ED0' },
  'on-accent': { dark: '#FFFFFF', light: '#FFFFFF' },
  'focus-ring': { dark: '#A78BFA', light: '#6D3FE0' },

  success: { dark: '#3CC48A', light: '#1F8A5A' },
  danger: { dark: '#F2606F', light: '#C9303F' },
  warning: { dark: '#F0B23E', light: '#9A6508' },
  info: { dark: '#4FAEF5', light: '#1C6FB3' },

  'diff-added-bg': { dark: '#3CC48A1F', light: '#1F9A631A' },
  'diff-added-fg': { dark: '#7EE2B0', light: '#146C45' },
  'diff-added-word': { dark: '#3CC48A4D', light: '#1F9A6340' },
  'diff-removed-bg': { dark: '#F2606F1F', light: '#D23A4B1A' },
  'diff-removed-fg': { dark: '#FF9AA4', light: '#A3212F' },
  'diff-removed-word': { dark: '#F2606F4D', light: '#D23A4B40' },

  'lane-0': { dark: '#A78BFA', light: '#6D3FE0' },
  'lane-1': { dark: '#22D3EE', light: '#0E7490' },
  'lane-2': { dark: '#F472B6', light: '#BE185D' },
  'lane-3': { dark: '#FBBF24', light: '#A16207' },
  'lane-4': { dark: '#34D399', light: '#047857' },
  'lane-5': { dark: '#FB7185', light: '#BE123C' },
  'lane-6': { dark: '#60A5FA', light: '#1D4ED8' },
  'lane-7': { dark: '#E879F9', light: '#A21CAF' },

  scrim: { dark: 'rgb(0 0 0 / 0.6)', light: 'rgb(22 19 31 / 0.35)' },

  'shadow-overlay': {
    dark: '0 12px 32px rgb(0 0 0 / 0.55), 0 0 0 1px #262131',
    light: '0 12px 32px rgb(22 19 31 / 0.14), 0 0 0 1px #E6E2EF',
  },
} as const satisfies Record<string, Themed>;

/** Theme-independent tokens: typography, spacing, shape and motion. */
export const scaleTokens = {
  'font-ui': "'Inter Variable', 'Segoe UI Variable', system-ui, sans-serif",
  'font-mono': "'JetBrains Mono Variable', ui-monospace, Consolas, monospace",
  'text-xs': '11px',
  'text-sm': '12px',
  'text-md': '13px',
  'text-lg': '15px',
  'text-xl': '18px',
  'text-display': '24px',
  'leading-ui': '1.45',
  'leading-code': '1.5',
  'weight-regular': '400',
  'weight-medium': '500',
  'weight-semibold': '600',

  'space-1': '4px',
  'space-2': '8px',
  'space-3': '12px',
  'space-4': '16px',
  'space-5': '24px',
  'space-6': '32px',
  'space-7': '48px',
  'row-height': '28px',
  'control-height-sm': '26px',
  'control-height-md': '32px',
  'menu-min-width': '160px',
  'content-max-width': '560px',
  'tab-max-width': '200px',
  'dialog-width': '480px',
  'details-width': '380px',
  'col-author': '160px',
  'col-date': '160px',
  'col-sha': '72px',
  'badge-max-width': '180px',
  'badge-height': '18px',
  'titlebar-height': '40px',
  'statusbar-height': '24px',

  'radius-sm': '4px',
  'radius-md': '6px',
  'radius-lg': '10px',

  'duration-fast': '120ms',
  'duration-base': '200ms',
  'ease-out': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const satisfies Record<string, string>;

export type ThemedTokenName = keyof typeof themedTokens;
export type ScaleTokenName = keyof typeof scaleTokens;

/** Number of graph lane colours; lanes are coloured `lane % LANE_COLOR_COUNT`. */
export const LANE_COLOR_COUNT = 8;

export type LaneTokenName = Extract<ThemedTokenName, `lane-${number}`>;

/** The colour token for a graph lane; lanes beyond the palette wrap around. */
export function laneToken(lane: number): LaneTokenName {
  // Safe: the modulo keeps the index within lane-0 … lane-(LANE_COLOR_COUNT - 1).
  return `lane-${lane % LANE_COLOR_COUNT}` as LaneTokenName;
}
