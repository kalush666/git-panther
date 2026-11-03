//! In-memory fakes of domain ports for use-case tests.

use std::path::Path;
use std::sync::Mutex;

use panther_domain::ports::{RecentRepositoryStore, RepositoryCloner, RepositoryOpener};
use panther_domain::recent::RecentRepositories;
use panther_domain::repository::{
    CancellationToken, CloneProgress, CloneRequest, HeadState, RepositoryError, RepositorySummary,
};

#[derive(Default)]
pub struct InMemoryRecentStore(Mutex<RecentRepositories>);

impl RecentRepositoryStore for InMemoryRecentStore {
    fn load(&self) -> Result<RecentRepositories, RepositoryError> {
        Ok(self.0.lock().expect("test store lock is never poisoned").clone())
    }

    fn save(&self, recent: &RecentRepositories) -> Result<(), RepositoryError> {
        *self.0.lock().expect("test store lock is never poisoned") = recent.clone();
        Ok(())
    }
}

/// Treats every path as a repository except [`FakeOpener::NOT_A_REPO`].
pub struct FakeOpener;

impl FakeOpener {
    pub const NOT_A_REPO: &str = "/not-a-repo";
}

impl RepositoryOpener for FakeOpener {
    fn open(&self, path: &Path) -> Result<RepositorySummary, RepositoryError> {
        if path == Path::new(Self::NOT_A_REPO) {
            return Err(RepositoryError::NotARepository {
                path: path.to_path_buf(),
            });
        }
        Ok(RepositorySummary::new(
            path.to_path_buf(),
            HeadState::Branch("main".into()),
        ))
    }

    fn init(&self, path: &Path) -> Result<RepositorySummary, RepositoryError> {
        Ok(RepositorySummary::new(
            path.to_path_buf(),
            HeadState::Unborn("main".into()),
        ))
    }
}

/// Reports two progress steps, honouring cancellation up front.
pub struct FakeCloner;

impl RepositoryCloner for FakeCloner {
    fn clone_repository(
        &self,
        _request: &CloneRequest,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        if cancel.is_cancelled() {
            return Err(RepositoryError::Cancelled);
        }
        for percent in [50, 100] {
            on_progress(CloneProgress {
                phase: "Receiving objects".into(),
                percent: Some(percent),
            });
        }
        Ok(())
    }
}
