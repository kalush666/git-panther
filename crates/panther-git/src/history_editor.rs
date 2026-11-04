//! The production [`HistoryEditor`]: libgit2 reads HEAD and parents, the git
//! CLI merges, rebases, cherry-picks, reverts and resets, so hooks and git's
//! own safety checks apply.

use std::path::{Path, PathBuf};

use panther_domain::commit::CommitId;
use panther_domain::history::{HeadSnapshot, ResetMode};
use panther_domain::ports::HistoryEditor;
use panther_domain::repository::RepositoryError;

use crate::cli::run_git;
use crate::libgit2::working_tree::open;

#[derive(Debug, Clone)]
pub struct GitHistoryEditor {
    executable: PathBuf,
}

impl GitHistoryEditor {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }

    /// Runs git, naming `operation` if it stops on conflicts.
    fn git(
        &self,
        repository: &Path,
        args: &[&str],
        operation: &'static str,
    ) -> Result<(), RepositoryError> {
        run_git(&self.executable, repository, args)
            .map(drop)
            .map_err(|message| classify(&message, operation))
    }

    /// Cherry-picks or reverts `commit`, choosing the first parent of a
    /// merge commit as the mainline like most users expect.
    fn apply_commit(
        &self,
        repository: &Path,
        command: &'static str,
        commit: &CommitId,
    ) -> Result<(), RepositoryError> {
        let mut args = vec![command];
        if command == "revert" {
            args.push("--no-edit");
        }
        if is_merge(repository, commit)? {
            args.extend(["-m", "1"]);
        }
        args.push(commit.as_str());
        match run_git(&self.executable, repository, &args) {
            Ok(_) => Ok(()),
            // git leaves the operation open for an empty change; close it.
            Err(message) if is_empty_change(&message) => {
                let _ = run_git(&self.executable, repository, &[command, "--abort"]);
                Err(RepositoryError::Git {
                    details: "The current branch already contains these changes.".into(),
                })
            }
            Err(message) => Err(classify(&message, command)),
        }
    }
}

impl Default for GitHistoryEditor {
    fn default() -> Self {
        Self::new("git")
    }
}

fn git_error(error: &git2::Error) -> RepositoryError {
    RepositoryError::Git {
        details: error.message().to_owned(),
    }
}

fn is_merge(repository: &Path, commit: &CommitId) -> Result<bool, RepositoryError> {
    let repo = open(repository)?;
    let oid = git2::Oid::from_str(commit.as_str()).map_err(|error| git_error(&error))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|_| RepositoryError::CommitNotFound {
            id: commit.to_string(),
        })?;
    Ok(commit.parent_count() > 1)
}

fn is_empty_change(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("is now empty") || lower.contains("nothing to commit")
}

/// Maps git's wording to the errors the UI explains specifically.
fn classify(message: &str, operation: &'static str) -> RepositoryError {
    let lower = message.to_lowercase();
    if lower.contains("would be overwritten")
        || lower.contains("you have unstaged changes")
        || lower.contains("commit or stash")
        || lower.contains("your index contains uncommitted changes")
    {
        RepositoryError::CheckoutConflict {
            details: message.lines().take(4).collect::<Vec<_>>().join(" "),
        }
    } else if lower.contains("conflict") || lower.contains("could not apply") {
        RepositoryError::OperationConflict {
            operation,
            details: message.to_owned(),
        }
    } else {
        RepositoryError::Git {
            details: message.to_owned(),
        }
    }
}

impl HistoryEditor for GitHistoryEditor {
    fn head(&self, repository: &Path) -> Result<HeadSnapshot, RepositoryError> {
        let repo = open(repository)?;
        let head = repo.head().map_err(|error| git_error(&error))?;
        let commit = head.peel_to_commit().map_err(|error| git_error(&error))?;
        let branch = if head.is_branch() {
            Some(
                head.shorthand()
                    .map_err(|error| git_error(&error))?
                    .to_owned(),
            )
        } else {
            None
        };
        let commit = CommitId::parse(&commit.id().to_string())
            .map_err(|error| RepositoryError::CommitNotFound { id: error.input })?;
        Ok(HeadSnapshot { branch, commit })
    }

    fn merge(&self, repository: &Path, branch: &str) -> Result<(), RepositoryError> {
        self.git(repository, &["merge", "--no-edit", branch], "merge")
    }

    fn rebase(&self, repository: &Path, onto: &str) -> Result<(), RepositoryError> {
        self.git(repository, &["rebase", onto], "rebase")
    }

    fn cherry_pick(&self, repository: &Path, commit: &CommitId) -> Result<(), RepositoryError> {
        self.apply_commit(repository, "cherry-pick", commit)
    }

    fn revert(&self, repository: &Path, commit: &CommitId) -> Result<(), RepositoryError> {
        self.apply_commit(repository, "revert", commit)
    }

    fn reset(
        &self,
        repository: &Path,
        commit: &CommitId,
        mode: ResetMode,
    ) -> Result<(), RepositoryError> {
        let flag = match mode {
            ResetMode::Soft => "--soft",
            ResetMode::Mixed => "--mixed",
            ResetMode::Hard => "--hard",
        };
        self.git(
            repository,
            &["reset", "--quiet", flag, commit.as_str()],
            "reset",
        )
    }

    fn checkout_commit(&self, repository: &Path, commit: &CommitId) -> Result<(), RepositoryError> {
        self.git(
            repository,
            &["switch", "--quiet", "--detach", commit.as_str()],
            "checkout",
        )
    }

    fn restore(&self, repository: &Path, snapshot: &HeadSnapshot) -> Result<(), RepositoryError> {
        let current = self.head(repository)?;
        if current.branch != snapshot.branch {
            match &snapshot.branch {
                Some(branch) => self.git(repository, &["switch", "--quiet", branch], "undo")?,
                None => {
                    return self.checkout_commit(repository, &snapshot.commit);
                }
            }
        }
        if self.head(repository)?.commit == snapshot.commit {
            return Ok(());
        }
        // `--keep` moves the branch back but refuses to lose uncommitted work.
        self.git(
            repository,
            &["reset", "--quiet", "--keep", snapshot.commit.as_str()],
            "undo",
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_conflicts_and_blocking_changes() {
        assert!(matches!(
            classify("CONFLICT (content): Merge conflict in a.txt", "merge"),
            RepositoryError::OperationConflict {
                operation: "merge",
                ..
            }
        ));
        assert!(matches!(
            classify("error: cannot rebase: You have unstaged changes.", "rebase"),
            RepositoryError::CheckoutConflict { .. }
        ));
        assert!(is_empty_change(
            "The previous cherry-pick is now empty, possibly due to conflict resolution."
        ));
    }
}
