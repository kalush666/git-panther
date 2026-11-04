//! Use cases: set uncommitted work aside and bring it back.

use std::path::Path;
use std::sync::Arc;

use panther_domain::ports::StashStore;
use panther_domain::repository::RepositoryError;
use panther_domain::stash::Stash;

use crate::undo::UndoLog;

pub struct Stashes {
    store: Arc<dyn StashStore>,
    undo: Option<Arc<UndoLog>>,
}

impl Stashes {
    pub fn new(store: Arc<dyn StashStore>) -> Self {
        Self { store, undo: None }
    }

    /// Makes dropping a stash undoable.
    #[must_use]
    pub fn with_undo(mut self, undo: Arc<UndoLog>) -> Self {
        self.undo = Some(undo);
        self
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
        let dropped = self.undo.as_ref().and_then(|_| {
            self.store
                .stashes(repository)
                .ok()?
                .into_iter()
                .find(|stash| stash.index == index)
        });
        match (self.undo.as_deref(), dropped) {
            (Some(undo), Some(stash)) => {
                undo.track_stash_drop(repository, stash, || self.store.remove(repository, index))
            }
            _ => self.store.remove(repository, index),
        }
    }
}
