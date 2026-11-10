//! The production [`TagStore`]: tags through the git CLI.

use std::path::{Path, PathBuf};

use panther_domain::commit::CommitId;
use panther_domain::history::TagName;
use panther_domain::ports::{RemoteSync, TagStore};
use panther_domain::repository::RepositoryError;

use crate::cli::{classify_sync_failure, run_git};
use crate::remote_sync::{GitRemoteSync, default_remote};

#[derive(Debug, Clone)]
pub struct GitTagStore {
    executable: PathBuf,
}

impl GitTagStore {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }
}

impl Default for GitTagStore {
    fn default() -> Self {
        Self::new("git")
    }
}

impl TagStore for GitTagStore {
    fn create(
        &self,
        repository: &Path,
        name: &TagName,
        target: &CommitId,
        message: Option<&str>,
    ) -> Result<(), RepositoryError> {
        let mut args = vec!["tag"];
        if let Some(message) = message.map(str::trim).filter(|text| !text.is_empty()) {
            args.extend(["--annotate", "--message", message]);
        }
        args.extend([name.as_str(), target.as_str()]);
        run_git(&self.executable, repository, &args)
            .map(drop)
            .map_err(|message| {
                if message.contains("already exists") {
                    RepositoryError::TagExists {
                        name: name.to_string(),
                    }
                } else {
                    RepositoryError::Git { details: message }
                }
            })
    }

    fn delete(&self, repository: &Path, name: &TagName) -> Result<(), RepositoryError> {
        run_git(
            &self.executable,
            repository,
            &["tag", "--delete", name.as_str()],
        )
        .map(drop)
        .map_err(|message| {
            if message.contains("not found") {
                RepositoryError::TagNotFound {
                    name: name.to_string(),
                }
            } else {
                RepositoryError::Git { details: message }
            }
        })
    }

    fn delete_remote(&self, repository: &Path, name: &TagName) -> Result<(), RepositoryError> {
        let remotes = GitRemoteSync::new(self.executable.clone()).remotes(repository)?;
        let remote = default_remote(remotes)?;
        let reference = format!("refs/tags/{name}");
        run_git(
            &self.executable,
            repository,
            &["push", &remote, "--delete", &reference],
        )
        .map(drop)
        .map_err(|message| {
            let lines: Vec<String> = message.lines().map(str::to_owned).collect();
            classify_sync_failure(&lines)
        })
    }

    fn push(&self, repository: &Path, name: &TagName) -> Result<(), RepositoryError> {
        let remotes = GitRemoteSync::new(self.executable.clone()).remotes(repository)?;
        let remote = default_remote(remotes)?;
        let reference = format!("refs/tags/{name}");
        run_git(&self.executable, repository, &["push", &remote, &reference])
            .map(drop)
            .map_err(|message| {
                let lines: Vec<String> = message.lines().map(str::to_owned).collect();
                classify_sync_failure(&lines)
            })
    }
}
