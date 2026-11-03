//! Ports: capabilities the application needs from the outside world.
//!
//! Each port is a small trait implemented by an infrastructure adapter and
//! injected into use cases by the composition root.

use std::path::Path;

use crate::git_installation::{GitVersion, GitVersionParseError};
use crate::recent::RecentRepositories;
use crate::repository::{
    CancellationToken, CloneProgress, CloneRequest, RepositoryError, RepositorySummary,
};

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
