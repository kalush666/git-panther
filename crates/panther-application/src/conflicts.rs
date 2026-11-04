//! Use cases: resolve conflicts and finish or abandon the operation that
//! caused them.

use std::path::Path;
use std::sync::Arc;

use panther_domain::conflict::ConflictChunk;
use panther_domain::ports::ConflictResolver;
use panther_domain::repository::RepositoryError;
use panther_domain::stash::{ConflictSide, Operation};

pub struct Conflicts {
    resolver: Arc<dyn ConflictResolver>,
}

impl Conflicts {
    pub fn new(resolver: Arc<dyn ConflictResolver>) -> Self {
        Self { resolver }
    }

    /// # Errors
    /// Propagates [`ConflictResolver::operation`] errors.
    pub fn operation(&self, repository: &Path) -> Result<Option<Operation>, RepositoryError> {
        self.resolver.operation(repository)
    }

    /// # Errors
    /// Propagates [`ConflictResolver::take`] errors.
    pub fn take(
        &self,
        repository: &Path,
        path: &str,
        side: ConflictSide,
    ) -> Result<(), RepositoryError> {
        self.resolver.take(repository, path, side)
    }

    /// # Errors
    /// Propagates [`ConflictResolver::conflict_chunks`] errors.
    pub fn chunks(
        &self,
        repository: &Path,
        path: &str,
    ) -> Result<Vec<ConflictChunk>, RepositoryError> {
        self.resolver.conflict_chunks(repository, path)
    }

    /// # Errors
    /// Propagates [`ConflictResolver::resolve_with`] errors.
    pub fn resolve_with(
        &self,
        repository: &Path,
        path: &str,
        content: &str,
    ) -> Result<(), RepositoryError> {
        self.resolver.resolve_with(repository, path, content)
    }

    /// # Errors
    /// Propagates [`ConflictResolver::mark_resolved`] errors.
    pub fn mark_resolved(
        &self,
        repository: &Path,
        paths: &[String],
    ) -> Result<(), RepositoryError> {
        self.resolver.mark_resolved(repository, paths)
    }

    /// # Errors
    /// Propagates [`ConflictResolver::continue_operation`] errors.
    pub fn continue_operation(&self, repository: &Path) -> Result<(), RepositoryError> {
        self.resolver.continue_operation(repository)
    }

    /// # Errors
    /// Propagates [`ConflictResolver::abort`] errors.
    pub fn abort(&self, repository: &Path) -> Result<(), RepositoryError> {
        self.resolver.abort(repository)
    }
}
