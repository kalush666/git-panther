//! Commits with the git CLI so hooks, signing and commit templates behave
//! exactly as they do in the terminal.

use std::io::Write;
use std::path::Path;
use std::process::Stdio;
use std::time::Instant;

use panther_domain::commit::CommitId;
use panther_domain::repository::RepositoryError;
use panther_domain::working_tree::{CommitMessage, CommitOptions};

use super::background_command;
use crate::activity;

/// # Errors
/// [`RepositoryError::NothingToCommit`], [`RepositoryError::IdentityMissing`]
/// or [`RepositoryError::CommitFailed`] with git's explanation.
pub fn commit(
    executable: &Path,
    repository: &Path,
    message: &CommitMessage,
    options: CommitOptions,
) -> Result<CommitId, RepositoryError> {
    let started = Instant::now();
    let mut command = background_command(executable);
    command
        .arg("-C")
        .arg(repository)
        .args(["commit", "--file=-", "--cleanup=strip"]);
    if options.amend {
        command.arg("--amend");
    }
    if options.skip_hooks {
        command.arg("--no-verify");
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| commit_failed(format!("could not start git: {error}")))?;
    child
        .stdin
        .take()
        .expect("stdin is piped above")
        .write_all(message.as_str().as_bytes())
        .map_err(|error| commit_failed(error.to_string()))?;
    let output = child
        .wait_with_output()
        .map_err(|error| commit_failed(error.to_string()))?;
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    // Hooks print here, so the activity log shows what they said.
    let mut args = vec!["commit"];
    if options.amend {
        args.push("--amend");
    }
    if options.skip_hooks {
        args.push("--no-verify");
    }
    activity::record(repository, &args, started, output.status.success(), &text);
    if !output.status.success() {
        return Err(classify_failure(text.trim()));
    }
    head(executable, repository)
}

fn head(executable: &Path, repository: &Path) -> Result<CommitId, RepositoryError> {
    let output = background_command(executable)
        .arg("-C")
        .arg(repository)
        .args(["rev-parse", "HEAD"])
        .output()
        .map_err(|error| commit_failed(error.to_string()))?;
    let hex = String::from_utf8_lossy(&output.stdout);
    CommitId::parse(hex.trim()).map_err(|error| commit_failed(error.to_string()))
}

/// Maps git's own wording to the errors the UI explains specifically.
fn classify_failure(output: &str) -> RepositoryError {
    let lower = output.to_lowercase();
    if lower.contains("nothing to commit") || lower.contains("no changes added to commit") {
        RepositoryError::NothingToCommit
    } else if lower.contains("please tell me who you are")
        || lower.contains("author identity unknown")
        || lower.contains("unable to auto-detect email address")
    {
        RepositoryError::IdentityMissing
    } else {
        commit_failed(output.to_owned())
    }
}

fn commit_failed(details: String) -> RepositoryError {
    RepositoryError::CommitFailed { details }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_an_empty_index() {
        assert!(matches!(
            classify_failure("On branch main\nnothing to commit, working tree clean"),
            RepositoryError::NothingToCommit
        ));
    }

    #[test]
    fn recognizes_a_missing_identity() {
        assert!(matches!(
            classify_failure("Author identity unknown\n*** Please tell me who you are."),
            RepositoryError::IdentityMissing
        ));
    }

    #[test]
    fn keeps_hook_output_for_other_failures() {
        let RepositoryError::CommitFailed { details } = classify_failure("pre-commit: lint failed")
        else {
            panic!("expected CommitFailed");
        };
        assert_eq!(details, "pre-commit: lint failed");
    }
}
