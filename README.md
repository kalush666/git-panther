# Git Panther

A fast, cross-platform desktop Git client. Built with Tauri 2, a Rust core, and a React UI.

> Status: early development (Milestone 0 — Foundation). See [docs/ROADMAP.md](docs/ROADMAP.md).

## Requirements

- [git](https://git-scm.com/) ≥ 2.40 on `PATH` (Git Panther delegates network and auth to system git)
- [Rust](https://rustup.rs/) stable (MSVC toolchain on Windows)
- [Node.js](https://nodejs.org/) ≥ 22 and [pnpm](https://pnpm.io/) ≥ 10

## Getting started

```bash
pnpm install
pnpm dev          # runs the desktop app (tauri dev)
pnpm check        # lint + typecheck + all tests (TS and Rust)
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decision records](docs/adr/)
