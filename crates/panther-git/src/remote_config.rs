//! The production [`RemoteConfig`]: remotes through the git CLI.

use std::path::{Path, PathBuf};

use panther_domain::ports::RemoteConfig;
use panther_domain::remote::RemoteName;
use panther_domain::repository::{RemoteUrl, RepositoryError};

use crate::cli::{classify_sync_failure, run_git};

#[derive(Debug, Clone)]
pub struct GitRemoteConfig {
    executable: PathBuf,
}

impl GitRemoteConfig {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }

    /// Runs git, explaining a missing or duplicate remote `name`.
    fn git(
        &self,
        repository: &Path,
        args: &[&str],
        name: &RemoteName,
    ) -> Result<(), RepositoryError> {
        run_git(&self.executable, repository, args)
            .map(drop)
            .map_err(|message| {
                let lower = message.to_lowercase();
                if lower.contains("already exists") {
                    RepositoryError::RemoteExists {
                        name: name.to_string(),
                    }
                } else if lower.contains("no such remote") {
                    RepositoryError::RemoteNotFound {
                        name: name.to_string(),
                    }
                } else {
                    RepositoryError::Git { details: message }
                }
            })
    }
}

impl Default for GitRemoteConfig {
    fn default() -> Self {
        Self::new("git")
    }
}

impl RemoteConfig for GitRemoteConfig {
    fn add(&self, repository: &Path, name: &RemoteName, url: &str) -> Result<(), RepositoryError> {
        let url = RemoteUrl::parse(url)?;
        self.git(
            repository,
            &["remote", "add", name.as_str(), url.as_str()],
            name,
        )
    }

    fn set_url(
        &self,
        repository: &Path,
        name: &RemoteName,
        url: &str,
    ) -> Result<(), RepositoryError> {
        let url = RemoteUrl::parse(url)?;
        self.git(
            repository,
            &["remote", "set-url", name.as_str(), url.as_str()],
            name,
        )
    }

    fn remove(&self, repository: &Path, name: &RemoteName) -> Result<(), RepositoryError> {
        self.git(repository, &["remote", "remove", name.as_str()], name)
    }

    fn delete_branch(
        &self,
        repository: &Path,
        remote: &RemoteName,
        branch: &str,
    ) -> Result<(), RepositoryError> {
        run_git(
            &self.executable,
            repository,
            &["push", remote.as_str(), "--delete", "--", branch],
        )
        .map(drop)
        .map_err(|message| {
            let lines: Vec<String> = message.lines().map(str::to_owned).collect();
            classify_sync_failure(&lines)
        })
    }
}
