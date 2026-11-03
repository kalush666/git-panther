# Git Panther — Architecture

Git Panther is a desktop Git client built as a **Tauri 2** application: a Rust core that owns all domain logic and git access, and a React + TypeScript UI that only presents state and forwards user intent.

## Goals that shape the design

1. **Replaceable git engine.** libgit2 today, the git CLI where libgit2 is weak, possibly gitoxide tomorrow — without touching use cases or UI.
2. **Scale.** Repositories with 100k+ commits must open fast and scroll at 60 fps.
3. **Pluggable integrations.** Self-hosted GitHub Enterprise Server, GitLab, Bitbucket Data Center and Azure DevOps Server are adapters behind one interface.
4. **Testability.** Domain and use cases are tested without a real repo or a window.
5. **Closed networks.** The app works fully without internet access ([ADR 5](adr/0005-closed-network-operation.md)).

## Layers (hexagonal / clean architecture)

```
             ┌──────────────────────────────────────────────┐
             │  presentation  (apps/desktop/src — React)    │
             └───────────────▲──────────────────────────────┘
                             │ typed IPC (generated bindings)
┌────────────────────────────┴─────────────────────────────────────┐
│ composition root + IPC adapter  (apps/desktop/src-tauri)         │
│   Tauri commands/events · job runner · wires adapters → use cases│
└──────▲───────────────────────────────▲───────────────────────────┘
       │                               │
┌──────┴──────────────┐      ┌─────────┴──────────────────────────┐
│ infrastructure      │      │ application  (panther-application) │
│ panther-git         │─────▶│   use cases: OpenRepository,       │
│ panther-hosting     │impl. │   LoadGraphPage, StageHunk, …      │
└─────────────────────┘ ports└─────────▲──────────────────────────┘
                                       │
                       ┌───────────────┴───────────────────────────┐
                       │ domain  (panther-domain, panther-graph)   │
                       │   entities · value objects · ports        │
                       └───────────────────────────────────────────┘
```

Dependencies point **inward only**. The domain knows nothing about git2, Tauri, Tokio, or the filesystem.

| Unit                               | Layer                | Responsibility                                                                                                           | Allowed dependencies              |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `crates/panther-domain`            | domain               | Entities (`Commit`, `Branch`, `Repository`), value objects (`CommitId`, `BranchName`), domain errors, **ports** (traits) | `serde`, `thiserror`              |
| `crates/panther-graph`             | domain               | Pure, incremental commit-graph lane layout                                                                               | `panther-domain`                  |
| `crates/panther-application`       | application          | Use cases orchestrating ports                                                                                            | `panther-domain`, `panther-graph` |
| `crates/panther-git`               | infrastructure       | `Git2Repository` (libgit2) and `GitCli` adapters                                                                         | domain, `git2`                    |
| `crates/panther-hosting` _(later)_ | infrastructure       | `HostingProvider` adapters                                                                                               | domain, HTTP client               |
| `apps/desktop/src-tauri`           | composition root     | Builds the object graph, exposes commands/events, runs jobs off the UI thread                                            | everything                        |
| `apps/desktop/src`                 | presentation         | React UI, Zustand UI state, TanStack Query cache                                                                         | generated bindings                |
| `packages/design-tokens`           | presentation support | Design tokens → CSS variables                                                                                            | none                              |

### Enforcement

- **Rust:** Cargo makes illegal dependencies impossible to compile. `apps/desktop/src-tauri/tests/architecture.rs` additionally reads `cargo metadata` and fails if a forbidden crate (e.g. `git2`, `tauri`, `tokio`) appears in the dependency tree of `panther-domain` / `panther-graph` / `panther-application`.
- **TypeScript:** `eslint-plugin-boundaries` enforces `app → features → shared` and forbids importing Tauri APIs anywhere except `shared/ipc`.
- **CI** runs both on every push.

## Ports

Ports are small, capability-based traits declared in `panther-domain::ports` (see the `solid` skill for rationale):

| Port                                   | Capability                                                 |
| -------------------------------------- | ---------------------------------------------------------- |
| `RepositoryOpener`                     | open / init / discover a repository                        |
| `CommitLog`                            | paged history walk, commit details                         |
| `WorkingTree`                          | status, stage/unstage file & hunk, discard                 |
| `RefStore`                             | branches, tags, HEAD, checkout                             |
| `CommitWriter`                         | create / amend commits                                     |
| `RemoteSync`                           | clone, fetch, pull, push (progress-reporting, cancellable) |
| `StashStore`                           | stash list / save / apply / pop / drop                     |
| `DiffProvider`                         | file and hunk diffs, word-level highlights                 |
| `HostingProvider` _(later)_            | pull requests, avatars, repo metadata                      |
| `Clock`, `FileSystem`, `ProcessRunner` | deterministic seams for tests                              |

`GitRepository` is a supertrait combining the git ports for convenient wiring; use cases depend only on the ports they need.

