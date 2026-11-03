//! Ports: capabilities the application needs from the outside world.
//!
//! Each port is a small trait implemented by an infrastructure adapter and
//! injected into use cases by the composition root.

use crate::git_installation::{GitVersion, GitVersionParseError};

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
