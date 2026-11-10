//! The production [`StashStore`]: libgit2 lists, the git CLI changes.

use std::path::{Path, PathBuf};

use panther_domain::commit::CommitId;
use panther_domain::ports::StashStore;
use panther_domain::repository::RepositoryError;
use panther_domain::stash::Stash;
use panther_domain::working_tree::FileState;

use crate::cli::run_git;
use crate::libgit2::working_tree::{open, status};

#[derive(Debug, Clone)]
pub struct GitStashStore {
    executable: PathBuf,
}

impl GitStashStore {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }

    fn git(&self, repository: &Path, args: &[&str]) -> Result<(), RepositoryError> {
        run_git(&self.executable, repository, args)
            .map(drop)
            .map_err(|message| classify(&message))
    }

    /// Fails unless `index` names an existing entry, so a stale UI never
    /// applies or drops a different stash than the one it showed.
    fn ensure_exists(&self, repository: &Path, index: usize) -> Result<(), RepositoryError> {
        if index < self.stashes(repository)?.len() {
            Ok(())
        } else {
            Err(RepositoryError::StashNotFound { index })
        }
    }
}

impl Default for GitStashStore {
    fn default() -> Self {
        Self::new("git")
    }
}

impl StashStore for GitStashStore {
    fn stashes(&self, repository: &Path) -> Result<Vec<Stash>, RepositoryError> {
        let mut repo = open(repository)?;
        let mut stashes = Vec::new();
        repo.stash_foreach(|index, message, id| {
            if let Ok(id) = CommitId::parse(&id.to_string()) {
                stashes.push(Stash {
                    index,
                    message: message.to_owned(),
                    id,
                });
            }
            true
        })
        .map_err(|error| RepositoryError::Git {
            details: error.message().to_owned(),
        })?;
        Ok(stashes)
    }

    fn save(
        &self,
        repository: &Path,
        message: Option<&str>,
        include_untracked: bool,
        paths: &[String],
    ) -> Result<(), RepositoryError> {
        // `git stash` succeeds without doing anything on a clean tree, so check first.
        let changes = status(repository)?;
        let stashable = !changes.staged.is_empty()
            || !changes.conflicted.is_empty()
            || changes
                .unstaged
                .iter()
                .any(|file| include_untracked || file.state != FileState::Untracked);
        if !stashable {
            return Err(RepositoryError::NothingToStash);
        }
        let mut args = vec!["stash", "push"];
        if include_untracked {
            args.push("--include-untracked");
        }
        if let Some(message) = message.map(str::trim).filter(|text| !text.is_empty()) {
            args.extend(["--message", message]);
        }
        if !paths.is_empty() {
            args.push("--");
            args.extend(paths.iter().map(String::as_str));
        }
        self.git(repository, &args)
    }

    fn apply(
        &self,
        repository: &Path,
        index: usize,
        drop_after: bool,
    ) -> Result<(), RepositoryError> {
        self.ensure_exists(repository, index)?;
        let entry = format!("stash@{{{index}}}");
        let command = if drop_after { "pop" } else { "apply" };
        self.git(repository, &["stash", command, &entry])
    }

    fn restore(&self, repository: &Path, stash: &Stash) -> Result<(), RepositoryError> {
        self.git(
            repository,
            &[
                "stash",
                "store",
                "--message",
                &stash.message,
                stash.id.as_str(),
            ],
        )
    }

    fn remove(&self, repository: &Path, index: usize) -> Result<(), RepositoryError> {
        self.ensure_exists(repository, index)?;
        self.git(
            repository,
            &["stash", "drop", &format!("stash@{{{index}}}")],
        )
    }

    fn files(&self, repository: &Path, index: usize) -> Result<Vec<String>, RepositoryError> {
        self.ensure_exists(repository, index)?;
        let entry = format!("stash@{{{index}}}");
        let listed = run_git(
            &self.executable,
            repository,
            &[
                "stash",
                "show",
                "--name-only",
                "--include-untracked",
                &entry,
            ],
        )
        .map_err(|message| classify(&message))?;
        Ok(listed
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(str::to_owned)
            .collect())
    }

    fn apply_file(
        &self,
        repository: &Path,
        index: usize,
        file: &str,
    ) -> Result<(), RepositoryError> {
        self.ensure_exists(repository, index)?;
        let tracked = format!("--source=stash@{{{index}}}");
        // Untracked files live in the stash's third parent.
        let untracked = format!("--source=stash@{{{index}}}^3");
        self.git(repository, &["restore", &tracked, "--worktree", "--", file])
            .or_else(|_| {
                self.git(
                    repository,
                    &["restore", &untracked, "--worktree", "--", file],
                )
            })
    }

    fn rename(
        &self,
        repository: &Path,
        index: usize,
        message: &str,
    ) -> Result<(), RepositoryError> {
        let stash = self
            .stashes(repository)?
            .into_iter()
            .find(|stash| stash.index == index)
            .ok_or(RepositoryError::StashNotFound { index })?;
        self.git(
            repository,
            &["stash", "drop", &format!("stash@{{{index}}}")],
        )?;
        self.git(
            repository,
            &[
                "stash",
                "store",
                "--message",
                message.trim(),
                stash.id.as_str(),
            ],
        )
    }
}

/// Maps git's wording to the errors the UI explains specifically.
fn classify(message: &str) -> RepositoryError {
    let lower = message.to_lowercase();
    if lower.contains("would be overwritten") || lower.contains("already exists, no checkout") {
        RepositoryError::CheckoutConflict {
            details: message.lines().take(4).collect::<Vec<_>>().join(" "),
        }
    } else if lower.contains("conflict") {
        RepositoryError::StashConflict {
            details: message.to_owned(),
        }
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
    fn recognizes_conflicts_and_blocking_changes() {
        assert!(matches!(
            classify("CONFLICT (content): Merge conflict in notes.txt"),
            RepositoryError::StashConflict { .. }
        ));
        assert!(matches!(
            classify(
                "error: Your local changes to the following files would be overwritten by merge:\n\tnotes.txt"
            ),
            RepositoryError::CheckoutConflict { .. }
        ));
    }
}
