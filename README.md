# Git Panther

A fast, cross-platform desktop Git client. Built with Tauri 2, a Rust core, and a React UI.

> Status: MVP (milestones M0–M7) complete. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Requirements

- [git](https://git-scm.com/) ≥ 2.40 on `PATH` (Git Panther delegates network and auth to system git)
- [Rust](https://rustup.rs/) stable (MSVC toolchain on Windows)
- [Node.js](https://nodejs.org/) ≥ 22 and [pnpm](https://pnpm.io/) ≥ 10

## Getting started

```bash
pnpm install
pnpm dev          # runs the desktop app (tauri dev)
pnpm check        # lint + typecheck + all tests (TS and Rust)
pnpm test:e2e     # Playwright against the browser build with a mocked core
```

## Installers

`pnpm --filter @git-panther/desktop tauri build` produces self-contained Windows installers (NSIS `.exe` and `.msi`) in `target/release/bundle/`. Each embeds the WebView2 offline installer, so it installs on a machine without internet. The Release workflow builds them on every push to `main` and attaches them to a draft release for `v*` tags. See [Offline verification](docs/OFFLINE-VERIFICATION.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decision records](docs/adr/)
- [Offline verification](docs/OFFLINE-VERIFICATION.md)
