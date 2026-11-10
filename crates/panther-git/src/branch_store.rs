//! The production [`BranchStore`]: libgit2 lists, the git CLI changes.

use std::path::{Path, PathBuf};

use panther_domain::branch::{Branch, BranchKind, BranchName};
use panther_domain::commit::CommitId;
use panther_domain::ports::BranchStore;
use panther_domain::repository::RepositoryError;

use crate::cli::run_branch_command;
use crate::libgit2::branches::{branch_exists, branches};

#[derive(Debug, Clone)]
pub struct GitBranchStore {
    executable: PathBuf,
}

impl GitBranchStore {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }

    fn git(&self, repository: &Path, args: &[&str], subject: &str) -> Result<(), RepositoryError> {
        run_branch_command(&self.executable, repository, args, subject)
    }
}

impl Default for GitBranchStore {
    fn default() -> Self {
        Self::new("git")
    }
}

impl BranchStore for GitBranchStore {
    fn branches(&self, repository: &Path) -> Result<Vec<Branch>, RepositoryError> {
        branches(repository)
    }

    fn create(
        &self,
        repository: &Path,
        name: &BranchName,
        start: &CommitId,
        checkout: bool,
    ) -> Result<(), RepositoryError> {
        let args: &[&str] = if checkout {
            &["switch", "--create", name.as_str(), start.as_str()]
        } else {
            &["branch", "--", name.as_str(), start.as_str()]
        };
        self.git(repository, args, name.as_str())
    }

    fn checkout(&self, repository: &Path, name: &str) -> Result<(), RepositoryError> {
        if branch_exists(repository, name, BranchKind::Local)? {
            return self.git(repository, &["switch", "--", name], name);
        }
        if branch_exists(repository, name, BranchKind::Remote)? {
            let local = name.split_once('/').map_or(name, |(_, branch)| branch);
            // Reuse an existing local branch of the same name rather than fail.
            if branch_exists(repository, local, BranchKind::Local)? {
                return self.git(repository, &["switch", "--", local], local);
            }
            return self.git(repository, &["switch", "--track", name], name);
        }
        Err(RepositoryError::BranchNotFound {
            name: name.to_owned(),
        })
    }

    fn rename(
        &self,
        repository: &Path,
        from: &BranchName,
        to: &BranchName,
    ) -> Result<(), RepositoryError> {
        if !branch_exists(repository, from.as_str(), BranchKind::Local)? {
            return Err(RepositoryError::BranchNotFound {
                name: from.to_string(),
            });
        }
        self.git(
            repository,
            &["branch", "--move", "--", from.as_str(), to.as_str()],
            to.as_str(),
        )
    }

    fn delete(
        &self,
        repository: &Path,
        name: &BranchName,
        force: bool,
    ) -> Result<(), RepositoryError> {
        let flag = if force { "-D" } else { "-d" };
        self.git(
            repository,
            &["branch", flag, "--", name.as_str()],
            name.as_str(),
        )
    }

    fn fast_forward(
        &self,
        repository: &Path,
        target: &BranchName,
        source: &str,
    ) -> Result<(), RepositoryError> {
        let checked_out = branches(repository)?
            .into_iter()
            .any(|branch| branch.is_head && branch.name == target.as_str());
        let refspec = format!("{source}:refs/heads/{target}");
        let args: &[&str] = if checked_out {
            &["merge", "--ff-only", "--autostash", source]
        } else {
            // Updates a branch that is not checked out, refusing anything but a fast-forward.
            &["fetch", ".", &refspec]
        };
        self.git(repository, args, target.as_str())
            .map_err(|error| match error {
                RepositoryError::Git { details }
                    if details.contains("non-fast-forward")
                        || details.contains("Not possible to fast-forward")
                        || details.contains("rejected") =>
                {
                    RepositoryError::NotFastForward
                }
                other => other,
            })
    }

    fn set_upstream(
        &self,
        repository: &Path,
        branch: &BranchName,
        upstream: Option<&str>,
    ) -> Result<(), RepositoryError> {
        match upstream {
            Some(upstream) => {
                let flag = format!("--set-upstream-to={upstream}");
                self.git(
                    repository,
                    &["branch", &flag, "--", branch.as_str()],
                    branch.as_str(),
                )
            }
            None => self.git(
                repository,
                &["branch", "--unset-upstream", "--", branch.as_str()],
                branch.as_str(),
            ),
        }
    }
}
