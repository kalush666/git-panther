//! Use case: clone a remote repository and open it.

use std::sync::Arc;

use panther_domain::ports::RepositoryCloner;
use panther_domain::repository::{
    CancellationToken, CloneProgress, CloneRequest, RepositoryError, RepositorySummary,
};

use crate::open_repository::OpenRepository;

pub struct CloneRepository {
    cloner: Arc<dyn RepositoryCloner>,
    open: Arc<OpenRepository>,
}

impl CloneRepository {
    pub fn new(cloner: Arc<dyn RepositoryCloner>, open: Arc<OpenRepository>) -> Self {
        Self { cloner, open }
    }

    /// Clones, then opens the result so it lands in the recent list.
    ///
    /// # Errors
    /// Propagates clone, open and storage errors, including
    /// [`RepositoryError::Cancelled`].
    pub fn execute(
        &self,
        request: &CloneRequest,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<RepositorySummary, RepositoryError> {
        self.cloner.clone_repository(request, on_progress, cancel)?;
        self.open.open(&request.destination)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use panther_domain::repository::RemoteUrl;

    use super::*;
    use crate::recent_repositories::RecentRepositoryList;
    use crate::test_support::{FakeCloner, FakeOpener, InMemoryRecentStore};

    fn use_case() -> (CloneRepository, Arc<RecentRepositoryList>) {
        let recent = Arc::new(RecentRepositoryList::new(Arc::new(
            InMemoryRecentStore::default(),
        )));
        let open = Arc::new(OpenRepository::new(
            Arc::new(FakeOpener),
            Arc::clone(&recent),
        ));
        (CloneRepository::new(Arc::new(FakeCloner), open), recent)
    }

    fn request() -> CloneRequest {
        CloneRequest {
            url: RemoteUrl::parse("https://example.com/app.git").unwrap(),
            destination: PathBuf::from("/repos/app"),
        }
    }

    #[test]
    fn reports_progress_then_opens_the_clone() {
        let (clone, recent) = use_case();
        let mut updates = Vec::new();
        let summary = clone
            .execute(
                &request(),
                &mut |progress| updates.push(progress),
                &CancellationToken::default(),
            )
            .unwrap();
        assert_eq!(summary.name, "app");
        assert_eq!(updates.last().unwrap().percent, Some(100));
        assert_eq!(recent.list().unwrap(), [PathBuf::from("/repos/app")]);
    }

    #[test]
    fn cancelled_clone_is_not_opened() {
        let (clone, recent) = use_case();
        let cancel = CancellationToken::default();
        cancel.cancel();
        assert!(matches!(
            clone.execute(&request(), &mut |_| {}, &cancel),
            Err(RepositoryError::Cancelled)
        ));
        assert_eq!(recent.list().unwrap(), Vec::<PathBuf>::new());
    }
}
