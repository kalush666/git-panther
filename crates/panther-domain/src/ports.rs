//! Ports: capabilities the application needs from the outside world.
//!
//! Each port is a small trait implemented by an infrastructure adapter and
//! injected into use cases by the composition root.

use std::path::Path;

use crate::commit::{CommitDetails, CommitId, CommitNode, CommitSummary, RefLabel};
use crate::git_installation::{GitVersion, GitVersionParseError};
use crate::recent::RecentRepositories;
use crate::repository::{
    CancellationToken, CloneProgress, CloneRequest, RepositoryError, RepositorySummary,
};

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
