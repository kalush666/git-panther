# Git Panther — Roadmap

Each milestone is developed on its own branch with small Conventional Commits, ends with a demo and your approval, and is merged to `main` only after that. Ship target for the MVP is **Windows**; CI builds on Windows, macOS and Linux.

Status legend: ✅ done · 🚧 in progress · ⏳ planned

## MVP

### 🚧 M0 — Foundation
- Toolchain (Rust stable, Node, pnpm), repo, `.gitignore`, Conventional Commits
- Project skills: `clean-code`, `solid`, `design-system`
- `ARCHITECTURE.md`, `ROADMAP.md`, ADRs
- Cargo workspace (domain, graph, application, git crates) + Tauri 2 app + pnpm workspace
- Lint/format (clippy, rustfmt, ESLint + boundaries, Prettier), strict TS, architecture test
- specta-generated IPC bindings, `AppError`, git-on-PATH check
- Design tokens package, dark/light/system theming, app shell with empty state
- GitHub Actions CI (lint, test, build on 3 OSes)

**Demo:** the app launches, shows the Git Panther shell, detects git, switches themes; `pnpm check` is green.

### ⏳ M1 — Repositories
Open / init / clone (with progress, cancellable), repo tabs, recent repositories, file watcher.

### ⏳ M2 — Commit graph
Paged log, incremental lane layout (`panther-graph`) with benchmarks, canvas graph + virtualized list, commit details panel, 100k-commit fixture.

### ⏳ M3 — Working tree & diffs
Status, stage/unstage file and hunk, discard, commit / amend, unified and split diff viewer with word highlights.

### ⏳ M4 — Branches
Create, checkout, rename, delete; sidebar tree; graph context menus.

### ⏳ M5 — Remotes
Fetch, pull (ff / merge / rebase setting), push with progress; ahead/behind badges; clear auth error surfaces.

### ⏳ M6 — Stash & conflicts
Stash save / apply / pop / drop; basic conflict view (take ours / theirs / mark resolved).

### ⏳ M7 — Settings & release
Settings screen (theme, git path, pull mode, fonts), E2E flows, Windows installer (NSIS/MSI) from CI.

## Later (to be prioritised together)
- Interactive rebase (drag-and-drop)
- Cherry-pick, revert, reset from the graph
- 3-way merge-conflict editor
- Blame and file history
- Tags, submodules, Git LFS
- SSH / GPG key management, in-app credentials
- Pull-request integration (GitHub, GitLab, Bitbucket, Azure DevOps) via `HostingProvider`
- Workspaces, undo/redo of git actions
- Command palette, configurable keyboard shortcuts
- Auto-updates, macOS/Linux installers and signing
