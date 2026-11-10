//! Use cases: start and finish git flow feature, release and hotfix branches.

use std::path::Path;
use std::sync::Arc;

use panther_domain::branch::{Branch, BranchKind, BranchName};
use panther_domain::gitflow::{DEVELOP, FlowBase, FlowKind, MAIN_CANDIDATES};
use panther_domain::history::TagName;
use panther_domain::ports::{BranchStore, HistoryEditor, TagStore};
use panther_domain::repository::RepositoryError;

/// What finishing a flow branch did, for the report.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlowFinished {
    /// The long-lived branches it was merged into, in order.
    pub merged_into: Vec<String>,
    /// The tag a release or hotfix got.
    pub tag: Option<String>,
}

pub struct Gitflow {
    branches: Arc<dyn BranchStore>,
    history: Arc<dyn HistoryEditor>,
    tags: Arc<dyn TagStore>,
}

impl Gitflow {
    pub fn new(
        branches: Arc<dyn BranchStore>,
        history: Arc<dyn HistoryEditor>,
        tags: Arc<dyn TagStore>,
    ) -> Self {
        Self {
            branches,
            history,
            tags,
        }
    }

    /// Creates and checks out `<prefix><name>` from `develop` (features,
    /// releases) or main (hotfixes). A missing `develop` is created from
    /// main first, as `git flow init` would.
    ///
    /// # Errors
    /// [`RepositoryError::InvalidBranchName`], [`RepositoryError::BranchExists`],
    /// [`RepositoryError::BranchNotFound`] without a main branch, or checkout errors.
    pub fn start(
        &self,
        repository: &Path,
        kind: FlowKind,
        name: &str,
    ) -> Result<String, RepositoryError> {
        let branch = BranchName::parse(&format!("{}{}", kind.prefix(), name.trim()))?;
        let local = self.locals(repository)?;
        let main = main_branch(&local)?;
        let base = match kind.base() {
            FlowBase::Main => main,
            FlowBase::Develop => {
                if let Some(develop) = find(&local, DEVELOP) {
                    develop
                } else {
                    let develop = BranchName::parse(DEVELOP)?;
                    self.branches
                        .create(repository, &develop, &main.target, false)?;
                    main
                }
            }
        };
        self.branches
            .create(repository, &branch, &base.target, true)?;
        Ok(branch.to_string())
    }

    /// Merges flow branch `branch` (always with a merge commit) into
    /// `develop`, and a release or hotfix into main first and tags it there;
    /// then deletes the branch and leaves `develop` checked out. After a
    /// conflict, resolve and commit, then finish again: merges already done
    /// are skipped by git.
    ///
    /// # Errors
    /// [`RepositoryError::Git`] if `branch` is no flow branch,
    /// [`RepositoryError::OperationConflict`] when a merge conflicts, or
    /// checkout, tag and delete errors.
    pub fn finish(&self, repository: &Path, branch: &str) -> Result<FlowFinished, RepositoryError> {
        let Some((kind, name)) = FlowKind::of(branch) else {
            return Err(RepositoryError::Git {
                details: format!("{branch} is not a feature, release or hotfix branch."),
            });
        };
        let local = self.locals(repository)?;
        let main = main_branch(&local)?.name.clone();
        let develop = find(&local, DEVELOP).map(|develop| develop.name.clone());
        let targets: Vec<String> = if kind.is_tagged() {
            std::iter::once(main.clone()).chain(develop).collect()
        } else {
            vec![develop.ok_or_else(|| RepositoryError::BranchNotFound {
                name: DEVELOP.into(),
            })?]
        };

        let mut tag = None;
        for target in &targets {
            self.branches.checkout(repository, target)?;
            self.history.merge_no_ff(repository, branch)?;
            if kind.is_tagged() && *target == main {
                tag = Some(self.tag_main(repository, &main, name)?);
            }
        }
        self.branches
            .delete(repository, &BranchName::parse(branch)?, false)?;
        Ok(FlowFinished {
            merged_into: targets,
            tag,
        })
    }

