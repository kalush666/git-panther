//! The production [`RepositoryLayout`]: submodules, worktrees and LFS
//! through the git CLI.

use std::fs;
use std::path::{Path, PathBuf};

use panther_domain::commit::CommitId;
use panther_domain::layout::{LfsStatus, Submodule, SubmoduleState, Worktree};
use panther_domain::ports::RepositoryLayout;
use panther_domain::repository::{CancellationToken, CloneProgress, RepositoryError};

use crate::cli::{run_git, run_sync};

#[derive(Debug, Clone)]
pub struct GitRepositoryLayout {
    executable: PathBuf,
}

impl GitRepositoryLayout {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }

    fn read(&self, repository: &Path, args: &[&str]) -> Result<String, RepositoryError> {
        run_git(&self.executable, repository, args)
            .map_err(|details| RepositoryError::Git { details })
    }
}

impl Default for GitRepositoryLayout {
    fn default() -> Self {
        Self::new("git")
    }
}

/// Parses `git submodule status`: a state character, the commit, the path
/// and an optional description in parentheses.
fn parse_submodules(output: &str) -> Vec<Submodule> {
    output
        .lines()
        .filter_map(|line| {
            let mut chars = line.chars();
            let state = match chars.next()? {
                ' ' => SubmoduleState::Current,
                '-' => SubmoduleState::NotInitialized,
                '+' => SubmoduleState::OutOfDate,
                'U' => SubmoduleState::Conflicted,
                _ => return None,
            };
            let mut parts = chars.as_str().split_whitespace();
            let commit = CommitId::parse(parts.next()?).ok()?;
            let path = parts.next()?.to_owned();
            Some(Submodule {
                path,
                commit,
                state,
            })
        })
        .collect()
}

/// Parses `git worktree list --porcelain`: blank-line separated blocks, the
/// main working tree first.
fn parse_worktrees(output: &str) -> Vec<Worktree> {
    output
        .split("\n\n")
        .filter(|block| !block.trim().is_empty())
        .enumerate()
        .filter_map(|(index, block)| {
            let mut path = None;
            let mut head = None;
            let mut branch = None;
            for line in block.lines() {
                if let Some(value) = line.strip_prefix("worktree ") {
                    path = Some(PathBuf::from(value));
                } else if let Some(value) = line.strip_prefix("HEAD ") {
                    head = CommitId::parse(value).ok();
                } else if let Some(value) = line.strip_prefix("branch ") {
                    branch = Some(
                        value
                            .strip_prefix("refs/heads/")
                            .unwrap_or(value)
                            .to_owned(),
                    );
                }
            }
            Some(Worktree {
                path: path?,
                branch,
                head,
                is_main: index == 0,
            })
        })
        .collect()
}

fn worktree_failed(path: &Path, details: String) -> RepositoryError {
    RepositoryError::WorktreeFailed {
        path: path.to_path_buf(),
        details,
    }
}

impl RepositoryLayout for GitRepositoryLayout {
    fn submodules(&self, repository: &Path) -> Result<Vec<Submodule>, RepositoryError> {
        Ok(parse_submodules(
            &self.read(repository, &["submodule", "status"])?,
        ))
    }

    fn update_submodules(
        &self,
        repository: &Path,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        run_sync(
            &self.executable,
            repository,
            &["submodule", "update", "--init", "--recursive", "--progress"],
            on_progress,
            cancel,
        )
    }

    fn worktrees(&self, repository: &Path) -> Result<Vec<Worktree>, RepositoryError> {
        Ok(parse_worktrees(
            &self.read(repository, &["worktree", "list", "--porcelain"])?,
        ))
    }

    fn add_worktree(
        &self,
        repository: &Path,
        path: &Path,
        branch: &str,
    ) -> Result<(), RepositoryError> {
        let target = path.to_string_lossy();
        run_git(
            &self.executable,
            repository,
            &["worktree", "add", "--", &target, branch],
        )
        .map(drop)
        .map_err(|details| worktree_failed(path, details))
    }

    fn remove_worktree(&self, repository: &Path, path: &Path) -> Result<(), RepositoryError> {
        let target = path.to_string_lossy();
        run_git(
            &self.executable,
            repository,
            &["worktree", "remove", "--", &target],
        )
        .map(drop)
        .map_err(|details| worktree_failed(path, details))
    }

    fn lfs(&self, repository: &Path) -> Result<LfsStatus, RepositoryError> {
        let attributes = fs::read_to_string(repository.join(".gitattributes")).unwrap_or_default();
        Ok(LfsStatus {
            used: attributes.contains("filter=lfs"),
            installed: run_git(&self.executable, repository, &["lfs", "version"]).is_ok(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHA: &str = "0123456789abcdef0123456789abcdef01234567";

    #[test]
    fn reads_submodule_states() {
        let output = format!(" {SHA} libs/a (v1.0)\n-{SHA} libs/b\n+{SHA} libs/c (heads/main)\n");
        let states: Vec<_> = parse_submodules(&output)
            .into_iter()
            .map(|submodule| (submodule.path, submodule.state))
            .collect();
        assert_eq!(
            states,
            [
                ("libs/a".to_owned(), SubmoduleState::Current),
                ("libs/b".to_owned(), SubmoduleState::NotInitialized),
                ("libs/c".to_owned(), SubmoduleState::OutOfDate),
            ]
        );
    }

    #[test]
    fn reads_worktrees_main_first() {
        let output = format!(
            "worktree /repo\nHEAD {SHA}\nbranch refs/heads/main\n\nworktree /repo-topic\nHEAD {SHA}\ndetached\n"
        );
        let worktrees = parse_worktrees(&output);
        assert_eq!(worktrees.len(), 2);
        assert!(worktrees[0].is_main);
        assert_eq!(worktrees[0].branch.as_deref(), Some("main"));
        assert_eq!(worktrees[1].branch, None);
        assert!(!worktrees[1].is_main);
    }
}
