---
name: clean-code
description: Git Panther clean-code rules for Rust and TypeScript — naming, small functions, no duplication, meaningful errors, no dead code. Use this skill whenever writing, refactoring or reviewing ANY code in the Git Panther repo (crates/*, apps/desktop/src-tauri, apps/desktop/src, packages/*), even for a one-line fix, and before every commit.
---

# Clean code — Git Panther

Code here is read far more often than it's written, and it outlives every milestone. Optimise for the next reader: they should understand a function from its name and signature, and a module from its file list.

## Naming

- Use domain language from `crates/panther-domain` everywhere — `CommitId`, `BranchName`, `WorkingTreeStatus`, `Hunk`. Don't invent synonyms (`sha` vs `hash` vs `oid`): one concept, one name. If the UI and the core disagree on a name, rename one.
- Functions are verbs (`stage_hunk`, `loadGraphPage`), values are nouns, booleans read as predicates (`is_detached`, `hasConflicts`).
- No abbreviations beyond universally known ones (`id`, `url`, `ui`). `repo` is fine; `rp`, `mgr`, `tmp2` are not.
- Rust: `snake_case` items, `PascalCase` types, `SCREAMING_SNAKE` consts. TS: `camelCase` values, `PascalCase` components/types, files named after their main export (`CommitRow.tsx`, `useRepoTabs.ts`).

## Functions and modules

- One job per function. If you need "and" to describe it, split it. Aim for under ~30 lines; a long `match` over an enum is the accepted exception.
- At most 3–4 parameters. More than that means a missing type — introduce a struct/options object (`CloneRequest { url, target, depth }`).
- Prefer pure functions; push I/O to the edges (infrastructure adapters, Tauri commands, React query hooks). Pure code is what makes `panther-graph` benchmarkable and the use cases testable without a repo.
- Keep nesting shallow: early returns, `?` in Rust, guard clauses in TS.
- A file should have one reason to exist. When a file passes ~300 lines, look for the second responsibility hiding in it.

## No duplication

- The second time you write the same logic, note it. The third time, extract it. Don't abstract speculatively for one caller.
- Types crossing the IPC boundary are defined **once**, in Rust, and generated into `apps/desktop/src/shared/ipc/bindings.ts` by specta. Never hand-write a TS mirror of a Rust type.
- Visual values (colours, spacing, radii) come from design tokens, never literals — see the `design-system` skill.

## Errors

- Rust: every crate has its own `thiserror` error enum with variants that name _what went wrong in domain terms_ (`GitError::BranchAlreadyExists { name }`, not `Error::Other(String)`). Use `anyhow` only in the binary's composition root and tests. Never `unwrap()`/`expect()` in non-test code unless an invariant makes failure impossible — and then the `expect` message states that invariant.
- Errors crossing IPC are serialized as `AppError { kind, message, details? }` where `kind` is a stable machine-readable code the UI can switch on, and `message` is human-readable and actionable ("Branch 'main' already exists. Choose another name.").
- TS: never swallow errors (`catch {}`). Surface them via the notification system or rethrow with context. Don't use exceptions for expected control flow — return a discriminated union.
- Wrap low-level errors with context at layer boundaries (`.map_err(|e| GitError::Open { path, source: e })`) so a log line explains itself without a debugger.

## No dead code

- Delete commented-out code, unused functions, unused exports and stale TODOs. Git remembers.
- `#[allow(dead_code)]` and `// eslint-disable` need a one-line justification next to them.
- A TODO must reference a roadmap item or issue: `// TODO(M5): stream progress instead of polling`.

## Comments

Comments explain _why_, never _what_. If you need a comment to explain what code does, rename or restructure first. Public items in `panther-domain` and `panther-application` get doc comments (`///`) because they're the project's vocabulary.

## Before committing

Run `pnpm check` (lint, typecheck, Rust fmt/clippy, all tests). Commit one logical change at a time with a Conventional Commit message (`feat(graph): …`, `fix(staging): …`, `refactor(domain): …`, `test: …`, `docs: …`, `chore: …`, `ci: …`).
