//! Use cases: add, edit and remove remotes, and delete branches on them.

use std::path::Path;
use std::sync::Arc;

use panther_domain::ports::RemoteConfig;
use panther_domain::remote::RemoteName;
use panther_domain::repository::RepositoryError;

pub struct Remotes {
    config: Arc<dyn RemoteConfig>,
}

impl Remotes {
    pub fn new(config: Arc<dyn RemoteConfig>) -> Self {
        Self { config }
    }

    /// # Errors
    /// An invalid name, or [`RemoteConfig::add`] errors.
    pub fn add(&self, repository: &Path, name: &str, url: &str) -> Result<(), RepositoryError> {
        self.config.add(repository, &RemoteName::parse(name)?, url)
    }

    /// # Errors
    /// An invalid name, or [`RemoteConfig::set_url`] errors.
    pub fn set_url(&self, repository: &Path, name: &str, url: &str) -> Result<(), RepositoryError> {
        self.config
            .set_url(repository, &RemoteName::parse(name)?, url)
    }

    /// # Errors
    /// An invalid name, or [`RemoteConfig::remove`] errors.
    pub fn remove(&self, repository: &Path, name: &str) -> Result<(), RepositoryError> {
        self.config.remove(repository, &RemoteName::parse(name)?)
    }

    /// Deletes a remote branch given as `remote/branch`, e.g. `origin/topic`.
    ///
    /// # Errors
    /// A name without a remote part, or [`RemoteConfig::delete_branch`] errors.
    pub fn delete_branch(&self, repository: &Path, full_name: &str) -> Result<(), RepositoryError> {
        let (remote, branch) =
            full_name
                .split_once('/')
                .ok_or_else(|| RepositoryError::BranchNotFound {
                    name: full_name.to_owned(),
                })?;
        self.config
            .delete_branch(repository, &RemoteName::parse(remote)?, branch)
    }
}
