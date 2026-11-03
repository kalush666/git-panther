# Git Panther — Roadmap

Git Panther must work fully on closed networks ([ADR 5](adr/0005-closed-network-operation.md)); every item below respects that.

Each milestone is developed on its own branch with small Conventional Commits, ends with a demo and your approval, and is merged to `main` only after that. Ship target for the MVP is **Windows**; CI builds on Windows, macOS and Linux.

Status legend: ✅ done · 🚧 in progress · ⏳ planned

## MVP

### ✅ M0 — Foundation

- Toolchain (Rust stable, Node, pnpm), repo, `.gitignore`, Conventional Commits
- Project skills: `clean-code`, `solid`, `design-system`
- `ARCHITECTURE.md`, `ROADMAP.md`, ADRs
- Cargo workspace (domain, application, git crates; `panther-graph` arrives with M2) + Tauri 2 app + pnpm workspace
- Lint/format (clippy, rustfmt, ESLint + boundaries, Prettier), strict TS, architecture test
- specta-generated IPC bindings, `AppError`, git-on-PATH check
- Design tokens package, dark/light/system theming, app shell with empty state
- GitHub Actions CI (lint, test, build on 3 OSes)

**Demo:** the app launches, shows the Git Panther shell, detects git, switches themes; `pnpm check` is green.

Open items carried forward: the `tauri-driver` smoke test of the real window moves to M7 (E2E currently drives the UI in a browser with mocked IPC), and the CI workflow has not run yet because the repo has no remote.

![M0 shell, dark theme](screenshots/m0-dark.png)

### ✅ M1 — Repositories

Open / init / clone (with progress, cancellable), repo tabs, recent repositories, file watcher.

**Demo:** open, init or clone from the start page; each repository opens in a persisted tab showing its current branch; recent repositories are remembered across restarts; external changes refresh the tab.

![M1 start page](screenshots/m1-start.png)

### ✅ M2 — Commit graph

Paged log, incremental lane layout (`panther-graph`) with benchmarks, canvas graph + virtualized list, commit details panel, 100k-commit fixture.

**Demo:** history renders as a lane graph with author-initial nodes, a Branch / Tag column joined to each commit, body previews, keyboard navigation and a details panel; optional columns (Author, Date / Time, SHA) are chosen from the column menu. On a generated 100k-commit repository the first page appears in ~0.4 s (~0.63 s without a commit-graph file) and later pages in ~22 ms.

![M2 commit graph](screenshots/m2-graph.png)

### ✅ M3 — Working tree & diffs

Status, stage/unstage file and hunk, discard, commit / amend, unified and split diff viewer with word highlights.

**Demo:** a "// Working copy" row above the graph opens the staging panel; files open a unified or split diff with word highlights and per-hunk Stage / Unstage / Discard; commits run through the git CLI so hooks and signing apply; commit details open per-commit file diffs.

### ⏳ M4 — Branches

Create, checkout, rename, delete; sidebar tree; graph context menus.

### ⏳ M5 — Remotes

Fetch, pull (ff / merge / rebase setting), push with progress; ahead/behind badges; clear auth error surfaces.

### ⏳ M6 — Stash & conflicts

Stash save / apply / pop / drop; basic conflict view (take ours / theirs / mark resolved).

### ⏳ M7 — Settings & release

Settings screen (theme, git path, pull mode, fonts), E2E flows, self-contained Windows installer (NSIS/MSI, embedded WebView2 offline installer) from CI, verified on a machine without internet.

## Later (to be prioritised together)

- Interactive rebase (drag-and-drop)
- Cherry-pick, revert, reset from the graph
- 3-way merge-conflict editor
- Blame and file history
- Tags, submodules, Git LFS
- SSH / GPG key management, in-app credentials
- Pull-request integration via `HostingProvider` for self-hosted servers (GitHub Enterprise Server, GitLab self-managed, Bitbucket Data Center, Azure DevOps Server) with configurable URLs and custom CA certificates
- Workspaces, undo/redo of git actions
- Command palette, configurable keyboard shortcuts
- Updates from an internal update server (no public update checks), macOS/Linux installers and signing
