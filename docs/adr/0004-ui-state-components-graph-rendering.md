# 4. UI state, components and graph rendering

Date: 2026-11-03 · Status: Accepted

## Context

The UI must render very large histories smoothly and keep an original visual identity.

## Decision

- **State:** TanStack Query for data from the core (cache, invalidation on `repo-changed` events); Zustand for UI-only state.
- **Components:** Radix primitives for behaviour and accessibility, styled by our own design tokens with CSS Modules. No pre-styled component kit.
- **Graph:** lane layout computed in Rust (`panther-graph`), page by page; the UI draws only the visible window on a Canvas 2D element next to a virtualized DOM list.

## Consequences

- Fine control over look and performance; more styling work than an off-the-shelf kit.
- Canvas drawing needs its own hit-testing for graph interactions (row-based, simple).
