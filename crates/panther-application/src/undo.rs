//! Remembers how to undo the last action per repository: anything that moved
//! HEAD (commit, checkout, merge, rebase, cherry-pick, revert, reset, pull)
//! and deleted branches.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use panther_domain::branch::BranchName;
use panther_domain::commit::CommitId;
use panther_domain::history::HeadSnapshot;
use panther_domain::ports::{BranchStore, HistoryEditor, StashStore};
use panther_domain::repository::RepositoryError;
use panther_domain::stash::Stash;

#[derive(Clone)]
enum UndoStep {
    MoveHead {
        before: HeadSnapshot,
        after: HeadSnapshot,
    },
    RestoreBranch {
        name: BranchName,
        target: CommitId,
    },
    RestoreStash(Stash),
}

#[derive(Clone)]
struct Entry {
    /// What was done, e.g. "Merge topic".
    label: String,
    step: UndoStep,
}

pub struct UndoLog {
    history: Arc<dyn HistoryEditor>,
    branches: Arc<dyn BranchStore>,
    stashes: Arc<dyn StashStore>,
    last: Mutex<HashMap<PathBuf, Entry>>,
}

impl UndoLog {
    pub fn new(
        history: Arc<dyn HistoryEditor>,
        branches: Arc<dyn BranchStore>,
        stashes: Arc<dyn StashStore>,
    ) -> Self {
        Self {
            history,
            branches,
            stashes,
            last: Mutex::new(HashMap::new()),
        }
    }

    /// Runs `action`; if it moved HEAD, remembers how to move it back.
    ///
    /// # Errors
    /// Whatever `action` returns.
    pub fn track<T>(
        &self,
        repository: &Path,
        label: String,
        action: impl FnOnce() -> Result<T, RepositoryError>,
    ) -> Result<T, RepositoryError> {
        // A repository without commits has nothing to go back to.
        let before = self.history.head(repository).ok();
        let output = action()?;
        if let (Some(before), Ok(after)) = (before, self.history.head(repository))
            && before != after
        {
            self.remember(repository, label, UndoStep::MoveHead { before, after });
        }
        Ok(output)
    }

    /// Runs `action` deleting branch `name` at `target`, remembering how to
    /// bring it back.
    ///
    /// # Errors
    /// Whatever `action` returns.
    pub fn track_branch_delete(
        &self,
        repository: &Path,
        name: BranchName,
        target: CommitId,
        action: impl FnOnce() -> Result<(), RepositoryError>,
    ) -> Result<(), RepositoryError> {
        action()?;
        let label = format!("Delete branch {name}");
        self.remember(repository, label, UndoStep::RestoreBranch { name, target });
        Ok(())
    }

    /// Runs `action` dropping `stash`, remembering how to bring it back.
    ///
    /// # Errors
    /// Whatever `action` returns.
    pub fn track_stash_drop(
        &self,
        repository: &Path,
        stash: Stash,
        action: impl FnOnce() -> Result<(), RepositoryError>,
    ) -> Result<(), RepositoryError> {
        action()?;
        let label = format!("Drop stash \"{}\"", stash.message);
        self.remember(repository, label, UndoStep::RestoreStash(stash));
        Ok(())
    }

    /// What the next undo would revert, if anything.
    pub fn pending(&self, repository: &Path) -> Option<String> {
        self.entries()
            .get(repository)
            .map(|entry| entry.label.clone())
    }

    /// Reverts the last remembered action and returns what it was.
    ///
    /// # Errors
    /// [`RepositoryError::NothingToUndo`], [`RepositoryError::UndoOutdated`]
    /// when HEAD moved since, or the error restoring it.
    pub fn undo(&self, repository: &Path) -> Result<String, RepositoryError> {
        let entry = self
            .entries()
            .remove(repository)
            .ok_or(RepositoryError::NothingToUndo)?;
        match &entry.step {
            UndoStep::MoveHead { before, after } => {
                if &self.history.head(repository)? != after {
                    return Err(RepositoryError::UndoOutdated);
                }
                self.history.restore(repository, before)
            }
            UndoStep::RestoreBranch { name, target } => {
                self.branches.create(repository, name, target, false)
            }
            UndoStep::RestoreStash(stash) => self.stashes.restore(repository, stash),
        }
        .inspect_err(|_| {
            // Keep the step when restoring failed (e.g. blocked by local
            // changes) so the user can fix that and try again.
            self.entries()
                .insert(repository.to_path_buf(), entry.clone());
        })?;
        Ok(entry.label)
    }

    fn remember(&self, repository: &Path, label: String, step: UndoStep) {
        self.entries()
            .insert(repository.to_path_buf(), Entry { label, step });
    }

    fn entries(&self) -> std::sync::MutexGuard<'_, HashMap<PathBuf, Entry>> {
        // The map stays consistent even if a holder panicked.
        self.last.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Runs `action` through `undo` when there is one.
///
/// # Errors
/// Whatever `action` returns.
pub fn tracked<T>(
    undo: Option<&UndoLog>,
    repository: &Path,
    label: impl FnOnce() -> String,
    action: impl FnOnce() -> Result<T, RepositoryError>,
) -> Result<T, RepositoryError> {
    match undo {
        Some(undo) => undo.track(repository, label(), action),
        None => action(),
    }
}

#[cfg(test)]
mod tests {
    use panther_domain::branch::Branch;

    use super::*;

