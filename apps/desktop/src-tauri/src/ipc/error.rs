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
    CommitNotFound,
    NothingToCommit,
    HunkOutdated,
    IdentityMissing,
    CommitFailed,
    InvalidBranchName,
    BranchExists,
    BranchNotFound,
    BranchNotMerged,
    CannotDeleteCurrentBranch,
    CheckoutConflict,
    AuthenticationFailed,
    NetworkFailed,
    PushRejected,
    NoUpstream,
    NotFastForward,
    PullConflict,
    NoRemote,
    NothingToStash,
    StashNotFound,
    StashConflict,
    NoOperationInProgress,
    UnresolvedConflicts,
    InvalidGitExecutable,
    InvalidServer,
    InvalidCredentials,
    CredentialHelperMissing,
    OperationConflict,
    InvalidTagName,
    TagExists,
    TagNotFound,
    NothingToUndo,
    NothingToRedo,
    UndoOutdated,
    InvalidRebasePlan,
    InvalidRemoteName,
    RemoteExists,
    RemoteNotFound,
    WorktreeFailed,
    InvalidIdentity,
    HostingUnauthorized,
    HostingNotConnected,
    HostingLoginUnsupported,
    NoHostedProject,
    HostingFailed,
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
            RepositoryError::CommitNotFound { .. } => AppErrorKind::CommitNotFound,
            RepositoryError::NothingToCommit => AppErrorKind::NothingToCommit,
            RepositoryError::HunkOutdated { .. } => AppErrorKind::HunkOutdated,
            RepositoryError::IdentityMissing => AppErrorKind::IdentityMissing,
            RepositoryError::CommitFailed { .. } => AppErrorKind::CommitFailed,
            RepositoryError::InvalidBranchName(_) => AppErrorKind::InvalidBranchName,
            RepositoryError::BranchExists { .. } => AppErrorKind::BranchExists,
            RepositoryError::BranchNotFound { .. } => AppErrorKind::BranchNotFound,
            RepositoryError::BranchNotMerged { .. } => AppErrorKind::BranchNotMerged,
            RepositoryError::CannotDeleteCurrentBranch { .. } => {
                AppErrorKind::CannotDeleteCurrentBranch
            }
            RepositoryError::CheckoutConflict { .. } => AppErrorKind::CheckoutConflict,
            RepositoryError::AuthenticationFailed { .. } => AppErrorKind::AuthenticationFailed,
            RepositoryError::NetworkFailed { .. } => AppErrorKind::NetworkFailed,
            RepositoryError::PushRejected { .. } => AppErrorKind::PushRejected,
            RepositoryError::NoUpstream { .. } => AppErrorKind::NoUpstream,
            RepositoryError::NotFastForward => AppErrorKind::NotFastForward,
            RepositoryError::PullConflict { .. } => AppErrorKind::PullConflict,
            RepositoryError::NoRemote => AppErrorKind::NoRemote,
            RepositoryError::NothingToStash => AppErrorKind::NothingToStash,
            RepositoryError::StashNotFound { .. } => AppErrorKind::StashNotFound,
            RepositoryError::StashConflict { .. } => AppErrorKind::StashConflict,
            RepositoryError::NoOperationInProgress => AppErrorKind::NoOperationInProgress,
            RepositoryError::UnresolvedConflicts => AppErrorKind::UnresolvedConflicts,
            RepositoryError::InvalidGitExecutable { .. } => AppErrorKind::InvalidGitExecutable,
            RepositoryError::InvalidServer(_) => AppErrorKind::InvalidServer,
            RepositoryError::InvalidCredentials(_) => AppErrorKind::InvalidCredentials,
            RepositoryError::CredentialHelperMissing => AppErrorKind::CredentialHelperMissing,
            RepositoryError::OperationConflict { .. } => AppErrorKind::OperationConflict,
            RepositoryError::InvalidTagName(_) => AppErrorKind::InvalidTagName,
            RepositoryError::TagExists { .. } => AppErrorKind::TagExists,
            RepositoryError::TagNotFound { .. } => AppErrorKind::TagNotFound,
            RepositoryError::NothingToUndo => AppErrorKind::NothingToUndo,
            RepositoryError::NothingToRedo => AppErrorKind::NothingToRedo,
            RepositoryError::UndoOutdated => AppErrorKind::UndoOutdated,
            RepositoryError::InvalidRebasePlan(_) => AppErrorKind::InvalidRebasePlan,
            RepositoryError::InvalidRemoteName(_) => AppErrorKind::InvalidRemoteName,
            RepositoryError::RemoteExists { .. } => AppErrorKind::RemoteExists,
            RepositoryError::RemoteNotFound { .. } => AppErrorKind::RemoteNotFound,
            RepositoryError::WorktreeFailed { .. } => AppErrorKind::WorktreeFailed,
            RepositoryError::InvalidIdentity(_) => AppErrorKind::InvalidIdentity,
            RepositoryError::HostingUnauthorized { .. } => AppErrorKind::HostingUnauthorized,
            RepositoryError::HostingNotConnected { .. } => AppErrorKind::HostingNotConnected,
            RepositoryError::HostingLoginUnsupported { .. } => {
                AppErrorKind::HostingLoginUnsupported
            }
            RepositoryError::NoHostedProject => AppErrorKind::NoHostedProject,
            RepositoryError::HostingFailed { .. } => AppErrorKind::HostingFailed,
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
