//! Integration tests for [`GitBranchStore`] on a clone with a real remote.

mod support;

use std::fs;
use std::path::Path;

use git2::Repository;
use panther_domain::branch::{BranchKind, BranchName};
use panther_domain::commit::CommitId;
use panther_domain::ports::{BranchStore, RepositoryCloner};
use panther_domain::repository::{CancellationToken, CloneRequest, RemoteUrl, RepositoryError};
use panther_git::{GitBranchStore, GitCliCloner};
use tempfile::TempDir;

const NOTES: &str = "notes.txt";

/// `origin` has `main` (one commit) and `feature` (one commit on top);
/// `clone` is a fresh clone of it with `main` checked out.
struct Fixture {
    _dir: TempDir,
    clone: std::path::PathBuf,
}

fn fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let origin = dir.path().join("origin");
    let repository = support::empty_repository(&origin);
    let base = support::commit(&repository, Some("HEAD"), "Base", &[(NOTES, "base\n")], &[]);
    support::commit(
        &repository,
        Some("refs/heads/feature"),
        "Feature",
        &[(NOTES, "base\n"), ("feature.txt", "feature\n")],
        &[base],
    );
    let clone = dir.path().join("clone");
    GitCliCloner::default()
        .clone_repository(
            &CloneRequest {
                url: RemoteUrl::parse(origin.to_str().unwrap()).unwrap(),
                destination: clone.clone(),
                depth: None,
            },
            &mut |_| {},
            &CancellationToken::default(),
        )
        .unwrap();
    let cloned = Repository::open(&clone).unwrap();
    let mut config = cloned.config().unwrap();
    config.set_str("user.name", "Git Panther Tests").unwrap();
    config
        .set_str("user.email", "tests@git-panther.invalid")
        .unwrap();
    config.set_bool("core.autocrlf", false).unwrap();
    Fixture { _dir: dir, clone }
}

fn store() -> GitBranchStore {
    GitBranchStore::default()
}

fn name(text: &str) -> BranchName {
    BranchName::parse(text).unwrap()
}

fn head_id(path: &Path) -> CommitId {
    let repository = Repository::open(path).unwrap();
    let id = repository.head().unwrap().target().unwrap();
    CommitId::parse(&id.to_string()).unwrap()
}

fn head_branch(path: &Path) -> String {
    let repository = Repository::open(path).unwrap();
    let head = repository.head().unwrap();
    head.shorthand().unwrap().to_owned()
}

#[test]
fn lists_local_and_remote_branches_with_tracking() {
    let fixture = fixture();

    let branches = store().branches(&fixture.clone).unwrap();

    let summary: Vec<(&str, BranchKind, bool, Option<&str>)> = branches
        .iter()
        .map(|branch| {
            (
                branch.name.as_str(),
                branch.kind,
                branch.is_head,
                branch.upstream.as_deref(),
            )
        })
        .collect();
    assert_eq!(
        summary,
        [
            ("main", BranchKind::Local, true, Some("origin/main")),
            ("origin/feature", BranchKind::Remote, false, None),
            ("origin/main", BranchKind::Remote, false, None),
        ]
    );
}

#[test]
fn counts_commits_ahead_of_the_upstream() {
    let fixture = fixture();
    let repository = Repository::open(&fixture.clone).unwrap();
    let parent = repository.head().unwrap().target().unwrap();
    support::commit(
        &repository,
        Some("HEAD"),
        "Local work",
        &[(NOTES, "local\n")],
        &[parent],
    );

    let main = store()
        .branches(&fixture.clone)
        .unwrap()
        .into_iter()
        .find(|branch| branch.name == "main")
        .unwrap();

    assert_eq!((main.ahead, main.behind), (1, 0));
}

#[test]
fn creates_branches_with_and_without_switching() {
    let fixture = fixture();
    let start = head_id(&fixture.clone);

    store()
        .create(&fixture.clone, &name("topic"), &start, false)
        .unwrap();
    assert_eq!(head_branch(&fixture.clone), "main");

    store()
        .create(&fixture.clone, &name("work"), &start, true)
        .unwrap();
    assert_eq!(head_branch(&fixture.clone), "work");

    let duplicate = store().create(&fixture.clone, &name("topic"), &start, false);
    assert!(matches!(
        duplicate,
        Err(RepositoryError::BranchExists { .. })
    ));
}

#[test]
fn checking_out_a_remote_branch_creates_a_tracking_branch() {
    let fixture = fixture();

    store().checkout(&fixture.clone, "origin/feature").unwrap();

    assert_eq!(head_branch(&fixture.clone), "feature");
    let feature = store()
        .branches(&fixture.clone)
        .unwrap()
        .into_iter()
        .find(|branch| branch.name == "feature")
        .unwrap();
    assert_eq!(feature.upstream.as_deref(), Some("origin/feature"));

    store().checkout(&fixture.clone, "main").unwrap();
    store().checkout(&fixture.clone, "origin/feature").unwrap();
    assert_eq!(
        head_branch(&fixture.clone),
        "feature",
        "reuses the local branch"
    );
}

#[test]
fn refuses_to_checkout_over_conflicting_changes() {
    let fixture = fixture();
    store().checkout(&fixture.clone, "origin/feature").unwrap();
    store().checkout(&fixture.clone, "main").unwrap();
    fs::write(fixture.clone.join("feature.txt"), "uncommitted\n").unwrap();

    let result = store().checkout(&fixture.clone, "feature");

    assert!(
        matches!(result, Err(RepositoryError::CheckoutConflict { .. })),
        "{result:?}"
    );
    assert_eq!(head_branch(&fixture.clone), "main");
}

#[test]
fn renames_branches() {
    let fixture = fixture();
    let start = head_id(&fixture.clone);
    store()
        .create(&fixture.clone, &name("old"), &start, false)
        .unwrap();

    store()
        .rename(&fixture.clone, &name("old"), &name("new"))
        .unwrap();

    let names: Vec<String> = store()
        .branches(&fixture.clone)
        .unwrap()
        .into_iter()
        .map(|branch| branch.name)
        .collect();
    assert!(names.contains(&"new".to_owned()) && !names.contains(&"old".to_owned()));
    assert!(matches!(
        store().rename(&fixture.clone, &name("missing"), &name("other")),
        Err(RepositoryError::BranchNotFound { .. })
    ));
}

#[test]
fn deletes_only_merged_branches_unless_forced() {
    let fixture = fixture();
    let start = head_id(&fixture.clone);
    store()
        .create(&fixture.clone, &name("merged"), &start, false)
        .unwrap();
    store().checkout(&fixture.clone, "origin/feature").unwrap();
    store().checkout(&fixture.clone, "main").unwrap();
    // `feature` tracks origin/feature, so make it unmerged everywhere.
    let repository = Repository::open(&fixture.clone).unwrap();
    let feature_tip = repository
        .find_branch("feature", git2::BranchType::Local)
        .unwrap()
        .get()
        .target()
        .unwrap();
    support::commit(
        &repository,
        Some("refs/heads/feature"),
        "Unpushed",
        &[(NOTES, "unpushed\n")],
        &[feature_tip],
    );

    store()
        .delete(&fixture.clone, &name("merged"), false)
        .unwrap();
    assert!(matches!(
        store().delete(&fixture.clone, &name("feature"), false),
        Err(RepositoryError::BranchNotMerged { .. })
    ));
    store()
        .delete(&fixture.clone, &name("feature"), true)
        .unwrap();
    assert!(matches!(
        store().delete(&fixture.clone, &name("main"), true),
        Err(RepositoryError::CannotDeleteCurrentBranch { .. })
    ));
}
