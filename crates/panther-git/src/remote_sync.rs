//! The production [`RemoteSync`]: libgit2 reads the configuration, the git
//! CLI talks to remotes with the user's own credentials.

use std::path::{Path, PathBuf};

use panther_domain::ports::RemoteSync;
use panther_domain::remote::{PullStrategy, PushOptions, Remote};
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
        options: &PushOptions,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        let branch = current_branch(repository)?;
        let has_upstream = upstream_of(repository, &branch)?.is_some();
        let mut args = vec!["push", "--progress"];
        if options.force_with_lease {
            args.push("--force-with-lease");
        }
        // Without a chosen remote, a branch with an upstream pushes there;
        // otherwise name the remote and branch, and remember it as upstream.
        let remote = match (&options.remote, has_upstream) {
            (None, true) => None,
            (Some(remote), _) => Some(remote.to_string()),
            (None, false) => Some(default_remote(self.remotes(repository)?)?),
        };
        if let Some(remote) = &remote {
            if !has_upstream {
                args.push("--set-upstream");
            }
            args.extend([remote.as_str(), branch.as_str()]);
        }
        run_sync(&self.executable, repository, &args, on_progress, cancel)
    }
}

/// The remote to publish to: `origin`, else the first one configured.
///
/// # Errors
/// [`RepositoryError::NoRemote`] when there is none.
pub(crate) fn default_remote(remotes: Vec<Remote>) -> Result<String, RepositoryError> {
    let mut names: Vec<String> = remotes.into_iter().map(|remote| remote.name).collect();
    if let Some(origin) = names.iter().position(|name| name == DEFAULT_REMOTE) {
        return Ok(names.swap_remove(origin));
    }
    names.into_iter().next().ok_or(RepositoryError::NoRemote)
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
