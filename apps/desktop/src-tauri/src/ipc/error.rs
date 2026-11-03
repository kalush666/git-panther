//! The single error shape that crosses the IPC boundary.

use panther_domain::ports::GitProbeError;
use serde::Serialize;
use specta::Type;

/// Stable, machine-readable error categories the UI can switch on.
#[derive(Debug, Clone, Copy, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AppErrorKind {
    GitProbeFailed,
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
    pub fn background_task_failed(error: impl std::fmt::Display) -> Self {
        Self {
            kind: AppErrorKind::Internal,
            message: format!("A background task stopped unexpectedly: {error}"),
        }
    }
}

impl From<GitProbeError> for AppError {
    fn from(error: GitProbeError) -> Self {
        Self {
            kind: AppErrorKind::GitProbeFailed,
            message: format!("Git is installed but could not be checked. {error}"),
        }
    }
}
