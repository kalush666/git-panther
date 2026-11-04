//! The production [`IdentityConfig`]: reads git's effective configuration
//! and writes the repository's own (`--local`).

use std::path::{Path, PathBuf};

use panther_domain::identity::{Identity, Signing, SigningFormat};
use panther_domain::ports::IdentityConfig;
use panther_domain::repository::RepositoryError;

use crate::cli::run_git;

#[derive(Debug, Clone)]
pub struct GitIdentityConfig {
    executable: PathBuf,
}

impl GitIdentityConfig {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }

    /// The effective value of `key`, or `None` when it is not set.
    fn get(&self, repository: &Path, key: &str) -> Option<String> {
        run_git(&self.executable, repository, &["config", "--get", key])
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
    }

    fn set(&self, repository: &Path, key: &str, value: &str) -> Result<(), RepositoryError> {
        run_git(
            &self.executable,
            repository,
            &["config", "--local", key, value],
        )
        .map(drop)
        .map_err(|details| RepositoryError::Git { details })
    }
}

impl Default for GitIdentityConfig {
    fn default() -> Self {
        Self::new("git")
    }
}

impl IdentityConfig for GitIdentityConfig {
    fn identity(&self, repository: &Path) -> Result<Option<Identity>, RepositoryError> {
        let (Some(name), Some(email)) = (
            self.get(repository, "user.name"),
            self.get(repository, "user.email"),
        ) else {
            return Ok(None);
        };
        let signs = self
            .get(repository, "commit.gpgsign")
            .is_some_and(|value| value == "true");
        let signing = signs
            .then(|| self.get(repository, "user.signingkey"))
            .flatten()
            .map(|key| Signing {
                format: SigningFormat::from_config(
                    &self.get(repository, "gpg.format").unwrap_or_default(),
                ),
                key,
            });
        Ok(Some(Identity {
            name,
            email,
            signing,
        }))
    }

    fn apply(&self, repository: &Path, identity: &Identity) -> Result<(), RepositoryError> {
        self.set(repository, "user.name", identity.name.trim())?;
        self.set(repository, "user.email", identity.email.trim())?;
        match &identity.signing {
            Some(signing) => {
                self.set(repository, "gpg.format", signing.format.as_config())?;
                self.set(repository, "user.signingkey", signing.key.trim())?;
                self.set(repository, "commit.gpgsign", "true")
            }
            // Explicitly off, so a global setting does not sign this repository's commits.
            None => self.set(repository, "commit.gpgsign", "false"),
        }
    }
}
