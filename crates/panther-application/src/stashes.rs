//! Use cases: set uncommitted work aside and bring it back.

use std::path::Path;
use std::sync::Arc;

use panther_domain::ports::StashStore;
use panther_domain::repository::RepositoryError;
use panther_domain::stash::Stash;

pub struct Stashes {
    store: Arc<dyn StashStore>,
}

impl Stashes {
    pub fn new(store: Arc<dyn StashStore>) -> Self {
        Self { store }
    }

    /// # Errors
    /// Propagates [`StashStore::stashes`] errors.
    pub fn list(&self, repository: &Path) -> Result<Vec<Stash>, RepositoryError> {
        self.store.stashes(repository)
    }

    /// # Errors
    /// Propagates [`StashStore::save`] errors.
    pub fn save(
        &self,
        repository: &Path,
        message: Option<&str>,
        include_untracked: bool,
    ) -> Result<(), RepositoryError> {
        self.store.save(repository, message, include_untracked)
    }

    /// Applies an entry and keeps it.
    ///
    /// # Errors
    /// Propagates [`StashStore::apply`] errors.
    pub fn apply(&self, repository: &Path, index: usize) -> Result<(), RepositoryError> {
        self.store.apply(repository, index, false)
    }

    /// Applies an entry and removes it once it applied cleanly.
    ///
    /// # Errors
    /// Propagates [`StashStore::apply`] errors.
    pub fn pop(&self, repository: &Path, index: usize) -> Result<(), RepositoryError> {
        self.store.apply(repository, index, true)
    }

    /// # Errors
    /// Propagates [`StashStore::remove`] errors.
    pub fn remove(&self, repository: &Path, index: usize) -> Result<(), RepositoryError> {
        self.store.remove(repository, index)
    }
}
