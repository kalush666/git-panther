//! Use case: read and maintain the recent-repositories list.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use panther_domain::ports::RecentRepositoryStore;
use panther_domain::repository::RepositoryError;

pub struct RecentRepositoryList {
    store: Arc<dyn RecentRepositoryStore>,
}

impl RecentRepositoryList {
    pub fn new(store: Arc<dyn RecentRepositoryStore>) -> Self {
        Self { store }
    }

    /// Recent repository paths, most recent first.
    ///
    /// # Errors
    /// [`RepositoryError::Storage`] when the stored list cannot be read.
    pub fn list(&self) -> Result<Vec<PathBuf>, RepositoryError> {
        Ok(self.store.load()?.paths().to_vec())
    }

    /// Moves `path` to the top of the list.
    ///
    /// # Errors
    /// [`RepositoryError::Storage`] when the list cannot be read or written.
    pub fn record(&self, path: &Path) -> Result<(), RepositoryError> {
        let mut recent = self.store.load()?;
        recent.record(path);
        self.store.save(&recent)
    }

    /// Forgets `path`, e.g. after the folder was deleted.
    ///
    /// # Errors
    /// [`RepositoryError::Storage`] when the list cannot be read or written.
    pub fn remove(&self, path: &Path) -> Result<(), RepositoryError> {
        let mut recent = self.store.load()?;
        recent.remove(path);
        self.store.save(&recent)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::InMemoryRecentStore;

    #[test]
    fn records_and_removes_paths() {
        let list = RecentRepositoryList::new(Arc::new(InMemoryRecentStore::default()));
        list.record(Path::new("one")).unwrap();
        list.record(Path::new("two")).unwrap();
        list.remove(Path::new("one")).unwrap();
        assert_eq!(list.list().unwrap(), [PathBuf::from("two")]);
    }
}