### Git engine routing

`panther-git` provides two adapters that satisfy the same contracts:

- **`Git2Repository`** (libgit2 via `git2-rs`): history, status, diff, staging, refs, local commits, stash — fast, in-process.
- **`GitCli`** (spawns the system `git`): clone/fetch/pull/push (so Git Credential Manager, ssh-agent and the user's config just work), hooks, and later rebase/LFS.

The composition root builds a `RoutedGitRepository` that delegates each port to the right engine. A shared **contract test suite** runs against both adapters and the in-memory fake.

Git is a hard runtime requirement: at startup the app runs `git --version`, requires ≥ 2.40, and shows a friendly install screen otherwise.

## IPC

- Tauri commands are thin: deserialize → call use case → map result. Types are defined once in Rust and exported to `apps/desktop/src/shared/ipc/bindings.ts` with `specta` / `tauri-specta`; the generated file is committed and CI fails if it's stale.
- Errors cross IPC as `AppError { kind, message, details? }` with a stable `kind` enum the UI can switch on.
- Long-running operations (clone, fetch, push, big log walks) are **jobs**: the command returns a `JobId` immediately; progress, completion and failure arrive as typed events; jobs are cancellable.

## Concurrency & performance

- No git work on the Tauri main thread. Commands are `async` and run blocking git calls on Tokio's blocking pool; one `Mutex`-guarded handle per open repository serialises writes, while reads use separate libgit2 handles.
- **History is paged.** `LoadGraphPage { repo, cursor, size }` walks at most one page (default 2,000 commits) per call. The graph crate keeps the lane state at the end of each page so the next page continues layout incrementally — O(page) work, never O(history).
- **Caching:** per-repo cache keyed by the hash of all refs; pages are reused until refs change. Commit details and diffs are cached LRU.
- **Rendering:** the commit list is virtualized (only visible rows + overscan exist in the DOM); the graph column is drawn on a single `<canvas>` for the visible window. Text stays in the DOM for selection and accessibility.
- **Diffs** load per file on demand; files over a size/line threshold or binary files show a placeholder with an explicit "load anyway".
- **File watching:** `notify` watches the work tree and `.git`; events are debounced (~300 ms) and emitted as `repo-changed { repo, scopes }`, which invalidate the matching TanStack Query keys.
- **Benchmarks:** `criterion` benches on a generated 100k-commit repo; budgets: first graph page < 300 ms, full open < 1 s, layout of a 2k page < 20 ms.

## Presentation (React)

```
apps/desktop/src/
  app/            # shell: providers, layout, routing between tabs, theme
  features/       # repo-tabs, graph, staging, diff, branches, remotes, stash, conflicts, settings
    <feature>/
      api/        # TanStack Query hooks wrapping IPC
      model/      # Zustand stores, pure view-model helpers
      ui/         # components
  shared/
    ipc/          # generated bindings + the only place that imports @tauri-apps/api
    ui/           # design-system components (Radix + CSS Modules)
    lib/          # generic helpers
```

- **Server state** (anything that comes from the core) lives in TanStack Query. **UI state** (open tabs, selection, panel sizes, theme) lives in Zustand, persisted per user.
- Styling follows the `design-system` skill: tokens from `packages/design-tokens`, Radix primitives for behaviour, CSS Modules for look.

## Testing strategy

| Level                          | Tooling                                                                                               | What                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Domain / application unit      | `cargo test`                                                                                          | value-object rules, graph layout, use cases with in-memory fakes  |
| Adapter contract + integration | `cargo test` + `tempfile` repos                                                                       | every port behaviour against real temp repositories, both engines |
| UI unit                        | Vitest + Testing Library                                                                              | components, stores, query hooks with mocked IPC                   |
| E2E                            | Playwright against the Vite build with a mocked IPC backend; one `tauri-driver` smoke test on Windows | key user flows                                                    |
| Architecture                   | `tests/architecture.rs`, ESLint boundaries                                                            | layer rules                                                       |
| Performance                    | `criterion`                                                                                           | graph layout and log paging budgets                               |

## Cross-cutting

- **Logging:** `tracing` in Rust, written to a rotating file in the app log dir; UI errors forwarded to the same sink.
- **Settings:** stored as JSON in the OS app-config dir, versioned with migrations.
- **Security:** Tauri capabilities restrict the UI to our own commands and the folder picker; no shell or filesystem plugins exposed to the webview. Credentials are never handled in-app in the MVP — they stay with system git.
- **Closed-network operation:** no runtime traffic except to user-configured git remotes (and, later, user-configured self-hosted servers). All assets are bundled, the CSP allows only `'self'`, and the Windows installer embeds the WebView2 offline installer. Enforced by the E2E network guard (`apps/desktop/e2e/fixtures.ts`) and `pnpm check:offline`.

Decisions are recorded in [docs/adr](adr/).
