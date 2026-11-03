//! The production [`CommitLog`]: each operation goes to the faster engine.

use std::path::{Path, PathBuf};

use panther_domain::commit::{CommitDetails, CommitId, CommitNode, CommitSummary, RefLabel};
use panther_domain::ports::CommitLog;
use panther_domain::repository::RepositoryError;
use panther_domain::working_tree::FileDiff;

use crate::cli::read_history;
use crate::libgit2::{Git2CommitLog, history_tips};

/// Walks history with `git rev-list` (uses the commit-graph file) and does
/// everything else in-process with libgit2.
#[derive(Debug, Clone)]
pub struct GitCommitLog {
    executable: PathBuf,
    libgit2: Git2CommitLog,
}

impl GitCommitLog {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
            libgit2: Git2CommitLog,
        }
    }
}

impl Default for GitCommitLog {
    fn default() -> Self {
        Self::new("git")
    }
}

impl CommitLog for GitCommitLog {
    fn refs_fingerprint(&self, repository: &Path) -> Result<String, RepositoryError> {
        self.libgit2.refs_fingerprint(repository)
    }

    fn history(&self, repository: &Path) -> Result<Vec<CommitNode>, RepositoryError> {
        read_history(&self.executable, repository, &history_tips(repository)?)
    }

    fn summaries(
        &self,
        repository: &Path,
        ids: &[CommitId],
    ) -> Result<Vec<CommitSummary>, RepositoryError> {
        self.libgit2.summaries(repository, ids)
    }

    fn refs(&self, repository: &Path) -> Result<Vec<RefLabel>, RepositoryError> {
        self.libgit2.refs(repository)
    }

    fn details(&self, repository: &Path, id: &CommitId) -> Result<CommitDetails, RepositoryError> {
        self.libgit2.details(repository, id)
    }

    fn commit_file_diff(
        &self,
        repository: &Path,
        id: &CommitId,
        path: &str,
    ) -> Result<FileDiff, RepositoryError> {
        self.libgit2.commit_file_diff(repository, id, path)
    }
}