    fn commit(n: u8) -> CommitId {
        CommitId::parse(&format!("{n:040x}")).unwrap()
    }

    fn on(branch: &str, n: u8) -> HeadSnapshot {
        HeadSnapshot {
            branch: Some(branch.into()),
            commit: commit(n),
        }
    }

    /// A HEAD that actions move by hand and `restore` puts back.
    struct FakeHead(Mutex<HeadSnapshot>);

    impl FakeHead {
        fn set(&self, head: HeadSnapshot) {
            *self.0.lock().unwrap() = head;
        }
        fn get(&self) -> HeadSnapshot {
            self.0.lock().unwrap().clone()
        }
    }

    impl HistoryEditor for FakeHead {
        fn head(&self, _: &Path) -> Result<HeadSnapshot, RepositoryError> {
            Ok(self.get())
        }
        fn restore(&self, _: &Path, snapshot: &HeadSnapshot) -> Result<(), RepositoryError> {
            self.set(snapshot.clone());
            Ok(())
        }
        fn merge(&self, _: &Path, _: &str) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn rebase(&self, _: &Path, _: &str) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn cherry_pick(&self, _: &Path, _: &CommitId) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn revert(&self, _: &Path, _: &CommitId) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn reset(
            &self,
            _: &Path,
            _: &CommitId,
            _: panther_domain::history::ResetMode,
        ) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn checkout_commit(&self, _: &Path, _: &CommitId) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn commits_since(&self, _: &Path, _: &CommitId) -> Result<Vec<CommitId>, RepositoryError> {
            unreachable!()
        }
        fn rebase_interactive(
            &self,
            _: &Path,
            _: &CommitId,
            _: &[panther_domain::history::RebaseStep],
        ) -> Result<(), RepositoryError> {
            unreachable!()
        }
    }

    #[derive(Default)]
    struct RecreatedBranches(Mutex<Vec<String>>);

    impl BranchStore for RecreatedBranches {
        fn create(
            &self,
            _: &Path,
            name: &BranchName,
            _: &CommitId,
            _: bool,
        ) -> Result<(), RepositoryError> {
            self.0.lock().unwrap().push(name.to_string());
            Ok(())
        }
        fn branches(&self, _: &Path) -> Result<Vec<Branch>, RepositoryError> {
            unreachable!()
        }
        fn checkout(&self, _: &Path, _: &str) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn rename(&self, _: &Path, _: &BranchName, _: &BranchName) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn delete(&self, _: &Path, _: &BranchName, _: bool) -> Result<(), RepositoryError> {
            unreachable!()
        }
    }

    struct NoStashes;

    impl StashStore for NoStashes {
        fn stashes(&self, _: &Path) -> Result<Vec<Stash>, RepositoryError> {
            Ok(Vec::new())
        }
        fn save(&self, _: &Path, _: Option<&str>, _: bool) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn apply(&self, _: &Path, _: usize, _: bool) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn remove(&self, _: &Path, _: usize) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn restore(&self, _: &Path, _: &Stash) -> Result<(), RepositoryError> {
            unreachable!()
        }
    }

    fn log() -> (UndoLog, Arc<FakeHead>, Arc<RecreatedBranches>) {
        let head = Arc::new(FakeHead(Mutex::new(on("main", 1))));
        let branches = Arc::new(RecreatedBranches::default());
        (
            UndoLog::new(head.clone(), branches.clone(), Arc::new(NoStashes)),
            head,
            branches,
        )
    }

    const REPO: &str = "repo";

    #[test]
    fn undoes_an_action_that_moved_head() {
        let (log, head, _) = log();
        log.track(Path::new(REPO), "Commit".into(), || {
            head.set(on("main", 2));
            Ok(())
        })
        .unwrap();

        assert_eq!(log.pending(Path::new(REPO)).as_deref(), Some("Commit"));
        assert_eq!(log.undo(Path::new(REPO)).unwrap(), "Commit");
        assert_eq!(head.get(), on("main", 1));
        assert!(matches!(
            log.undo(Path::new(REPO)),
            Err(RepositoryError::NothingToUndo)
        ));
    }

    #[test]
    fn remembers_nothing_for_failed_or_no_op_actions() {
        let (log, _, _) = log();
        let failed: Result<(), _> = log.track(Path::new(REPO), "Merge".into(), || {
            Err(RepositoryError::NothingToUndo)
        });
        assert!(failed.is_err());
        log.track(Path::new(REPO), "Fetch".into(), || Ok(()))
            .unwrap();
        assert_eq!(log.pending(Path::new(REPO)), None);
    }

    #[test]
    fn refuses_to_undo_after_head_moved_elsewhere() {
        let (log, head, _) = log();
        log.track(Path::new(REPO), "Commit".into(), || {
            head.set(on("main", 2));
            Ok(())
        })
        .unwrap();
        head.set(on("main", 3));

        assert!(matches!(
            log.undo(Path::new(REPO)),
            Err(RepositoryError::UndoOutdated)
        ));
    }

    #[test]
    fn brings_back_a_deleted_branch() {
        let (log, _, branches) = log();
        let name = BranchName::parse("topic").unwrap();
        log.track_branch_delete(Path::new(REPO), name, commit(9), || Ok(()))
            .unwrap();

        assert_eq!(log.undo(Path::new(REPO)).unwrap(), "Delete branch topic");
        assert_eq!(*branches.0.lock().unwrap(), ["topic"]);
    }
}
