//! Stashed changes and operations interrupted by conflicts.

use crate::commit::CommitId;

/// One entry of the stash, newest first (`stash@{0}`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stash {
    /// Position in the stash list; changes when newer entries are added or dropped.
    pub index: usize,
    /// As git wrote it, e.g. `On main: half-done login form`.
    pub message: String,
    pub id: CommitId,
}

/// An operation that stopped part-way and is waiting for the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Operation {
    Merge,
    Rebase,
    CherryPick,
    Revert,
}

/// Which version of a conflicted file to keep, from the user's point of view.
///
/// Git's "ours" and "theirs" swap meaning during a rebase; these names do not.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictSide {
    /// The work that was checked out before the operation started
    /// (during a rebase: the local commit being replayed).
    Mine,
    /// The work being brought in (the merged branch, the upstream being
    /// rebased onto, the stash being applied).
    Incoming,
}
