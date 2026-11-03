//! Use cases: open an existing repository or create a new one.

use std::path::Path;
use std::sync::Arc;

use panther_domain::ports::RepositoryOpener;
use panther_domain::repository::{RepositoryError, RepositorySummary};

use crate::recent_repositories::RecentRepositoryList;

pub struct OpenRepository {
    opener: Arc<dyn RepositoryOpener>,
    recent: Arc<RecentRepositoryList>,
}

impl OpenRepository {
    pub fn new(opener: Arc<dyn RepositoryOpener>, recent: Arc<RecentRepositoryList>) -> Self {
        Self { opener, recent }
    }

    /// Opens the repository at `path` and remembers it as recent.
    ///
    /// # Errors
    /// Propagates [`RepositoryOpener::open`] and storage errors.
    pub fn open(&self, path: &Path) -> Result<RepositorySummary, RepositoryError> {
        let summary = self.opener.open(path)?;
        self.recent.record(&summary.path)?;
        Ok(summary)
    }

    /// Creates a repository at `path` and remembers it as recent.
    ///
    /// # Errors
    /// Propagates [`RepositoryOpener::init`] and storage errors.
    pub fn init(&self, path: &Path) -> Result<RepositorySummary, RepositoryError> {
        let summary = self.opener.init(path)?;
        self.recent.record(&summary.path)?;
        Ok(summary)
    }

    /// Re-reads a repository without touching the recent list, e.g. after
    /// the file watcher reported changes.
    ///
    /// # Errors
    /// Propagates [`RepositoryOpener::open`] errors.
    pub fn refresh(&self, path: &Path) -> Result<RepositorySummary, RepositoryError> {
        self.opener.open(path)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::test_support::{FakeOpener, InMemoryRecentStore};

    fn use_case() -> (OpenRepository, Arc<RecentRepositoryList>) {
        let recent = Arc::new(RecentRepositoryList::new(Arc::new(
            InMemoryRecentStore::default(),
        )));
        (
            OpenRepository::new(Arc::new(FakeOpener), Arc::clone(&recent)),
            recent,
        )
    }

    #[test]
    fn opening_records_the_repository_root() {
        let (open, recent) = use_case();
        let summary = open.open(Path::new("/repos/app")).unwrap();
        assert_eq!(summary.name, "app");
        assert_eq!(recent.list().unwrap(), [PathBuf::from("/repos/app")]);
    }

    #[test]
    fn failed_open_is_not_recorded() {
        let (open, recent) = use_case();
        assert!(matches!(
            open.open(Path::new(FakeOpener::NOT_A_REPO)),
            Err(RepositoryError::NotARepository { .. })
        ));
        assert!(recent.list().unwrap().is_empty());
    }

    #[test]
    fn init_records_the_new_repository() {
        let (open, recent) = use_case();
        open.init(Path::new("/repos/new")).unwrap();
        assert_eq!(recent.list().unwrap(), [PathBuf::from("/repos/new")]);
    }

    #[test]
    fn refresh_leaves_recent_list_alone() {
        let (open, recent) = use_case();
        open.refresh(Path::new("/repos/app")).unwrap();
        assert!(recent.list().unwrap().is_empty());
    }
}
