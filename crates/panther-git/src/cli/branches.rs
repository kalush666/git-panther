//! Changes branches with the git CLI, so hooks run and git's own safety
//! checks (unmerged branches, uncommitted changes) apply.

use std::path::Path;

use panther_domain::repository::RepositoryError;

use super::background_command;

/// Runs `git -C <repository> <args>`, mapping failures to domain errors.
///
/// # Errors
/// The [`RepositoryError`] matching git's explanation.
pub fn run_branch_command(
    executable: &Path,
    repository: &Path,
    args: &[&str],
    subject: &str,
) -> Result<(), RepositoryError> {
    let output = background_command(executable)
        .arg("-C")
        .arg(repository)
        .args(args)
        .output()
        .map_err(|error| RepositoryError::Git {
            details: format!("could not start git: {error}"),
        })?;
    if output.status.success() {
        return Ok(());
    }
    let message = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    Err(classify(message.trim(), subject))
}

/// Maps git's wording to the errors the UI explains specifically.
fn classify(message: &str, subject: &str) -> RepositoryError {
    let lower = message.to_lowercase();
    let name = subject.to_owned();
    if lower.contains("already exists") {
        RepositoryError::BranchExists { name }
    } else if lower.contains("not fully merged") {
        RepositoryError::BranchNotMerged { name }
    } else if lower.contains("cannot delete branch")
        && (lower.contains("checked out") || lower.contains("used by worktree"))
    {
        RepositoryError::CannotDeleteCurrentBranch { name }
    } else if lower.contains("would be overwritten by checkout")
        || lower.contains("please commit your changes or stash them")
    {
        RepositoryError::CheckoutConflict {
            details: message.lines().take(4).collect::<Vec<_>>().join(" "),
        }
    } else if lower.contains("not found") || lower.contains("invalid reference") {
        RepositoryError::BranchNotFound { name }
    } else {
        RepositoryError::Git {
            details: message.to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_existing_and_unmerged_branches() {
        assert!(matches!(
            classify("fatal: a branch named 'topic' already exists", "topic"),
            RepositoryError::BranchExists { .. }
        ));
        assert!(matches!(
            classify("error: the branch 'topic' is not fully merged.", "topic"),
            RepositoryError::BranchNotMerged { .. }
        ));
    }

    #[test]
    fn recognizes_deleting_the_current_branch() {
        assert!(matches!(
            classify(
                "error: cannot delete branch 'main' used by worktree at 'C:/x'",
                "main"
            ),
            RepositoryError::CannotDeleteCurrentBranch { .. }
        ));
    }

    #[test]
    fn recognizes_checkout_conflicts() {
        let message = "error: Your local changes to the following files would be overwritten by checkout:\n\tnotes.txt\nPlease commit your changes or stash them before you switch branches.\nAborting";
        assert!(matches!(
            classify(message, "topic"),
            RepositoryError::CheckoutConflict { .. }
        ));
    }
}
