---
name: design-system
description: Git Panther's visual design system — black-panther-with-violet identity, design tokens (colour, type, spacing, radius, motion, elevation), dark/light themes, graph lane and diff colours, and rules for building UI with Radix primitives + CSS Modules. Use this skill whenever creating or changing anything visual in apps/desktop/src or packages/design-tokens — components, layouts, icons, the commit graph, diffs, theming — even for small styling tweaks.
---

# Design system — Git Panther

**Identity:** a black panther at night — deep near-black surfaces, quiet graphite structure, and a single confident violet accent (the panther's glow). Dark theme is the primary experience; light theme is a full peer, not an afterthought. The look is original to Git Panther: don't borrow other Git clients' layouts pixel-for-pixel, icons, or colour schemes.

## Source of truth

Tokens live in `packages/design-tokens/src/tokens.ts` and are emitted as CSS custom properties (`--gp-*`) in `packages/design-tokens/dist/tokens.css`. Components consume **only** `var(--gp-…)`. A hex value, `px` spacing, or font stack hard-coded in a component is a bug — add or reuse a token instead.

Themes switch by `data-theme="dark" | "light"` on `<html>`; `system` follows `prefers-color-scheme`. Every semantic token must be defined for both themes.

## Colour tokens (semantic)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--gp-bg-canvas` | `#0B0A10` | `#F7F6FB` | app background |
| `--gp-bg-surface` | `#13111A` | `#FFFFFF` | panels, sidebars |
| `--gp-bg-raised` | `#1B1825` | `#F1EEF8` | cards, rows on hover |
| `--gp-bg-overlay` | `#241F31` | `#FFFFFF` | menus, dialogs, tooltips |
| `--gp-border-subtle` | `#262131` | `#E6E2EF` | dividers |
| `--gp-border-strong` | `#3A3349` | `#CFC8DE` | inputs, focusable outlines |
| `--gp-text-primary` | `#EEEBF6` | `#16131F` | body text |
| `--gp-text-secondary` | `#A7A0BB` | `#4C4560` | labels, metadata |
| `--gp-text-muted` | `#6E6783` | `#7C7590` | timestamps, placeholders |
| `--gp-accent` | `#8B5CF6` | `#6D3FE0` | primary actions, selection, focus |
| `--gp-accent-hover` | `#A07BF8` | `#5B2ED0` | |
| `--gp-accent-subtle` | `#2A1F47` | `#ECE4FF` | selected row bg, accent chips |
| `--gp-on-accent` | `#FFFFFF` | `#FFFFFF` | text on accent |
| `--gp-focus-ring` | `#A78BFA` | `#6D3FE0` | 2px focus outline |
| `--gp-success` / `--gp-danger` / `--gp-warning` / `--gp-info` | `#3CC48A` / `#F2606F` / `#F0B23E` / `#4FAEF5` | `#1F9A63` / `#D23A4B` / `#B97A0C` / `#1F7CC7` | status |

**Diff colours** (must stay legible for red/green colour-blind users — always pair colour with the `+`/`-` gutter glyph): `--gp-diff-added-bg`, `--gp-diff-added-fg`, `--gp-diff-removed-bg`, `--gp-diff-removed-fg`, `--gp-diff-added-word`, `--gp-diff-removed-word`.

**Graph lanes:** 8 tokens `--gp-lane-0 … --gp-lane-7`, assigned `lane % 8`. Lane 0 is the accent violet so the main line reads as "panther". The canvas renderer reads them once per theme change via `getComputedStyle`, never per frame.

Contrast: text tokens must meet WCAG AA (4.5:1) on `bg-canvas`, `bg-surface` and `bg-raised` in both themes. `tokens.test.ts` checks this — keep it passing when you change a colour.

## Typography

- UI: `--gp-font-ui` = Inter Variable (bundled via `@fontsource-variable/inter`, the app must work offline), fallback `"Segoe UI Variable", system-ui, sans-serif`.
- Code, SHAs, diffs: `--gp-font-mono` = JetBrains Mono Variable (bundled), fallback `ui-monospace, Consolas, monospace`.
- Scale (`--gp-text-xs … --gp-text-xl`): 11 / 12 / 13 / 15 / 18 px. Default UI text is 13px — this is a dense, desktop tool. Line height 1.45 for UI, 1.5 for diffs.
- Weights: 400 body, 500 labels/buttons, 600 headings. Never 700+ in UI chrome.

## Space, shape, depth, motion

- Spacing: 4px base — `--gp-space-1` (4) `-2` (8) `-3` (12) `-4` (16) `-5` (24) `-6` (32). Graph/list row height `--gp-row-height` = 28px.
- Radius: `--gp-radius-sm` 4px (inputs, chips), `-md` 6px (buttons, menus), `-lg` 10px (dialogs, cards).
- Elevation: `--gp-shadow-overlay` for menus/dialogs only; panels separate by background step and a subtle border, not shadows.
- Motion: `--gp-duration-fast` 120ms, `-base` 200ms, easing `--gp-ease-out` `cubic-bezier(.2,.8,.2,1)`. Respect `prefers-reduced-motion` (durations drop to 0). Never animate during graph scrolling.

## Components

- Behaviour comes from **Radix primitives** (`@radix-ui/react-*`: Dialog, DropdownMenu, ContextMenu, Tabs, Tooltip, Toggle, ScrollArea…). Look comes from our CSS Modules. Don't fight Radix accessibility (focus trapping, ARIA, keyboard) — style it.
- Shared components live in `apps/desktop/src/shared/ui/<Component>/` with `<Component>.tsx`, `<Component>.module.css`, and a test. Feature-specific UI stays inside its feature folder until a second feature needs it.
- Variants are props (`<Button variant="primary" | "secondary" | "ghost" | "danger" size="sm" | "md">`), implemented with `data-variant` attributes in CSS — no inline style objects for theming.
- Every interactive element: visible `:focus-visible` ring (`2px solid var(--gp-focus-ring)`, offset 2px), hover state, disabled state, and a keyboard path.
- Icons: `lucide-react` at 16px (stroke 1.75) in chrome, 14px in dense rows. The Git Panther logo is our own SVG in `apps/desktop/src/assets/` — never use another product's marks.

## Layout conventions

Three-region workbench: left sidebar (repo, branches, remotes, stashes) · centre (graph + commit list) · right panel (commit details / staging / diff). Resizable splitters persist sizes per repo. Repo tabs sit in the title bar row. Empty states are friendly, short, and offer the next action ("Open a repository", "Clone", "Init").
