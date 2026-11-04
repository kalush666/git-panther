//! What a repository contains besides its own history: submodules, linked
//! worktrees, and whether it stores large files with Git LFS.

use std::path::PathBuf;

use crate::commit::CommitId;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubmoduleState {
    /// Checked out at the commit the parent repository records.
    Current,
    /// Registered but never cloned.
    NotInitialized,
    /// Checked out at a different commit than recorded.
    OutOfDate,
    /// Left with merge conflicts.
    Conflicted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Submodule {
    /// Repository-relative path with `/` separators.
    pub path: String,
    pub commit: CommitId,
    pub state: SubmoduleState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Worktree {
    pub path: PathBuf,
    /// The checked-out branch, or `None` when detached.
    pub branch: Option<String>,
    pub head: Option<CommitId>,
    /// The repository's main working tree (it cannot be removed).
    pub is_main: bool,
}

/// Whether the repository uses Git LFS, and whether this machine can follow.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct LfsStatus {
    /// `.gitattributes` sends some files through the LFS filter.
    pub used: bool,
    /// The `git lfs` extension is installed.
    pub installed: bool,
}
