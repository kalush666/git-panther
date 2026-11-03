//! The production [`RemoteSync`]: libgit2 reads the configuration, the git
//! CLI talks to remotes with the user's own credentials.

use std::path::{Path, PathBuf};

use panther_domain::ports::RemoteSync;
use panther_domain::remote::{PullStrategy, Remote};
use panther_domain::repository::{CancellationToken, CloneProgress, RepositoryError};

use crate::cli::{pull_args, run_sync};
use crate::libgit2::working_tree::open;

/// The remote new branches are pushed to when several exist.
const DEFAULT_REMOTE: &str = "origin";

#[derive(Debug, Clone)]
pub struct GitRemoteSync {
    executable: PathBuf,
}

impl GitRemoteSync {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }
}

impl Default for GitRemoteSync {
    fn default() -> Self {
        Self::new("git")
    }
}

fn git_error(error: &git2::Error) -> RepositoryError {
    RepositoryError::Git {
        details: error.message().to_owned(),
    }
}

impl RemoteSync for GitRemoteSync {
    fn remotes(&self, repository: &Path) -> Result<Vec<Remote>, RepositoryError> {
        let repo = open(repository)?;
        let names = repo.remotes().map_err(|error| git_error(&error))?;
        Ok(names
            .iter()
            .filter_map(|name| name.ok().flatten())
            .filter_map(|name| {
                let remote = repo.find_remote(name).ok()?;
                Some(Remote {
                    name: name.to_owned(),
                    url: remote.url().unwrap_or_default().to_owned(),
                })
            })
            .collect())
    }

    fn fetch(
        &self,
        repository: &Path,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        if self.remotes(repository)?.is_empty() {
            return Err(RepositoryError::NoRemote);
        }
        run_sync(
            &self.executable,
            repository,
            &["fetch", "--progress", "--prune", "--all"],
            on_progress,
            cancel,
        )
    }

    fn pull(
        &self,
        repository: &Path,
        strategy: PullStrategy,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        let branch = current_branch(repository)?;
        if upstream_of(repository, &branch)?.is_none() {
            return Err(RepositoryError::NoUpstream { branch });
        }
        run_sync(
            &self.executable,
            repository,
            pull_args(strategy),
            on_progress,
            cancel,
        )
    }

    fn push(
        &self,
        repository: &Path,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        let branch = current_branch(repository)?;
        if upstream_of(repository, &branch)?.is_some() {
            return run_sync(
                &self.executable,
                repository,
                &["push", "--progress"],
                on_progress,
                cancel,
            );
        }
        let remotes = self.remotes(repository)?;
        let remote = remotes
            .iter()
            .find(|remote| remote.name == DEFAULT_REMOTE)
            .or_else(|| remotes.first())
            .ok_or(RepositoryError::NoRemote)?;
        run_sync(
            &self.executable,
            repository,
            &[
                "push",
                "--progress",
                "--set-upstream",
                &remote.name,
                &branch,
            ],
            on_progress,
            cancel,
        )
    }
}

/// The checked-out branch; syncing a detached HEAD is refused.
fn current_branch(repository: &Path) -> Result<String, RepositoryError> {
    let repo = open(repository)?;
    let head = repo.head().map_err(|error| git_error(&error))?;
    if !head.is_branch() {
        return Err(RepositoryError::Git {
            details: "Check out a branch first: HEAD is detached.".into(),
        });
    }
    Ok(head
        .shorthand()
        .map_err(|error| git_error(&error))?
        .to_owned())
}

fn upstream_of(repository: &Path, branch: &str) -> Result<Option<String>, RepositoryError> {
    let repo = open(repository)?;
    let local = repo
        .find_branch(branch, git2::BranchType::Local)
        .map_err(|error| git_error(&error))?;
    Ok(local
        .upstream()
        .ok()
        .and_then(|upstream| upstream.name().ok().flatten().map(str::to_owned)))
}
