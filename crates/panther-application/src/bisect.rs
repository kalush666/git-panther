//! Use cases: find the commit that introduced a problem with git bisect.

use std::path::Path;
use std::sync::Arc;

use panther_domain::bisect::{BisectStatus, BisectVerdict};
use panther_domain::ports::Bisector;
use panther_domain::repository::RepositoryError;

pub struct Bisect {
    bisector: Arc<dyn Bisector>,
}

impl Bisect {
    pub fn new(bisector: Arc<dyn Bisector>) -> Self {
        Self { bisector }
    }

    /// # Errors
    /// [`RepositoryError::Git`] for an empty revision, or [`Bisector::start`] errors.
    pub fn start(
        &self,
        repository: &Path,
        bad: &str,
        good: &str,
    ) -> Result<BisectStatus, RepositoryError> {
        let (bad, good) = (bad.trim(), good.trim());
        if bad.is_empty() || good.is_empty() {
            return Err(RepositoryError::Git {
                details: "Bisect needs a good and a bad commit.".into(),
            });
        }
        self.bisector.start(repository, bad, good)
    }

    /// # Errors
    /// Propagates [`Bisector::mark`] errors.
    pub fn mark(
        &self,
        repository: &Path,
        verdict: BisectVerdict,
    ) -> Result<BisectStatus, RepositoryError> {
        self.bisector.mark(repository, verdict)
    }

    /// # Errors
    /// Propagates [`Bisector::status`] errors.
    pub fn status(&self, repository: &Path) -> Result<BisectStatus, RepositoryError> {
        self.bisector.status(repository)
    }

    /// # Errors
    /// Propagates [`Bisector::reset`] errors.
    pub fn reset(&self, repository: &Path) -> Result<(), RepositoryError> {
        self.bisector.reset(repository)
    }
}