    /// Tags main's new tip with the release name; an existing tag is kept.
    fn tag_main(
        &self,
        repository: &Path,
        main: &str,
        name: &str,
    ) -> Result<String, RepositoryError> {
        let target = find(&self.locals(repository)?, main)
            .ok_or_else(|| RepositoryError::BranchNotFound { name: main.into() })?
            .target
            .clone();
        let tag = TagName::parse(name)?;
        let message = format!("Release {name}");
        match self.tags.create(repository, &tag, &target, Some(&message)) {
            Ok(()) | Err(RepositoryError::TagExists { .. }) => Ok(tag.to_string()),
            Err(error) => Err(error),
        }
    }

    fn locals(&self, repository: &Path) -> Result<Vec<Branch>, RepositoryError> {
        Ok(self
            .branches
            .branches(repository)?
            .into_iter()
            .filter(|branch| branch.kind == BranchKind::Local)
            .collect())
    }
}

fn find<'a>(branches: &'a [Branch], name: &str) -> Option<&'a Branch> {
    branches.iter().find(|branch| branch.name == name)
}

fn main_branch(branches: &[Branch]) -> Result<&Branch, RepositoryError> {
    MAIN_CANDIDATES
        .iter()
        .find_map(|name| find(branches, name))
        .ok_or_else(|| RepositoryError::BranchNotFound {
            name: MAIN_CANDIDATES[0].into(),
        })
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use panther_domain::commit::CommitId;
    use panther_domain::history::{HeadSnapshot, RebaseStep, ResetMode};

    use super::*;

    const REPO: &str = "C:/repos/app";

    /// Branches as name → commit number, the checked-out one, and what ran.
    #[derive(Default)]
    struct FakeRepo {
        branches: Mutex<Vec<(String, u8)>>,
        head: Mutex<String>,
        log: Mutex<Vec<String>>,
        next_commit: Mutex<u8>,
    }

    impl FakeRepo {
        fn with(branches: &[&str]) -> Arc<Self> {
            let repo = Self::default();
            *repo.branches.lock().unwrap() = branches.iter().map(|b| ((*b).into(), 1)).collect();
            *repo.head.lock().unwrap() = branches[0].into();
            *repo.next_commit.lock().unwrap() = 2;
            Arc::new(repo)
        }
        fn record(&self, entry: String) {
            self.log.lock().unwrap().push(entry);
        }
        fn log(&self) -> Vec<String> {
            self.log.lock().unwrap().clone()
        }
        fn names(&self) -> Vec<String> {
            self.branches
                .lock()
                .unwrap()
                .iter()
                .map(|(n, _)| n.clone())
                .collect()
        }
    }

    fn id(n: u8) -> CommitId {
        CommitId::parse(&format!("{n:040x}")).unwrap()
    }

    impl BranchStore for FakeRepo {
        fn branches(&self, _: &Path) -> Result<Vec<Branch>, RepositoryError> {
            let head = self.head.lock().unwrap().clone();
            Ok(self
                .branches
                .lock()
                .unwrap()
                .iter()
                .map(|(name, commit)| Branch {
                    name: name.clone(),
                    kind: BranchKind::Local,
                    target: id(*commit),
                    upstream: None,
                    ahead: 0,
                    behind: 0,
                    is_head: *name == head,
                })
                .collect())
        }

        fn create(
            &self,
            _: &Path,
            name: &BranchName,
            start: &CommitId,
            checkout: bool,
        ) -> Result<(), RepositoryError> {
            let commit = u8::from_str_radix(&start.as_str()[38..], 16).unwrap();
            self.branches
                .lock()
                .unwrap()
                .push((name.to_string(), commit));
            self.record(format!("create {name}"));
            if checkout {
                *self.head.lock().unwrap() = name.to_string();
            }
            Ok(())
        }

        fn checkout(&self, _: &Path, name: &str) -> Result<(), RepositoryError> {
            *self.head.lock().unwrap() = name.into();
            self.record(format!("checkout {name}"));
            Ok(())
        }

        fn rename(&self, _: &Path, _: &BranchName, _: &BranchName) -> Result<(), RepositoryError> {
            unreachable!()
        }

        fn delete(&self, _: &Path, name: &BranchName, _: bool) -> Result<(), RepositoryError> {
            self.branches
                .lock()
                .unwrap()
                .retain(|(existing, _)| *existing != name.to_string());
            self.record(format!("delete {name}"));
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

    impl HistoryEditor for FakeRepo {
        fn merge_no_ff(&self, _: &Path, branch: &str) -> Result<(), RepositoryError> {
            // A merge commit moves the checked-out branch forward.
            let head = self.head.lock().unwrap().clone();
            let mut next = self.next_commit.lock().unwrap();
            for (name, commit) in self.branches.lock().unwrap().iter_mut() {
                if *name == head {
                    *commit = *next;
                }
            }
            *next += 1;
            self.record(format!("merge {branch} into {head}"));
            Ok(())
        }
        fn head(&self, _: &Path) -> Result<HeadSnapshot, RepositoryError> {
            unreachable!()
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
        fn cherry_pick_many(&self, _: &Path, _: &[CommitId]) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn revert(&self, _: &Path, _: &CommitId) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn reset(&self, _: &Path, _: &CommitId, _: ResetMode) -> Result<(), RepositoryError> {
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
            _: &[RebaseStep],
        ) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn restore(&self, _: &Path, _: &HeadSnapshot) -> Result<(), RepositoryError> {
            unreachable!()
        }
    }

    impl TagStore for FakeRepo {
        fn create(
            &self,
            _: &Path,
            name: &TagName,
            target: &CommitId,
            _: Option<&str>,
        ) -> Result<(), RepositoryError> {
            self.record(format!("tag {name} at {}", &target.as_str()[38..]));
            Ok(())
        }
        fn delete(&self, _: &Path, _: &TagName) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn push(&self, _: &Path, _: &TagName) -> Result<(), RepositoryError> {
            unreachable!()
        }
        fn delete_remote(&self, _: &Path, _: &TagName) -> Result<(), RepositoryError> {
            unreachable!()
        }
    }

    fn flow(repo: &Arc<FakeRepo>) -> Gitflow {
        Gitflow::new(
            Arc::clone(repo) as Arc<dyn BranchStore>,
            Arc::clone(repo) as Arc<dyn HistoryEditor>,
            Arc::clone(repo) as Arc<dyn TagStore>,
        )
    }

    #[test]
    fn starts_features_from_develop_and_creates_develop_when_missing() {
        let repo = FakeRepo::with(&["main"]);
        let started = flow(&repo)
            .start(Path::new(REPO), FlowKind::Feature, " login ")
            .unwrap();
        assert_eq!(started, "feature/login");
        assert_eq!(repo.log(), ["create develop", "create feature/login"]);
        assert_eq!(*repo.head.lock().unwrap(), "feature/login");
    }

    #[test]
    fn finishes_a_feature_into_develop_only() {
        let repo = FakeRepo::with(&["main", "develop", "feature/login"]);
        let finished = flow(&repo)
            .finish(Path::new(REPO), "feature/login")
            .unwrap();
        assert_eq!(finished.merged_into, ["develop"]);
        assert_eq!(finished.tag, None);
        assert_eq!(
            repo.log(),
            [
                "checkout develop",
                "merge feature/login into develop",
                "delete feature/login"
            ]
        );
    }

    #[test]
    fn finishes_a_release_into_main_tagged_then_develop() {
        let repo = FakeRepo::with(&["master", "develop", "release/1.2"]);
        let finished = flow(&repo).finish(Path::new(REPO), "release/1.2").unwrap();
        assert_eq!(finished.merged_into, ["master", "develop"]);
        assert_eq!(finished.tag.as_deref(), Some("1.2"));
        assert_eq!(
            repo.log(),
            [
                "checkout master",
                "merge release/1.2 into master",
                // Tagged at main's new merge commit, not where it was.
                "tag 1.2 at 02",
                "checkout develop",
                "merge release/1.2 into develop",
                "delete release/1.2"
            ]
        );
        assert_eq!(repo.names(), ["master", "develop"]);
    }

    #[test]
    fn refuses_branches_outside_the_flow() {
        let repo = FakeRepo::with(&["main", "develop", "topic"]);
        assert!(matches!(
            flow(&repo).finish(Path::new(REPO), "topic"),
            Err(RepositoryError::Git { .. })
        ));
    }
}
