# 3. libgit2 for local operations, git CLI for network

Date: 2026-11-03 · Status: Accepted

## Context
libgit2 is fast and in-process but weak at auth (credential helpers, SSH agents, GCM), hooks, rebase and LFS. The git CLI has perfect parity but is slower per call and its output must be parsed.

## Decision
Access git through small capability ports. Implement them with `git2-rs` for local reads/writes and with the system `git` CLI for clone/fetch/pull/push (and later rebase/LFS). A routing adapter picks the engine per port. The system git (≥ 2.40) is a runtime requirement; it is not bundled.

## Consequences
- Authentication "just works" with the user's existing git setup; no credential handling in the MVP.
- Two adapters must honour identical contracts — enforced by a shared contract test suite.
- Users without git get a clear install prompt at startup.
