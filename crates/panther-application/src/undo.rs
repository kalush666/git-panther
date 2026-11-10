//! Remembers how to undo recent actions per repository, and how to redo
//! what was undone: anything that moved HEAD (commit, checkout, merge,
//! rebase, cherry-pick, revert, reset, pull), deleted branches and dropped
//! stashes.

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

/// What can be undone (newest last) and redone (most recently undone last).
#[derive(Default)]
struct Stacks {
    undo: Vec<Entry>,
    redo: Vec<Entry>,
}

/// How many actions back Undo reaches.
const UNDO_DEPTH: usize = 20;

pub struct UndoLog {
    history: Arc<dyn HistoryEditor>,
    branches: Arc<dyn BranchStore>,
    stashes: Arc<dyn StashStore>,
    stacks: Mutex<HashMap<PathBuf, Stacks>>,
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
            stacks: Mutex::new(HashMap::new()),
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
        self.stacks()
            .get(repository)
            .and_then(|stacks| stacks.undo.last())
            .map(|entry| entry.label.clone())
    }

    /// What the next redo would do again, if anything.
    pub fn pending_redo(&self, repository: &Path) -> Option<String> {
        self.stacks()
            .get(repository)
            .and_then(|stacks| stacks.redo.last())
            .map(|entry| entry.label.clone())
    }

    /// Reverts the newest remembered action and returns what it was; it can
    /// then be redone.
    ///
    /// # Errors
    /// [`RepositoryError::NothingToUndo`], [`RepositoryError::UndoOutdated`]
    /// when HEAD moved since, or the error restoring it.
    pub fn undo(&self, repository: &Path) -> Result<String, RepositoryError> {
        let entry = self
            .take(repository, |stacks| stacks.undo.pop())
            .ok_or(RepositoryError::NothingToUndo)?;
        match self.revert(repository, &entry.step) {
            Ok(()) => {
                let label = entry.label.clone();
                self.put(repository, |stacks| stacks.redo.push(entry));
                Ok(label)
            }
            Err(error) => {
                // Keep the step (e.g. blocked by local changes) so the user
                // can fix that and try again.
                self.put(repository, |stacks| stacks.undo.push(entry));
                Err(error)
            }
        }
    }

    /// Does the most recently undone action again and returns what it was.
    ///
    /// # Errors
    /// [`RepositoryError::NothingToRedo`], [`RepositoryError::UndoOutdated`]
    /// when HEAD moved since, or the error re-applying it.
    pub fn redo(&self, repository: &Path) -> Result<String, RepositoryError> {
        let entry = self
            .take(repository, |stacks| stacks.redo.pop())
            .ok_or(RepositoryError::NothingToRedo)?;
        match self.reapply(repository, &entry.step) {
            Ok(()) => {
                let label = entry.label.clone();
                self.put(repository, |stacks| stacks.undo.push(entry));
                Ok(label)
            }
            Err(error) => {
                self.put(repository, |stacks| stacks.redo.push(entry));
                Err(error)
            }
        }
    }

    fn revert(&self, repository: &Path, step: &UndoStep) -> Result<(), RepositoryError> {
        match step {
            UndoStep::MoveHead { before, after } => self.move_head(repository, after, before),
            UndoStep::RestoreBranch { name, target } => {
                self.branches.create(repository, name, target, false)
            }
            UndoStep::RestoreStash(stash) => self.stashes.restore(repository, stash),
        }
    }

    fn reapply(&self, repository: &Path, step: &UndoStep) -> Result<(), RepositoryError> {
        match step {
            UndoStep::MoveHead { before, after } => self.move_head(repository, before, after),
            UndoStep::RestoreBranch { name, .. } => self.branches.delete(repository, name, true),
            UndoStep::RestoreStash(stash) => {
                // Its position may have changed; find it by commit.
                let index = self
                    .stashes
                    .stashes(repository)?
                    .into_iter()
                    .find(|candidate| candidate.id == stash.id)
                    .ok_or(RepositoryError::UndoOutdated)?
                    .index;
                self.stashes.remove(repository, index)
            }
        }
    }

    /// Moves HEAD from `from` to `to`, refusing when it is no longer at `from`.
    fn move_head(
        &self,
        repository: &Path,
        from: &HeadSnapshot,
        to: &HeadSnapshot,
    ) -> Result<(), RepositoryError> {
        if &self.history.head(repository)? != from {
            return Err(RepositoryError::UndoOutdated);
        }
        self.history.restore(repository, to)
    }

    /// A new action: it can be undone, and what was undone before is gone.
    fn remember(&self, repository: &Path, label: String, step: UndoStep) {
        self.put(repository, |stacks| {
            stacks.redo.clear();
            stacks.undo.push(Entry { label, step });
            if stacks.undo.len() > UNDO_DEPTH {
                stacks.undo.remove(0);
            }
        });
    }

    fn take(
        &self,
        repository: &Path,
        pick: impl FnOnce(&mut Stacks) -> Option<Entry>,
    ) -> Option<Entry> {
        self.stacks().get_mut(repository).and_then(pick)
    }

    fn put(&self, repository: &Path, change: impl FnOnce(&mut Stacks)) {
        change(self.stacks().entry(repository.to_path_buf()).or_default());
    }

    fn stacks(&self) -> std::sync::MutexGuard<'_, HashMap<PathBuf, Stacks>> {
        // The map stays consistent even if a holder panicked.
        self.stacks.lock().unwrap_or_else(PoisonError::into_inner)
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
        fn merge_no_ff(&self, _: &Path, _: &str) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn rebase(&self, _: &Path, _: &str) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn cherry_pick(&self, _: &Path, _: &CommitId) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn cherry_pick_many(&self, _: &Path, _: &[CommitId]) -> Result<(), RepositoryError> {
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
        fn delete(&self, _: &Path, name: &BranchName, _: bool) -> Result<(), RepositoryError> {
            self.0
                .lock()
                .unwrap()
                .retain(|existing| *existing != name.as_str());
            Ok(())
        }

        fn fast_forward(&self, _: &Path, _: &BranchName, _: &str) -> Result<(), RepositoryError> {
            unreachable!()
        }

        fn set_upstream(
            &self,
            _: &Path,
            _: &BranchName,
            _: Option<&str>,
        ) -> Result<(), RepositoryError> {
            unreachable!()
        }
    }

    struct NoStashes;

    impl StashStore for NoStashes {
        fn stashes(&self, _: &Path) -> Result<Vec<Stash>, RepositoryError> {
            Ok(Vec::new())
        }
        fn save(
            &self,
            _: &Path,
            _: Option<&str>,
            _: bool,
            _: &[String],
        ) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn files(&self, _: &Path, _: usize) -> Result<Vec<String>, RepositoryError> {
            unreachable!()
        }
        fn apply_file(&self, _: &Path, _: usize, _: &str) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn rename(&self, _: &Path, _: usize, _: &str) -> Result<(), RepositoryError> {
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

    #[test]
    fn redoes_what_was_undone_until_something_new_happens() {
        let (log, head, _) = log();
        for (label, n) in [("First", 2), ("Second", 3)] {
            log.track(Path::new(REPO), label.into(), || {
                head.set(on("main", n));
                Ok(())
            })
            .unwrap();
        }

        assert_eq!(log.undo(Path::new(REPO)).unwrap(), "Second");
        assert_eq!(log.undo(Path::new(REPO)).unwrap(), "First");
        assert_eq!(head.get(), on("main", 1));
        assert_eq!(log.pending_redo(Path::new(REPO)).as_deref(), Some("First"));

        assert_eq!(log.redo(Path::new(REPO)).unwrap(), "First");
        assert_eq!(head.get(), on("main", 2));
        assert_eq!(log.pending(Path::new(REPO)).as_deref(), Some("First"));

        // A new action drops what was left to redo.
        log.track(Path::new(REPO), "Third".into(), || {
            head.set(on("main", 4));
            Ok(())
        })
        .unwrap();
        assert_eq!(log.pending_redo(Path::new(REPO)), None);
        assert!(matches!(
            log.redo(Path::new(REPO)),
            Err(RepositoryError::NothingToRedo)
        ));
    }

    #[test]
    fn redoing_a_branch_delete_deletes_it_again() {
        let (log, _, branches) = log();
        let name = BranchName::parse("topic").unwrap();
        log.track_branch_delete(Path::new(REPO), name, commit(9), || Ok(()))
            .unwrap();
        log.undo(Path::new(REPO)).unwrap();
        assert_eq!(*branches.0.lock().unwrap(), ["topic"]);

        assert_eq!(log.redo(Path::new(REPO)).unwrap(), "Delete branch topic");
        assert!(branches.0.lock().unwrap().is_empty());
    }
}
