//! Use cases: review, stage, discard and commit uncommitted work.

use std::path::Path;
use std::sync::Arc;

use panther_domain::commit::CommitId;
use panther_domain::ports::{CommitWriter, HunkAction, WorkingTree};
use panther_domain::repository::RepositoryError;
use panther_domain::working_tree::{CommitMessage, DiffSide, FileDiff, HunkRef, WorkingTreeStatus};

pub struct WorkingCopy {
    tree: Arc<dyn WorkingTree>,
    writer: Arc<dyn CommitWriter>,
}

impl WorkingCopy {
    pub fn new(tree: Arc<dyn WorkingTree>, writer: Arc<dyn CommitWriter>) -> Self {
        Self { tree, writer }
    }

    /// # Errors
    /// Propagates [`WorkingTree::status`] errors.
    pub fn status(&self, repository: &Path) -> Result<WorkingTreeStatus, RepositoryError> {
        self.tree.status(repository)
    }

    /// # Errors
    /// Propagates [`WorkingTree::diff`] errors.
    pub fn diff(
        &self,
        repository: &Path,
        path: &str,
        side: DiffSide,
    ) -> Result<FileDiff, RepositoryError> {
        self.tree.diff(repository, path, side)
    }

    /// # Errors
    /// Propagates [`WorkingTree::stage`] errors.
    pub fn stage(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError> {
        if paths.is_empty() {
            return Ok(());
        }
        self.tree.stage(repository, paths)
    }

    /// # Errors
    /// Propagates [`WorkingTree::unstage`] errors.
    pub fn unstage(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError> {
        if paths.is_empty() {
            return Ok(());
        }
        self.tree.unstage(repository, paths)
    }

    /// # Errors
    /// Propagates [`WorkingTree::discard`] errors.
    pub fn discard(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError> {
        if paths.is_empty() {
            return Ok(());
        }
        self.tree.discard(repository, paths)
    }

    /// # Errors
    /// Propagates [`WorkingTree::apply_hunk`] errors.
    pub fn apply_hunk(
        &self,
        repository: &Path,
        hunk: &HunkRef,
        action: HunkAction,
    ) -> Result<(), RepositoryError> {
        self.tree.apply_hunk(repository, hunk, action)
    }

    /// Commits the staged changes, or amends the last commit.
    ///
    /// # Errors
    /// [`RepositoryError::CommitFailed`] for an empty message, plus any
    /// [`CommitWriter::commit`] error.
    pub fn commit(
        &self,
        repository: &Path,
        message: &str,
        amend: bool,
    ) -> Result<CommitId, RepositoryError> {
        let message =
            CommitMessage::parse(message).map_err(|error| RepositoryError::CommitFailed {
                details: error.to_string(),
            })?;
        self.writer.commit(repository, &message, amend)
    }

    /// # Errors
    /// Propagates [`CommitWriter::head_message`] errors.
    pub fn head_message(&self, repository: &Path) -> Result<Option<String>, RepositoryError> {
        self.writer.head_message(repository)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    struct Recorder {
        calls: Mutex<Vec<String>>,
    }

    impl Recorder {
        fn record(&self, call: String) {
            self.calls.lock().unwrap().push(call);
        }

        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl WorkingTree for Recorder {
        fn status(&self, _: &Path) -> Result<WorkingTreeStatus, RepositoryError> {
            Ok(WorkingTreeStatus::default())
        }

        fn diff(&self, _: &Path, path: &str, _: DiffSide) -> Result<FileDiff, RepositoryError> {
            Ok(FileDiff {
                path: path.into(),
                old_path: None,
                is_binary: false,
                is_truncated: false,
                hunks: Vec::new(),
            })
        }

        fn stage(&self, _: &Path, paths: &[String]) -> Result<(), RepositoryError> {
            self.record(format!("stage {}", paths.join(",")));
            Ok(())
        }

        fn unstage(&self, _: &Path, paths: &[String]) -> Result<(), RepositoryError> {
            self.record(format!("unstage {}", paths.join(",")));
            Ok(())
        }

        fn discard(&self, _: &Path, paths: &[String]) -> Result<(), RepositoryError> {
            self.record(format!("discard {}", paths.join(",")));
            Ok(())
        }

        fn apply_hunk(
            &self,
            _: &Path,
            hunk: &HunkRef,
            action: HunkAction,
        ) -> Result<(), RepositoryError> {
            self.record(format!("{action:?} {}#{}", hunk.path, hunk.index));
            Ok(())
        }
    }

    impl CommitWriter for Recorder {
        fn commit(
            &self,
            _: &Path,
            message: &CommitMessage,
            amend: bool,
        ) -> Result<CommitId, RepositoryError> {
            self.record(format!("commit amend={amend} {:?}", message.as_str()));
            Ok(CommitId::parse(&"a".repeat(40)).unwrap())
        }

        fn head_message(&self, _: &Path) -> Result<Option<String>, RepositoryError> {
            Ok(None)
        }
    }

    fn working_copy() -> (WorkingCopy, Arc<Recorder>) {
        let recorder = Arc::new(Recorder::default());
        let copy = WorkingCopy::new(
            Arc::clone(&recorder) as Arc<dyn WorkingTree>,
            Arc::clone(&recorder) as Arc<dyn CommitWriter>,
        );
        (copy, recorder)
    }

    const REPO: &str = "/repos/app";

    #[test]
    fn ignores_empty_file_selections() {
        let (copy, recorder) = working_copy();
        copy.stage(Path::new(REPO), &[]).unwrap();
        copy.unstage(Path::new(REPO), &[]).unwrap();
        copy.discard(Path::new(REPO), &[]).unwrap();
        assert_eq!(recorder.calls(), Vec::<String>::new());
    }

    #[test]
    fn forwards_file_and_hunk_actions() {
        let (copy, recorder) = working_copy();
        copy.stage(Path::new(REPO), &["a.txt".into()]).unwrap();
        let hunk = HunkRef {
            path: "a.txt".into(),
            index: 1,
            header: "@@ -1 +1 @@".into(),
        };
        copy.apply_hunk(Path::new(REPO), &hunk, HunkAction::Unstage)
            .unwrap();
        assert_eq!(recorder.calls(), ["stage a.txt", "Unstage a.txt#1"]);
    }

    #[test]
    fn normalizes_the_message_before_committing() {
        let (copy, recorder) = working_copy();
        copy.commit(Path::new(REPO), "  Fix bug \r\n", true)
            .unwrap();
        assert_eq!(recorder.calls(), [r#"commit amend=true "Fix bug\n""#]);
    }

    #[test]
    fn refuses_an_empty_message() {
        let (copy, recorder) = working_copy();
        assert!(matches!(
            copy.commit(Path::new(REPO), "   ", false),
            Err(RepositoryError::CommitFailed { .. })
        ));
        assert_eq!(recorder.calls(), Vec::<String>::new());
    }
}
