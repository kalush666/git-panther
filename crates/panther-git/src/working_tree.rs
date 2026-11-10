//! The production [`WorkingTree`] and [`CommitWriter`]: libgit2 for reading
//! and whole-file staging, the git CLI for hunk patches and commits.

use std::path::{Path, PathBuf};

use panther_domain::commit::CommitId;
use panther_domain::ports::{CommitWriter, HunkAction, WorkingTree};
use panther_domain::repository::RepositoryError;
use panther_domain::working_tree::{
    CommitMessage, CommitOptions, DiffSide, FileDiff, HunkRef, WorkingTreeStatus,
};

use crate::cli::{PatchTarget, apply_patch, commit, run_git};
use crate::libgit2::LineSelection;
use crate::libgit2::working_tree as git2_tree;

#[derive(Debug, Clone)]
pub struct GitWorkingTree {
    executable: PathBuf,
}

impl GitWorkingTree {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }
}

impl Default for GitWorkingTree {
    fn default() -> Self {
        Self::new("git")
    }
}

impl WorkingTree for GitWorkingTree {
    fn status(&self, repository: &Path) -> Result<WorkingTreeStatus, RepositoryError> {
        git2_tree::status(repository)
    }

    fn diff(
        &self,
        repository: &Path,
        path: &str,
        side: DiffSide,
        ignore_whitespace: bool,
    ) -> Result<FileDiff, RepositoryError> {
        git2_tree::diff(repository, path, side, ignore_whitespace)
    }

    fn stage(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError> {
        git2_tree::stage(repository, paths)
    }

    fn unstage(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError> {
        git2_tree::unstage(repository, paths)
    }

    fn discard(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError> {
        git2_tree::discard(repository, paths)
    }

    fn apply_patch(&self, repository: &Path, patch: &str) -> Result<(), RepositoryError> {
        apply_patch(&self.executable, repository, patch, PatchTarget::ThreeWay)
    }

    fn stop_tracking(&self, repository: &Path, path: &str) -> Result<(), RepositoryError> {
        run_git(
            &self.executable,
            repository,
            &["rm", "-r", "--cached", "--quiet", "--", path],
        )
        .map(drop)
        .map_err(|details| RepositoryError::Git { details })
    }

    fn restore_from(
        &self,
        repository: &Path,
        commit: &CommitId,
        path: &str,
    ) -> Result<(), RepositoryError> {
        let source = format!("--source={commit}");
        run_git(
            &self.executable,
            repository,
            &["restore", &source, "--staged", "--worktree", "--", path],
        )
        .map(drop)
        .map_err(|details| RepositoryError::Git { details })
    }

    fn ignore(&self, repository: &Path, pattern: &str) -> Result<(), RepositoryError> {
        let file = repository.join(".gitignore");
        let existing = match std::fs::read_to_string(&file) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(error) => return Err(storage_failed(&file, &error)),
        };
        if existing.lines().any(|line| line.trim() == pattern) {
            return Ok(());
        }
        // Keep the last line intact when the file does not end with one.
        let separator = if existing.is_empty() || existing.ends_with('\n') {
            ""
        } else {
            "\n"
        };
        std::fs::write(&file, format!("{existing}{separator}{pattern}\n"))
            .map_err(|error| storage_failed(&file, &error))
    }

    fn apply_hunk(
        &self,
        repository: &Path,
        hunk: &HunkRef,
        action: HunkAction,
    ) -> Result<(), RepositoryError> {
        let (side, target) = match action {
            HunkAction::Stage => (DiffSide::Unstaged, PatchTarget::Index),
            HunkAction::Unstage => (DiffSide::Staged, PatchTarget::IndexReverse),
            HunkAction::Discard => (DiffSide::Unstaged, PatchTarget::WorkTreeReverse),
        };
        // A new or deleted file has a single hunk that is the whole file.
        if !git2_tree::has_both_sides(repository, &hunk.path, side)? {
            if hunk.lines.is_some() {
                return Err(RepositoryError::Git {
                    details:
                        "Lines of a new or deleted file can only be staged with the whole file."
                            .into(),
                });
            }
            let paths = [hunk.path.clone()];
            return match action {
                HunkAction::Stage => self.stage(repository, &paths),
                HunkAction::Unstage => self.unstage(repository, &paths),
                HunkAction::Discard => self.discard(repository, &paths),
            };
        }
        let selection = hunk.lines.as_deref().map(|lines| LineSelection {
            lines,
            reverse: target != PatchTarget::Index,
        });
        let patch = git2_tree::patch_for_hunk(
            repository,
            &hunk.path,
            side,
            hunk.index,
            &hunk.header,
            selection,
        )?
        .ok_or_else(|| RepositoryError::HunkOutdated {
            path: hunk.path.clone(),
        })?;
        apply_patch(&self.executable, repository, &patch, target)
    }
}

#[derive(Debug, Clone)]
pub struct GitCommitWriter {
    executable: PathBuf,
}

impl GitCommitWriter {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }
}

impl Default for GitCommitWriter {
    fn default() -> Self {
        Self::new("git")
    }
}

impl CommitWriter for GitCommitWriter {
    fn commit(
        &self,
        repository: &Path,
        message: &CommitMessage,
        options: CommitOptions,
    ) -> Result<CommitId, RepositoryError> {
        commit(&self.executable, repository, message, options)
    }

    fn template(&self, repository: &Path) -> Result<Option<String>, RepositoryError> {
        // `--path` expands `~`; a relative path is relative to the repository.
        let Ok(configured) = run_git(
            &self.executable,
            repository,
            &["config", "--path", "--get", "commit.template"],
        ) else {
            return Ok(None);
        };
        let configured = configured.trim();
        if configured.is_empty() {
            return Ok(None);
        }
        let file = repository.join(configured);
        let text = std::fs::read_to_string(&file).map_err(|error| storage_failed(&file, &error))?;
        let kept: Vec<&str> = text
            .lines()
            .filter(|line| !line.trim_start().starts_with('#'))
            .collect();
        let template = kept.join("\n").trim().to_owned();
        Ok((!template.is_empty()).then_some(template))
    }

    fn head_message(&self, repository: &Path) -> Result<Option<String>, RepositoryError> {
        let repository = git2_tree::open(repository)?;
        Ok(repository
            .head()
            .ok()
            .and_then(|head| head.peel_to_commit().ok())
            .map(|commit| String::from_utf8_lossy(commit.message_bytes()).into_owned()))
    }
}

fn storage_failed(file: &Path, error: &std::io::Error) -> RepositoryError {
    RepositoryError::Storage {
        details: format!("{}: {error}", file.display()),
    }
}
