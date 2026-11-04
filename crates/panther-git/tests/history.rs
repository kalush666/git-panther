//! Integration tests for [`GitHistoryEditor`] and [`GitTagStore`].

use std::fs;
use std::path::Path;
use std::process::Command;

use panther_domain::commit::CommitId;
use panther_domain::history::{ResetMode, TagName};
use panther_domain::ports::{ConflictResolver, HistoryEditor, TagStore};
use panther_domain::repository::RepositoryError;
use panther_domain::stash::Operation;
use panther_git::{GitConflictResolver, GitHistoryEditor, GitTagStore};
use tempfile::TempDir;

fn git(dir: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_owned()
}

fn configure(repo: &Path) {
    for (key, value) in [
        ("user.name", "Git Panther Tests"),
        ("user.email", "tests@git-panther.invalid"),
        ("core.autocrlf", "false"),
        ("commit.gpgsign", "false"),
        ("tag.gpgsign", "false"),
    ] {
        git(repo, &["config", key, value]);
    }
}

/// `main` with one commit and `topic` one commit ahead, on separate files.
fn repository() -> TempDir {
    let dir = TempDir::new().unwrap();
    let repo = dir.path();
    git(repo, &["init", "--quiet", "--initial-branch=main"]);
    configure(repo);
    commit_file(repo, "base.txt", "base\n");
    git(repo, &["switch", "--quiet", "--create", "topic"]);
    commit_file(repo, "topic.txt", "topic\n");
    git(repo, &["switch", "--quiet", "main"]);
    dir
}

fn commit_file(repo: &Path, file: &str, text: &str) {
    fs::write(repo.join(file), text).unwrap();
    git(repo, &["add", "--", file]);
    git(repo, &["commit", "--quiet", "-m", &format!("Write {file}")]);
}

fn id(repo: &Path, revision: &str) -> CommitId {
    CommitId::parse(&git(repo, &["rev-parse", revision])).unwrap()
}

fn editor() -> GitHistoryEditor {
    GitHistoryEditor::default()
}

#[test]
fn merges_a_branch_into_the_current_one() {
    let dir = repository();
    let repo = dir.path();
    commit_file(repo, "main.txt", "main\n");

    editor().merge(repo, "topic").unwrap();

    assert!(repo.join("topic.txt").exists());
    git(repo, &["rev-parse", "--verify", "HEAD^2"]);
}

#[test]
fn a_conflicting_merge_names_the_operation_and_leaves_it_open() {
    let dir = repository();
    let repo = dir.path();
    commit_file(repo, "topic.txt", "main's version\n");

    let result = editor().merge(repo, "topic");

    assert!(
        matches!(
            result,
            Err(RepositoryError::OperationConflict {
                operation: "merge",
                ..
            })
        ),
        "{result:?}"
    );
    assert_eq!(
        GitConflictResolver::default().operation(repo).unwrap(),
        Some(Operation::Merge)
    );
}

#[test]
fn rebases_the_current_branch_onto_another() {
    let dir = repository();
    let repo = dir.path();
    commit_file(repo, "main.txt", "main\n");
    git(repo, &["switch", "--quiet", "topic"]);

    editor().rebase(repo, "main").unwrap();

    assert_eq!(id(repo, "HEAD~1"), id(repo, "main"));
}

#[test]
fn cherry_picks_and_reverts_commits() {
    let dir = repository();
    let repo = dir.path();
    let topic = id(repo, "topic");

    editor().cherry_pick(repo, &topic).unwrap();
    assert!(repo.join("topic.txt").exists());

    editor().revert(repo, &id(repo, "HEAD")).unwrap();
    assert!(!repo.join("topic.txt").exists());

    let again = editor().cherry_pick(repo, &id(repo, "HEAD~1"));
    assert!(again.is_ok(), "{again:?}");
    let empty = editor().cherry_pick(repo, &topic);
    assert!(
        matches!(&empty, Err(RepositoryError::Git { details }) if details.contains("already contains")),
        "{empty:?}"
    );
    assert_eq!(
        GitConflictResolver::default().operation(repo).unwrap(),
        None
    );
}

#[test]
fn soft_reset_keeps_changes_staged_and_hard_reset_drops_them() {
    let dir = repository();
    let repo = dir.path();
    commit_file(repo, "main.txt", "main\n");
    let base = id(repo, "HEAD~1");

    editor().reset(repo, &base, ResetMode::Soft).unwrap();
    assert_eq!(git(repo, &["diff", "--cached", "--name-only"]), "main.txt");

    editor().reset(repo, &base, ResetMode::Hard).unwrap();
    assert!(!repo.join("main.txt").exists());
}

#[test]
fn restoring_a_snapshot_undoes_commits_and_checkouts() {
    let dir = repository();
    let repo = dir.path();
    let before = editor().head(repo).unwrap();
    assert_eq!(before.branch.as_deref(), Some("main"));

    commit_file(repo, "main.txt", "main\n");
    fs::write(repo.join("draft.txt"), "uncommitted\n").unwrap();
    editor().restore(repo, &before).unwrap();
    assert_eq!(editor().head(repo).unwrap(), before);
    assert!(repo.join("draft.txt").exists(), "uncommitted work is kept");

    editor().checkout_commit(repo, &id(repo, "topic")).unwrap();
    assert_eq!(editor().head(repo).unwrap().branch, None);
    editor().restore(repo, &before).unwrap();
    assert_eq!(editor().head(repo).unwrap(), before);
}

#[test]
fn creates_deletes_and_pushes_tags() {
    let dir = repository();
    let repo = dir.path();
    let tags = GitTagStore::default();
    let name = TagName::parse("v1.0.0").unwrap();
    let head = id(repo, "HEAD");

    tags.create(repo, &name, &head, Some("First release"))
        .unwrap();
    assert_eq!(git(repo, &["cat-file", "-t", "v1.0.0"]), "tag", "annotated");
    assert!(matches!(
        tags.create(repo, &name, &head, None),
        Err(RepositoryError::TagExists { .. })
    ));

    let origin = dir.path().join("origin.git");
    git(
        repo,
        &["init", "--quiet", "--bare", &origin.to_string_lossy()],
    );
    git(
        repo,
        &["remote", "add", "origin", &origin.to_string_lossy()],
    );
    tags.push(repo, &name).unwrap();
    git(&origin, &["rev-parse", "--verify", "refs/tags/v1.0.0"]);

    tags.delete(repo, &name).unwrap();
    assert!(matches!(
        tags.delete(repo, &name),
        Err(RepositoryError::TagNotFound { .. })
    ));
}
