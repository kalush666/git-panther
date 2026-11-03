//! Use cases: list, create, switch, rename and delete branches.

use std::path::Path;
use std::sync::Arc;

use panther_domain::branch::{Branch, BranchName};
use panther_domain::commit::CommitId;
use panther_domain::ports::BranchStore;
use panther_domain::repository::RepositoryError;

pub struct Branches {
    store: Arc<dyn BranchStore>,
}

impl Branches {
    pub fn new(store: Arc<dyn BranchStore>) -> Self {
        Self { store }
    }

    /// # Errors
    /// Propagates [`BranchStore::branches`] errors.
    pub fn list(&self, repository: &Path) -> Result<Vec<Branch>, RepositoryError> {
        self.store.branches(repository)
    }

    /// Creates `name` at commit `start`, optionally switching to it.
    ///
    /// # Errors
    /// [`RepositoryError::InvalidBranchName`], an unknown `start`, or any
    /// [`BranchStore::create`] error.
    pub fn create(
        &self,
        repository: &Path,
        name: &str,
        start: &str,
        checkout: bool,
    ) -> Result<(), RepositoryError> {
        let name = BranchName::parse(name)?;
        let start = CommitId::parse(start)
            .map_err(|error| RepositoryError::CommitNotFound { id: error.input })?;
        self.store.create(repository, &name, &start, checkout)
    }

    /// # Errors
    /// Propagates [`BranchStore::checkout`] errors.
    pub fn checkout(&self, repository: &Path, name: &str) -> Result<(), RepositoryError> {
        self.store.checkout(repository, name)
    }

    /// # Errors
    /// [`RepositoryError::InvalidBranchName`] or any [`BranchStore::rename`] error.
    pub fn rename(&self, repository: &Path, from: &str, to: &str) -> Result<(), RepositoryError> {
        let from = BranchName::parse(from)?;
        let to = BranchName::parse(to)?;
        if from == to {
            return Ok(());
        }
        self.store.rename(repository, &from, &to)
    }

    /// # Errors
    /// [`RepositoryError::InvalidBranchName`] or any [`BranchStore::delete`] error.
    pub fn delete(
        &self,
        repository: &Path,
        name: &str,
        force: bool,
    ) -> Result<(), RepositoryError> {
        self.store
            .delete(repository, &BranchName::parse(name)?, force)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    struct RecordingStore(Mutex<Vec<String>>);

    impl RecordingStore {
        fn calls(&self) -> Vec<String> {
            self.0.lock().unwrap().clone()
        }

        fn record(&self, call: String) {
            self.0.lock().unwrap().push(call);
        }
    }

    impl BranchStore for RecordingStore {
        fn branches(&self, _: &Path) -> Result<Vec<Branch>, RepositoryError> {
            Ok(Vec::new())
        }

        fn create(
            &self,
            _: &Path,
            name: &BranchName,
            start: &CommitId,
            checkout: bool,
        ) -> Result<(), RepositoryError> {
            self.record(format!(
                "create {name} at {} checkout={checkout}",
                start.short()
            ));
            Ok(())
        }

        fn checkout(&self, _: &Path, name: &str) -> Result<(), RepositoryError> {
            self.record(format!("checkout {name}"));
            Ok(())
        }

        fn rename(
            &self,
            _: &Path,
            from: &BranchName,
            to: &BranchName,
        ) -> Result<(), RepositoryError> {
            self.record(format!("rename {from} {to}"));
            Ok(())
        }

        fn delete(&self, _: &Path, name: &BranchName, force: bool) -> Result<(), RepositoryError> {
            self.record(format!("delete {name} force={force}"));
            Ok(())
        }
    }

    fn branches() -> (Branches, Arc<RecordingStore>) {
        let store = Arc::new(RecordingStore::default());
        (
            Branches::new(Arc::clone(&store) as Arc<dyn BranchStore>),
            store,
        )
    }

    const REPO: &str = "/repos/app";
    const START: &str = "0123456789abcdef0123456789abcdef01234567";

    #[test]
    fn creates_branches_with_trimmed_names() {
        let (branches, store) = branches();
        branches
            .create(Path::new(REPO), " feature/login ", START, true)
            .unwrap();
        assert_eq!(
            store.calls(),
            ["create feature/login at 0123456 checkout=true"]
        );
    }

    #[test]
    fn rejects_invalid_names_before_touching_git() {
        let (branches, store) = branches();
        assert!(matches!(
            branches.create(Path::new(REPO), "bad name", START, false),
            Err(RepositoryError::InvalidBranchName(_))
        ));
        assert!(matches!(
            branches.rename(Path::new(REPO), "main", "a..b"),
            Err(RepositoryError::InvalidBranchName(_))
        ));
        assert_eq!(store.calls(), Vec::<String>::new());
    }

    #[test]
    fn renaming_to_the_same_name_does_nothing() {
        let (branches, store) = branches();
        branches.rename(Path::new(REPO), "main", "main").unwrap();
        assert_eq!(store.calls(), Vec::<String>::new());
    }

    #[test]
    fn forwards_checkout_and_delete() {
        let (branches, store) = branches();
        branches.checkout(Path::new(REPO), "origin/topic").unwrap();
        branches.delete(Path::new(REPO), "topic", true).unwrap();
        assert_eq!(
            store.calls(),
            ["checkout origin/topic", "delete topic force=true"]
        );
    }
}
