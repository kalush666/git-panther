//! Applies single-hunk patches with `git apply`, which handles whitespace,
//! line endings and offsets the same way the git CLI does.

use std::io::Write;
use std::path::Path;
use std::process::Stdio;

use panther_domain::repository::RepositoryError;

use super::background_command;

/// Where a patch is applied, and in which direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PatchTarget {
    /// Add the patch to the index.
    Index,
    /// Remove the patch from the index.
    IndexReverse,
    /// Remove the patch from the work tree.
    WorkTreeReverse,
}

/// # Errors
/// [`RepositoryError::Git`] with git's message if the patch does not apply.
pub fn apply_patch(
    executable: &Path,
    repository: &Path,
    patch: &str,
    target: PatchTarget,
) -> Result<(), RepositoryError> {
    let flags: &[&str] = match target {
        PatchTarget::Index => &["--cached"],
        PatchTarget::IndexReverse => &["--cached", "--reverse"],
        PatchTarget::WorkTreeReverse => &["--reverse"],
    };
    let mut child = background_command(executable)
        .arg("-C")
        .arg(repository)
        // Partial hunks carry their original header; let git count lines.
        .args(["apply", "--whitespace=nowarn", "--recount"])
        .args(flags)
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| git_failed(format!("could not start git: {error}")))?;
    child
        .stdin
        .take()
        .expect("stdin is piped above")
        .write_all(patch.as_bytes())
        .map_err(|error| git_failed(error.to_string()))?;
    let output = child
        .wait_with_output()
        .map_err(|error| git_failed(error.to_string()))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(git_failed(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ))
    }
}

fn git_failed(details: String) -> RepositoryError {
    RepositoryError::Git { details }
}
