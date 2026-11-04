//! The production [`Bisector`]: `git bisect` through the CLI.

use std::path::{Path, PathBuf};

use panther_domain::bisect::{BisectProgress, BisectStatus, BisectVerdict};
use panther_domain::commit::CommitId;
use panther_domain::ports::Bisector;
use panther_domain::repository::RepositoryError;

use crate::cli::run_git;

#[derive(Debug, Clone)]
pub struct GitBisector {
    executable: PathBuf,
}

impl GitBisector {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }

    fn git(&self, repository: &Path, args: &[&str]) -> Result<String, RepositoryError> {
        run_git(&self.executable, repository, args)
            .map_err(|details| RepositoryError::Git { details })
    }

    /// The status after a step that printed `output`.
    fn after(&self, repository: &Path, output: &str) -> Result<BisectStatus, RepositoryError> {
        let progress = BisectProgress::parse(output);
        let mut status = self.status(repository)?;
        status.steps_left = progress.steps_left;
        if progress.first_bad.is_some() {
            status.testing = None;
            status.first_bad = progress.first_bad;
        }
        Ok(status)
    }
}

impl Default for GitBisector {
    fn default() -> Self {
        Self::new("git")
    }
}

/// The commit ids of `# good: [<id>] …` style lines of `git bisect log`.
fn logged(log: &str, mark: &str) -> Vec<CommitId> {
    log.lines()
        .filter_map(|line| line.strip_prefix(mark))
        .filter_map(|rest| rest.strip_prefix('['))
        .filter_map(|rest| rest.split(']').next())
        .filter_map(|id| CommitId::parse(id).ok())
        .collect()
}

impl Bisector for GitBisector {
    fn start(
        &self,
        repository: &Path,
        bad: &str,
        good: &str,
    ) -> Result<BisectStatus, RepositoryError> {
        let output = self.git(repository, &["bisect", "start", bad, good, "--"])?;
        self.after(repository, &output)
    }

    fn mark(
        &self,
        repository: &Path,
        verdict: BisectVerdict,
    ) -> Result<BisectStatus, RepositoryError> {
        let output = self.git(repository, &["bisect", verdict.as_git()])?;
        self.after(repository, &output)
    }

    fn status(&self, repository: &Path) -> Result<BisectStatus, RepositoryError> {
        // `git bisect log` fails when no bisect is running.
        let Ok(log) = self.git(repository, &["bisect", "log"]) else {
            return Ok(BisectStatus::default());
        };
        let first_bad = logged(&log, "# first bad commit: ").into_iter().next();
        let testing = if first_bad.is_some() {
            None
        } else {
            CommitId::parse(self.git(repository, &["rev-parse", "HEAD"])?.trim()).ok()
        };
        Ok(BisectStatus {
            active: true,
            testing,
            steps_left: None,
            first_bad,
            good: logged(&log, "# good: "),
            bad: logged(&log, "# bad: "),
        })
    }

    fn reset(&self, repository: &Path) -> Result<(), RepositoryError> {
        self.git(repository, &["bisect", "reset"]).map(drop)
    }
}
