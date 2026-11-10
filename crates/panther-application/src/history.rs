//! Use cases: merge, rebase, cherry-pick, revert, reset, check out commits,
//! manage tags, and undo the last action.

use std::path::Path;
use std::sync::Arc;

use panther_domain::commit::{CommitId, CommitSummary};
use panther_domain::history::{RebaseStep, ResetMode, TagName, check_rebase_plan};
use panther_domain::ports::{CommitLog, HistoryEditor, TagStore};
use panther_domain::repository::RepositoryError;

use crate::undo::UndoLog;

pub struct History {
    editor: Arc<dyn HistoryEditor>,
    tags: Arc<dyn TagStore>,
    log: Arc<dyn CommitLog>,
    undo: Arc<UndoLog>,
}

fn commit_id(id: &str) -> Result<CommitId, RepositoryError> {
    CommitId::parse(id).map_err(|error| RepositoryError::CommitNotFound { id: error.input })
}

fn short(id: &CommitId) -> &str {
    id.as_str().get(..7).unwrap_or(id.as_str())
}

impl History {
    pub fn new(
        editor: Arc<dyn HistoryEditor>,
        tags: Arc<dyn TagStore>,
        log: Arc<dyn CommitLog>,
        undo: Arc<UndoLog>,
    ) -> Self {
        Self {
            editor,
            tags,
            log,
            undo,
        }
    }

    /// The commits an interactive rebase onto `base` would rewrite, oldest
    /// first.
    ///
    /// # Errors
    /// An unknown commit, or [`HistoryEditor::commits_since`] errors.
    pub fn rebase_plan(
        &self,
        repository: &Path,
        base: &str,
    ) -> Result<Vec<CommitSummary>, RepositoryError> {
        let ids = self.editor.commits_since(repository, &commit_id(base)?)?;
        self.log.summaries(repository, &ids)
    }

    /// # Errors
    /// [`RepositoryError::InvalidRebasePlan`], an unknown commit, or
    /// [`HistoryEditor::rebase_interactive`] errors.
    pub fn rebase_interactive(
        &self,
        repository: &Path,
        base: &str,
        steps: &[RebaseStep],
    ) -> Result<(), RepositoryError> {
        check_rebase_plan(steps)?;
        let base = commit_id(base)?;
        self.undo.track(
            repository,
            format!("Interactive rebase onto {}", short(&base)),
            || self.editor.rebase_interactive(repository, &base, steps),
        )
    }

    /// # Errors
    /// Propagates [`HistoryEditor::merge`] errors.
    pub fn merge(&self, repository: &Path, branch: &str) -> Result<(), RepositoryError> {
        self.undo.track(repository, format!("Merge {branch}"), || {
            self.editor.merge(repository, branch)
        })
    }

    /// # Errors
    /// Propagates [`HistoryEditor::rebase`] errors.
    pub fn rebase(&self, repository: &Path, onto: &str) -> Result<(), RepositoryError> {
        self.undo
            .track(repository, format!("Rebase onto {onto}"), || {
                self.editor.rebase(repository, onto)
            })
    }

    /// # Errors
    /// An unknown commit, or [`HistoryEditor::cherry_pick`] errors.
    pub fn cherry_pick(&self, repository: &Path, commit: &str) -> Result<(), RepositoryError> {
        let commit = commit_id(commit)?;
        self.undo.track(
            repository,
            format!("Cherry-pick {}", short(&commit)),
            || self.editor.cherry_pick(repository, &commit),
        )
    }

    /// Cherry-picks `commits` (oldest first) as one step to undo.
    ///
    /// # Errors
    /// An unknown commit, or [`HistoryEditor::cherry_pick_many`] errors.
    pub fn cherry_pick_many(
        &self,
        repository: &Path,
        commits: &[String],
    ) -> Result<(), RepositoryError> {
        let commits = commits
            .iter()
            .map(|commit| commit_id(commit))
            .collect::<Result<Vec<_>, _>>()?;
        self.undo.track(
            repository,
            format!("Cherry-pick {} commits", commits.len()),
            || self.editor.cherry_pick_many(repository, &commits),
        )
    }

    /// # Errors
    /// An unknown commit, or [`HistoryEditor::revert`] errors.
    pub fn revert(&self, repository: &Path, commit: &str) -> Result<(), RepositoryError> {
        let commit = commit_id(commit)?;
        self.undo
            .track(repository, format!("Revert {}", short(&commit)), || {
                self.editor.revert(repository, &commit)
            })
    }

    /// # Errors
    /// An unknown commit, or [`HistoryEditor::reset`] errors.
    pub fn reset(
        &self,
        repository: &Path,
        commit: &str,
        mode: ResetMode,
    ) -> Result<(), RepositoryError> {
        let commit = commit_id(commit)?;
        self.undo
            .track(repository, format!("Reset to {}", short(&commit)), || {
                self.editor.reset(repository, &commit, mode)
            })
    }

    /// # Errors
    /// An unknown commit, or [`HistoryEditor::checkout_commit`] errors.
    pub fn checkout_commit(&self, repository: &Path, commit: &str) -> Result<(), RepositoryError> {
        let commit = commit_id(commit)?;
        self.undo
            .track(repository, format!("Check out {}", short(&commit)), || {
                self.editor.checkout_commit(repository, &commit)
            })
    }

    /// # Errors
    /// An invalid name, an unknown commit or [`TagStore::create`] errors.
    pub fn create_tag(
        &self,
        repository: &Path,
        name: &str,
        target: &str,
        message: Option<&str>,
    ) -> Result<(), RepositoryError> {
        self.tags.create(
            repository,
            &TagName::parse(name)?,
            &commit_id(target)?,
            message,
        )
    }

    /// # Errors
    /// An invalid name or [`TagStore::delete`] errors.
    pub fn delete_tag(&self, repository: &Path, name: &str) -> Result<(), RepositoryError> {
        self.tags.delete(repository, &TagName::parse(name)?)
    }

    /// # Errors
    /// An invalid name or [`TagStore::push`] errors.
    pub fn push_tag(&self, repository: &Path, name: &str) -> Result<(), RepositoryError> {
        self.tags.push(repository, &TagName::parse(name)?)
    }

    /// What Undo would revert, e.g. "Merge topic".
    pub fn pending_undo(&self, repository: &Path) -> Option<String> {
        self.undo.pending(repository)
    }

    /// # Errors
    /// Propagates [`UndoLog::undo`] errors.
    pub fn undo(&self, repository: &Path) -> Result<String, RepositoryError> {
        self.undo.undo(repository)
    }

    /// What Redo would do again, e.g. "Merge topic".
    pub fn pending_redo(&self, repository: &Path) -> Option<String> {
        self.undo.pending_redo(repository)
    }

    /// # Errors
    /// Propagates [`UndoLog::redo`] errors.
    pub fn redo(&self, repository: &Path) -> Result<String, RepositoryError> {
        self.undo.redo(repository)
    }
}
