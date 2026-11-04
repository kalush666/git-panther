//! Use cases: see and change who commits in a repository.

use std::path::Path;
use std::sync::Arc;

use panther_domain::identity::Identity;
use panther_domain::ports::IdentityConfig;
use panther_domain::repository::RepositoryError;

pub struct Identities {
    config: Arc<dyn IdentityConfig>,
}

impl Identities {
    pub fn new(config: Arc<dyn IdentityConfig>) -> Self {
        Self { config }
    }

    /// # Errors
    /// Propagates [`IdentityConfig::identity`] errors.
    pub fn current(&self, repository: &Path) -> Result<Option<Identity>, RepositoryError> {
        self.config.identity(repository)
    }

    /// # Errors
    /// [`RepositoryError::InvalidIdentity`] or [`IdentityConfig::apply`] errors.
    pub fn apply(&self, repository: &Path, identity: &Identity) -> Result<(), RepositoryError> {
        identity.validate()?;
        self.config.apply(repository, identity)
    }
}
