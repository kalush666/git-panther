---
name: solid
description: How SOLID and the hexagonal layer rules apply to Git Panther's Rust core and React UI, with concrete examples from this codebase. Use this skill whenever adding a use case, port, adapter, Tauri command, crate, React feature or hosting-provider integration, whenever a change crosses layers, and when reviewing architecture — even if the task doesn't mention SOLID.
---

# SOLID — Git Panther

Git Panther is hexagonal: **domain → application → infrastructure → presentation**, dependencies pointing inward only. SOLID is how each piece stays replaceable. Read `docs/ARCHITECTURE.md` for the full layer map; this skill is the day-to-day rulebook.

## Layer map (what may depend on what)

| Crate / folder | Layer | May depend on |
|---|---|---|
| `crates/panther-domain` | domain | std, `thiserror`, `serde` only |
| `crates/panther-graph` | domain (pure algorithm) | `panther-domain` |
| `crates/panther-application` | application | `panther-domain`, `panther-graph` |
| `crates/panther-git`, `crates/panther-hosting` | infrastructure | domain (+ application for port traits it implements), external libs (`git2`, `reqwest`) |
| `apps/desktop/src-tauri` | composition root + IPC adapter | everything; it wires adapters into use cases |
| `apps/desktop/src` | presentation | generated IPC bindings only |

Never add `git2`, `tauri` or `tokio` to the domain or application crates. `tests/architecture.rs` in `src-tauri` fails the build if you do.

## S — Single responsibility

One reason to change per unit.
- A **use case** does one user intention: `StageHunk`, `CreateBranch`, `LoadGraphPage`. It orchestrates ports; it doesn't parse git output or format UI strings.
- A **Tauri command** only deserializes input, calls one use case, and maps the result/error to IPC types. No business logic.
- A **React component** renders; data fetching lives in `features/<x>/api/*.ts` hooks (TanStack Query); UI state lives in a Zustand store. `CommitGraph.tsx` draws, `useGraphPage.ts` fetches, `graphViewStore.ts` remembers scroll/selection.

## O — Open/closed

Extend by adding, not by editing switch statements.
- New hosting provider = new adapter implementing `HostingProvider` + one registration line in the composition root. No `if provider == "gitlab"` anywhere else.
- Git operations that libgit2 can't do well are routed by a dedicated adapter (`GitCli`) behind the same port — callers never know which engine ran.
- Context-menu actions on the graph are a registry of `{ id, label, isEnabled(ctx), run(ctx) }` entries, so features add actions without touching the menu component.

## L — Liskov substitution

Every implementation of a port honours the port's documented contract — same errors for the same situations, same ordering guarantees.
- `Git2Repository` and `GitCli` must both return `GitError::NotARepository` for a non-repo path, not a generic I/O error.
- Shared contract tests live in `crates/panther-git/tests/contract/` and run against *every* `GitRepository` implementation (and the in-memory fake used by application tests). If a fake can't satisfy the contract, the contract is wrong — fix it explicitly.

## I — Interface segregation

Small, role-based ports instead of one god trait.
- Split git access by capability: `CommitLog` (read history), `WorkingTree` (status/stage/unstage), `RefStore` (branches/tags), `RemoteSync` (fetch/pull/push), `StashStore`. A concrete adapter may implement several; a use case depends only on what it uses.
- `GitRepository` is a convenience supertrait for wiring, not something use cases take as a parameter.
- On the UI side, components take the narrow props they render (`CommitRowProps { summary, author, time, lanes }`), not the whole `Commit` + store.

## D — Dependency inversion

High-level policy owns the interfaces; low-level details implement them.
- Ports (traits) are declared in `panther-domain` (`ports/` module). Use cases receive them via constructor generics or `Arc<dyn Trait>`; they never construct adapters.
- Only `apps/desktop/src-tauri/src/composition.rs` knows concrete types. Swapping libgit2 for gitoxide touches that file and a new crate — nothing else.
- Time, filesystem and process spawning are ports too (`Clock`, `FileSystem`, `ProcessRunner`), which is what makes use-case tests deterministic.

## Worked example — adding "rename branch"

1. Domain: add `BranchName` validation rules if new; extend `RefStore` with `rename_branch(&self, from: &BranchName, to: &BranchName) -> Result<(), GitError>` and document its errors.
2. Application: `RenameBranch` use case — validates, checks the target doesn't exist via `RefStore`, calls rename. Unit-test it with the in-memory fake.
3. Infrastructure: implement in `Git2Repository`; add a contract test case; integration-test against a temp repo.
4. Presentation: Tauri command `rename_branch` → use case; regenerate bindings; React mutation hook invalidates the `refs` query; UI action registered in the branch context-menu registry.

If a step forces you to edit an unrelated layer, stop and reconsider the design before continuing.
