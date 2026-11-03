//! The single error shape that crosses the IPC boundary.

use panther_domain::ports::GitProbeError;
use panther_domain::repository::RepositoryError;
use serde::Serialize;
use specta::Type;

/// Stable, machine-readable error categories the UI can switch on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AppErrorKind {
    GitProbeFailed,
    NotFound,
    NotARepository,
    AlreadyARepository,
    DestinationNotEmpty,
    InvalidRemoteUrl,
    CloneFailed,
    Cancelled,
    GitFailed,
    StorageFailed,
    WatchFailed,
    Internal,
}

/// An error returned by any IPC command.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub kind: AppErrorKind,
    /// Human-readable, actionable description.
    pub message: String,
}

impl AppError {
    pub fn new(kind: AppErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn background_task_failed(error: impl std::fmt::Display) -> Self {
        Self::new(
            AppErrorKind::Internal,
            format!("A background task stopped unexpectedly: {error}"),
        )
    }
}

impl From<GitProbeError> for AppError {
    fn from(error: GitProbeError) -> Self {
        Self::new(
            AppErrorKind::GitProbeFailed,
            format!("Git is installed but could not be checked. {error}"),
        )
    }
}

impl From<RepositoryError> for AppError {
    fn from(error: RepositoryError) -> Self {
        let kind = match error {
            RepositoryError::NotFound { .. } => AppErrorKind::NotFound,
            RepositoryError::NotARepository { .. } => AppErrorKind::NotARepository,
            RepositoryError::AlreadyARepository { .. } => AppErrorKind::AlreadyARepository,
            RepositoryError::DestinationNotEmpty { .. } => AppErrorKind::DestinationNotEmpty,
            RepositoryError::InvalidRemoteUrl { .. } => AppErrorKind::InvalidRemoteUrl,
            RepositoryError::CloneFailed { .. } => AppErrorKind::CloneFailed,
            RepositoryError::Cancelled => AppErrorKind::Cancelled,
            RepositoryError::Git { .. } => AppErrorKind::GitFailed,
            RepositoryError::Storage { .. } => AppErrorKind::StorageFailed,
        };
        Self::new(kind, error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn keeps_the_domain_message_and_a_stable_kind() {
        let error = AppError::from(RepositoryError::NotARepository {
            path: PathBuf::from("projects"),
        });
        assert_eq!(error.kind, AppErrorKind::NotARepository);
        assert_eq!(error.message, "projects is not a git repository.");
    }
}
