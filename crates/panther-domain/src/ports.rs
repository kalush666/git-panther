//! Ports: capabilities the application needs from the outside world.
//!
//! Each port is a small trait implemented by an infrastructure adapter and
//! injected into use cases by the composition root.

use std::path::Path;

use crate::branch::{Branch, BranchName};
use crate::commit::{CommitDetails, CommitId, CommitNode, CommitSummary, RefLabel};
use crate::git_installation::{GitVersion, GitVersionParseError};
use crate::recent::RecentRepositories;
use crate::remote::{PullStrategy, Remote};
use crate::repository::{
    CancellationToken, CloneProgress, CloneRequest, RepositoryError, RepositorySummary,
};
use crate::working_tree::{CommitMessage, DiffSide, FileDiff, HunkRef, WorkingTreeStatus};

/// What to do with a single hunk.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HunkAction {
    /// Add an unstaged hunk to the index.
    Stage,
    /// Remove a staged hunk from the index.
    Unstage,
    /// Throw away an unstaged hunk from the work tree.
    Discard,
}

/// Reads and changes uncommitted work.
pub trait WorkingTree: Send + Sync {
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn status(&self, repository: &Path) -> Result<WorkingTreeStatus, RepositoryError>;

    /// The staged or unstaged diff of one file.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn diff(
        &self,
        repository: &Path,
        path: &str,
        side: DiffSide,
    ) -> Result<FileDiff, RepositoryError>;

    /// Stages whole files, including deletions and untracked files.
    ///
    /// # Errors
    /// [`RepositoryError`] when the index cannot be updated.
    fn stage(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError>;

    /// Moves staged changes of whole files back to the work tree.
    ///
    /// # Errors
    /// [`RepositoryError`] when the index cannot be updated.
    fn unstage(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError>;

    /// Throws away unstaged changes; untracked files are deleted.
    ///
    /// # Errors
    /// [`RepositoryError`] when files cannot be restored.
    fn discard(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError>;

    /// Stages, unstages or discards one hunk.
    ///
    /// # Errors
    /// [`RepositoryError::HunkOutdated`] if the hunk no longer matches.
    fn apply_hunk(
        &self,
        repository: &Path,
        hunk: &HunkRef,
        action: HunkAction,
    ) -> Result<(), RepositoryError>;
}

/// Lists and changes branches.
pub trait BranchStore: Send + Sync {
    /// Local branches first, then remote branches, each sorted by name.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn branches(&self, repository: &Path) -> Result<Vec<Branch>, RepositoryError>;

    /// Creates `name` at `start`, optionally switching to it.
    ///
    /// # Errors
    /// [`RepositoryError::BranchExists`] or a checkout error.
    fn create(
        &self,
        repository: &Path,
        name: &BranchName,
        start: &CommitId,
        checkout: bool,
    ) -> Result<(), RepositoryError>;

    /// Switches to a local branch. For a remote branch such as
    /// `origin/topic`, creates and switches to a local `topic` tracking it.
    ///
    /// # Errors
    /// [`RepositoryError::CheckoutConflict`] if uncommitted changes would be lost.
    fn checkout(&self, repository: &Path, name: &str) -> Result<(), RepositoryError>;

    /// # Errors
    /// [`RepositoryError::BranchExists`] or [`RepositoryError::BranchNotFound`].
    fn rename(
        &self,
        repository: &Path,
        from: &BranchName,
        to: &BranchName,
    ) -> Result<(), RepositoryError>;

    /// Deletes a local branch; without `force`, only if it is merged.
    ///
    /// # Errors
    /// [`RepositoryError::BranchNotMerged`] or
    /// [`RepositoryError::CannotDeleteCurrentBranch`].
    fn delete(
        &self,
        repository: &Path,
        name: &BranchName,
        force: bool,
    ) -> Result<(), RepositoryError>;
}

/// Exchanges commits with remotes. Every operation reports progress and can
/// be cancelled.
pub trait RemoteSync: Send + Sync {
    /// # Errors
    /// [`RepositoryError`] when the configuration cannot be read.
    fn remotes(&self, repository: &Path) -> Result<Vec<Remote>, RepositoryError>;

    /// Fetches from every remote and prunes deleted remote branches.
    ///
    /// # Errors
    /// [`RepositoryError::AuthenticationFailed`], [`RepositoryError::NetworkFailed`]
    /// or [`RepositoryError::Cancelled`].
    fn fetch(
        &self,
        repository: &Path,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError>;

    /// Pulls the current branch's upstream.
    ///
    /// # Errors
    /// [`RepositoryError::NoUpstream`], [`RepositoryError::NotFastForward`],
    /// [`RepositoryError::PullConflict`] or any fetch error.
    fn pull(
        &self,
        repository: &Path,
        strategy: PullStrategy,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError>;

    /// Pushes the current branch, setting its upstream on the first push.
    ///
    /// # Errors
    /// [`RepositoryError::PushRejected`], [`RepositoryError::NoRemote`] or any
    /// network error.
    fn push(
        &self,
        repository: &Path,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError>;
}

/// Creates commits.
pub trait CommitWriter: Send + Sync {
    /// Commits the index, or replaces the last commit when `amend` is set.
    ///
    /// # Errors
    /// [`RepositoryError::NothingToCommit`], [`RepositoryError::IdentityMissing`]
    /// or [`RepositoryError::CommitFailed`] (e.g. a rejecting hook).
    fn commit(
        &self,
        repository: &Path,
        message: &CommitMessage,
        amend: bool,
    ) -> Result<CommitId, RepositoryError>;

    /// The message of the HEAD commit, used to prefill an amend.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn head_message(&self, repository: &Path) -> Result<Option<String>, RepositoryError>;
}

/// Reads commit history.
pub trait CommitLog: Send + Sync {
    /// A token that changes whenever any ref or HEAD moves, so callers can
    /// cache history until it does.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn refs_fingerprint(&self, repository: &Path) -> Result<String, RepositoryError>;

    /// Every commit reachable from HEAD, branches, remote branches and tags,
    /// children before parents and newest first.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn history(&self, repository: &Path) -> Result<Vec<CommitNode>, RepositoryError>;

    /// Summaries for `ids`, in the same order.
    ///
    /// # Errors
    /// [`RepositoryError::CommitNotFound`] if an id is unknown.
    fn summaries(
        &self,
        repository: &Path,
        ids: &[CommitId],
    ) -> Result<Vec<CommitSummary>, RepositoryError>;

    /// Branches and tags, each with the commit it points at.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn refs(&self, repository: &Path) -> Result<Vec<RefLabel>, RepositoryError>;

    /// The full message, people and changed files of one commit.
    ///
    /// # Errors
    /// [`RepositoryError::CommitNotFound`] if `id` is unknown.
    fn details(&self, repository: &Path, id: &CommitId) -> Result<CommitDetails, RepositoryError>;

    /// How `path` changed in commit `id` compared to its first parent.
    ///
    /// # Errors
    /// [`RepositoryError::CommitNotFound`] if `id` is unknown.
    fn commit_file_diff(
        &self,
        repository: &Path,
        id: &CommitId,
        path: &str,
    ) -> Result<FileDiff, RepositoryError>;
}

/// Opens existing repositories and creates new ones on the local disk.
pub trait RepositoryOpener: Send + Sync {
    /// Opens the repository containing `path` and summarizes it.
    ///
    /// # Errors
    /// [`RepositoryError::NotFound`] if `path` does not exist and
    /// [`RepositoryError::NotARepository`] if it is not inside a repository.
    fn open(&self, path: &Path) -> Result<RepositorySummary, RepositoryError>;

    /// Creates a new repository in `path` (created if missing).
    ///
    /// # Errors
    /// [`RepositoryError::AlreadyARepository`] if `path` already is one.
    fn init(&self, path: &Path) -> Result<RepositorySummary, RepositoryError>;
}

/// Copies a remote repository to the local disk.
pub trait RepositoryCloner: Send + Sync {
    /// Clones `request.url` into `request.destination`, reporting progress
    /// until done or until `cancel` is triggered.
    ///
    /// # Errors
    /// [`RepositoryError::DestinationNotEmpty`], [`RepositoryError::Cancelled`]
    /// or [`RepositoryError::CloneFailed`] with git's explanation.
    fn clone_repository(
        &self,
        request: &CloneRequest,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError>;
}

/// Persists the recent-repositories list between sessions.
pub trait RecentRepositoryStore: Send + Sync {
    /// # Errors
    /// [`RepositoryError::Storage`] when stored data cannot be read.
    fn load(&self) -> Result<RecentRepositories, RepositoryError>;

    /// # Errors
    /// [`RepositoryError::Storage`] when the list cannot be written.
    fn save(&self, recent: &RecentRepositories) -> Result<(), RepositoryError>;
}

/// Detects the git executable installed on the user's system.
pub trait GitBinaryProbe: Send + Sync {
    /// Returns the installed git version, or `Ok(None)` when no git
    /// executable can be found.
    ///
    /// # Errors
    /// Returns [`GitProbeError`] when git exists but cannot be queried.
    fn installed_version(&self) -> Result<Option<GitVersion>, GitProbeError>;
}

/// Git was found but its version could not be determined.
#[derive(Debug, thiserror::Error)]
pub enum GitProbeError {
    #[error("`git --version` failed: {reason}")]
    ExecutionFailed { reason: String },
    #[error(transparent)]
    UnrecognizedVersion(#[from] GitVersionParseError),
}
