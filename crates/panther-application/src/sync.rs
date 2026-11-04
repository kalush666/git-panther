//! Use cases: exchange commits with remotes.

use std::path::Path;
use std::sync::Arc;

use panther_domain::ports::RemoteSync;
use panther_domain::remote::{PullStrategy, Remote};
use panther_domain::repository::{CancellationToken, CloneProgress, RepositoryError};

use crate::undo::{UndoLog, tracked};

pub struct Sync {
    remote: Arc<dyn RemoteSync>,
    undo: Option<Arc<UndoLog>>,
}

impl Sync {
    pub fn new(remote: Arc<dyn RemoteSync>) -> Self {
        Self { remote, undo: None }
    }

    /// Makes pulls undoable.
    #[must_use]
    pub fn with_undo(mut self, undo: Arc<UndoLog>) -> Self {
        self.undo = Some(undo);
        self
    }

    /// # Errors
    /// Propagates [`RemoteSync::remotes`] errors.
    pub fn remotes(&self, repository: &Path) -> Result<Vec<Remote>, RepositoryError> {
        self.remote.remotes(repository)
    }

    /// # Errors
    /// Propagates [`RemoteSync::fetch`] errors.
    pub fn fetch(
        &self,
        repository: &Path,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        self.remote.fetch(repository, on_progress, cancel)
    }

    /// # Errors
    /// Propagates [`RemoteSync::pull`] errors.
    pub fn pull(
        &self,
        repository: &Path,
        strategy: PullStrategy,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        tracked(
            self.undo.as_deref(),
            repository,
            || "Pull".to_owned(),
            || self.remote.pull(repository, strategy, on_progress, cancel),
        )
    }

    /// # Errors
    /// Propagates [`RemoteSync::push`] errors.
    pub fn push(
        &self,
        repository: &Path,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        self.remote.push(repository, on_progress, cancel)
    }
}
