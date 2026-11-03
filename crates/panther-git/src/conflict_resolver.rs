//! The production [`ConflictResolver`]: libgit2 reads the repository state,
//! the git CLI resolves, continues and aborts.

use std::path::{Path, PathBuf};

use git2::RepositoryState;
use panther_domain::ports::ConflictResolver;
use panther_domain::repository::RepositoryError;
use panther_domain::stash::{ConflictSide, Operation};

use crate::cli::run_git;
use crate::libgit2::working_tree::{open, status};

#[derive(Debug, Clone)]
pub struct GitConflictResolver {
    executable: PathBuf,
}

impl GitConflictResolver {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }

    fn git(&self, repository: &Path, args: &[&str]) -> Result<(), String> {
        run_git(&self.executable, repository, args).map(drop)
    }

    fn in_progress(&self, repository: &Path) -> Result<Operation, RepositoryError> {
        self.operation(repository)?
            .ok_or(RepositoryError::NoOperationInProgress)
    }
}

impl Default for GitConflictResolver {
    fn default() -> Self {
        Self::new("git")
    }
}

fn git_failed(details: String) -> RepositoryError {
    RepositoryError::Git { details }
}

/// The git command that continues or aborts `operation`.
fn command_of(operation: Operation) -> &'static str {
    match operation {
        Operation::Merge => "merge",
        Operation::Rebase => "rebase",
        Operation::CherryPick => "cherry-pick",
        Operation::Revert => "revert",
    }
}

/// Git's `--ours` / `--theirs` flag for `side`. During a rebase "ours" is
/// the branch being rebased onto, so the flags swap.
fn checkout_flag(side: ConflictSide, operation: Option<Operation>) -> &'static str {
    let rebasing = operation == Some(Operation::Rebase);
    match (side, rebasing) {
        (ConflictSide::Mine, false) | (ConflictSide::Incoming, true) => "--ours",
        (ConflictSide::Incoming, false) | (ConflictSide::Mine, true) => "--theirs",
    }
}

impl ConflictResolver for GitConflictResolver {
    fn operation(&self, repository: &Path) -> Result<Option<Operation>, RepositoryError> {
        Ok(match open(repository)?.state() {
            RepositoryState::Merge => Some(Operation::Merge),
            RepositoryState::Rebase
            | RepositoryState::RebaseInteractive
            | RepositoryState::RebaseMerge
            | RepositoryState::ApplyMailboxOrRebase => Some(Operation::Rebase),
            RepositoryState::CherryPick | RepositoryState::CherryPickSequence => {
                Some(Operation::CherryPick)
            }
            RepositoryState::Revert | RepositoryState::RevertSequence => Some(Operation::Revert),
            RepositoryState::Clean | RepositoryState::Bisect | RepositoryState::ApplyMailbox => {
                None
            }
        })
    }

    fn take(
        &self,
        repository: &Path,
        path: &str,
        side: ConflictSide,
    ) -> Result<(), RepositoryError> {
        let flag = checkout_flag(side, self.operation(repository)?);
        match self.git(repository, &["checkout", flag, "--", path]) {
            Ok(()) => self.git(repository, &["add", "--", path]),
            // That side deleted the file, so keeping it means deleting it.
            Err(message) if message.contains("does not have") => {
                self.git(repository, &["rm", "--quiet", "--", path])
            }
            Err(message) => Err(message),
        }
        .map_err(git_failed)
    }

    fn mark_resolved(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError> {
        if paths.is_empty() {
            return Ok(());
        }
        let mut args = vec!["add", "--"];
        args.extend(paths.iter().map(String::as_str));
        self.git(repository, &args).map_err(git_failed)
    }

    fn continue_operation(&self, repository: &Path) -> Result<(), RepositoryError> {
        let operation = self.in_progress(repository)?;
        if !status(repository)?.conflicted.is_empty() {
            return Err(RepositoryError::UnresolvedConflicts);
        }
        match self.git(repository, &[command_of(operation), "--continue"]) {
            // A rebase may stop again at a later commit; the new conflicts
            // show up in the status like the first ones did.
            Err(message) if message.to_lowercase().contains("conflict") => Ok(()),
            result => result.map_err(git_failed),
        }
    }

    fn abort(&self, repository: &Path) -> Result<(), RepositoryError> {
        let operation = self.in_progress(repository)?;
        self.git(repository, &[command_of(operation), "--abort"])
            .map_err(git_failed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rebases_swap_ours_and_theirs() {
        assert_eq!(
            checkout_flag(ConflictSide::Mine, Some(Operation::Merge)),
            "--ours"
        );
        assert_eq!(checkout_flag(ConflictSide::Mine, None), "--ours");
        assert_eq!(
            checkout_flag(ConflictSide::Mine, Some(Operation::Rebase)),
            "--theirs"
        );
        assert_eq!(
            checkout_flag(ConflictSide::Incoming, Some(Operation::Rebase)),
            "--ours"
        );
    }
}
