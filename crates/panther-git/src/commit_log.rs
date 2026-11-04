//! The production [`CommitLog`]: each operation goes to the faster engine.

use std::path::{Path, PathBuf};

use panther_domain::commit::CommitFilter;
use panther_domain::commit::ReflogEntry;
use panther_domain::commit::{
    BlameLine, CommitDetails, CommitId, CommitNode, CommitSummary, Comparison, RefLabel,
};
use panther_domain::ports::CommitLog;
use panther_domain::repository::RepositoryError;
use panther_domain::working_tree::FileDiff;

use crate::cli::{read_history, run_git};
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

    fn history(
        &self,
        repository: &Path,
        hidden: &[String],
    ) -> Result<Vec<CommitNode>, RepositoryError> {
        read_history(
            &self.executable,
            repository,
            &history_tips(repository, hidden)?,
        )
    }

    fn search(&self, repository: &Path, query: &str) -> Result<Vec<CommitId>, RepositoryError> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        // `--grep` and `--author` combine with AND, so ask twice and merge.
        let mut ids = Vec::new();
        for filter in [format!("--grep={query}"), format!("--author={query}")] {
            let output = run_git(
                &self.executable,
                repository,
                &[
                    "log",
                    "--all",
                    "--format=%H",
                    "--regexp-ignore-case",
                    "--fixed-strings",
                    &filter,
                ],
            )
            .map_err(|details| RepositoryError::Git { details })?;
            ids.extend(output.lines().filter_map(|line| CommitId::parse(line).ok()));
        }
        ids.sort_unstable_by(|a, b| a.as_str().cmp(b.as_str()));
        ids.dedup();
        Ok(ids)
    }

    fn file_history(
        &self,
        repository: &Path,
        path: &str,
        limit: usize,
    ) -> Result<Vec<CommitId>, RepositoryError> {
        let limit = format!("--max-count={limit}");
        let output = run_git(
            &self.executable,
            repository,
            &["log", "--follow", "--format=%H", &limit, "--", path],
        )
        .map_err(|details| RepositoryError::Git { details })?;
        Ok(output
            .lines()
            .filter_map(|line| CommitId::parse(line).ok())
            .collect())
    }

    fn blame(&self, repository: &Path, path: &str) -> Result<Vec<BlameLine>, RepositoryError> {
        self.libgit2.blame(repository, path)
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

    fn compare(
        &self,
        repository: &Path,
        base: &str,
        head: &str,
    ) -> Result<Comparison, RepositoryError> {
        self.libgit2.compare(repository, base, head)
    }

    fn patch(&self, repository: &Path, id: &CommitId) -> Result<String, RepositoryError> {
        run_git(
            &self.executable,
            repository,
            &["format-patch", "-1", "--stdout", id.as_str()],
        )
        .map_err(|details| {
            if details.contains("unknown revision") || details.contains("bad revision") {
                RepositoryError::CommitNotFound { id: id.to_string() }
            } else {
                RepositoryError::Git { details }
            }
        })
    }

    fn filter(
        &self,
        repository: &Path,
        filter: &CommitFilter,
    ) -> Result<Vec<CommitId>, RepositoryError> {
        let mut args = vec![
            "log".to_owned(),
            "--all".to_owned(),
            "--format=%H".to_owned(),
            "--regexp-ignore-case".to_owned(),
            "--fixed-strings".to_owned(),
        ];
        if let Some(author) = filter.author_needle() {
            args.push(format!("--author={author}"));
        }
        if let Some(since) = filter.since {
            args.push(format!("--since=@{since}"));
        }
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let output = run_git(&self.executable, repository, &args)
            .map_err(|details| RepositoryError::Git { details })?;
        Ok(output
            .lines()
            .filter_map(|line| CommitId::parse(line).ok())
            .collect())
    }

    fn reflog(&self, repository: &Path) -> Result<Vec<ReflogEntry>, RepositoryError> {
        self.libgit2.reflog(repository)
    }

    fn compare_file_diff(
        &self,
        repository: &Path,
        from: &CommitId,
        to: &CommitId,
        path: &str,
    ) -> Result<FileDiff, RepositoryError> {
        self.libgit2.compare_file_diff(repository, from, to, path)
    }
}
