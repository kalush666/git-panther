//! Clones repositories with the system git, so the user's credential
//! helpers, SSH agent and git config apply unchanged.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use panther_domain::ports::RepositoryCloner;
use panther_domain::repository::{CancellationToken, CloneProgress, CloneRequest, RepositoryError};

use super::background_command;
use super::transfer::{TransferError, failure_details, run_transfer};

#[derive(Debug, Clone)]
pub struct GitCliCloner {
    executable: PathBuf,
}

impl GitCliCloner {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }

    fn run(
        &self,
        request: &CloneRequest,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        let mut command = background_command(&self.executable);
        command
            .args(["clone", "--progress", "--"])
            .arg(request.url.as_str())
            .arg(&request.destination);
        match run_transfer(&mut command, on_progress, cancel) {
            Ok(output) if output.succeeded => Ok(()),
            Ok(output) => Err(RepositoryError::CloneFailed {
                details: failure_details(&output.messages),
            }),
            Err(TransferError::Cancelled) => Err(RepositoryError::Cancelled),
            Err(TransferError::Io(error)) => Err(RepositoryError::CloneFailed {
                details: format!("could not run git: {error}"),
            }),
        }
    }
}

impl Default for GitCliCloner {
    fn default() -> Self {
        Self::new("git")
    }
}

impl RepositoryCloner for GitCliCloner {
    fn clone_repository(
        &self,
        request: &CloneRequest,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        let created_destination = ensure_empty_destination(&request.destination)?;
        let result = self.run(request, on_progress, cancel);
        if result.is_err() && created_destination {
            // Best-effort cleanup of a folder only this clone created; the
            // clone error is what the user needs to see.
            let _ = fs::remove_dir_all(&request.destination);
        }
        result
    }
}

/// Returns `true` when the destination does not exist yet (git will create it).
fn ensure_empty_destination(destination: &Path) -> Result<bool, RepositoryError> {
    match fs::read_dir(destination) {
        Ok(mut entries) => match entries.next() {
            Some(_) => Err(RepositoryError::DestinationNotEmpty {
                path: destination.to_path_buf(),
            }),
            None => Ok(false),
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(RepositoryError::CloneFailed {
            details: format!("cannot use {}: {error}", destination.display()),
        }),
    }
}
