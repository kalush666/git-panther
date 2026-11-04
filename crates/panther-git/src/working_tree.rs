//! The production [`WorkingTree`] and [`CommitWriter`]: libgit2 for reading
//! and whole-file staging, the git CLI for hunk patches and commits.

use std::path::{Path, PathBuf};

use panther_domain::commit::CommitId;
use panther_domain::ports::{CommitWriter, HunkAction, WorkingTree};
use panther_domain::repository::RepositoryError;
use panther_domain::working_tree::{CommitMessage, DiffSide, FileDiff, HunkRef, WorkingTreeStatus};

use crate::cli::{PatchTarget, apply_patch, commit};
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
    ) -> Result<FileDiff, RepositoryError> {
        git2_tree::diff(repository, path, side)
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
        amend: bool,
    ) -> Result<CommitId, RepositoryError> {
        commit(&self.executable, repository, message, amend)
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
