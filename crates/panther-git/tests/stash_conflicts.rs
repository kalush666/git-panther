//! Integration tests for [`GitStashStore`] and [`GitConflictResolver`].

use std::fs;
use std::path::Path;
use std::process::Command;

use panther_domain::ports::{ConflictResolver, StashStore, WorkingTree};
use panther_domain::repository::RepositoryError;
use panther_domain::stash::{ConflictSide, Operation};
use panther_git::{GitConflictResolver, GitStashStore, GitWorkingTree};
use tempfile::TempDir;

/// Runs git in `dir`, returning whether it succeeded.
fn try_git(dir: &Path, args: &[&str]) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_EDITOR", "true")
        .output()
        .expect("git runs")
        .status
        .success()
}

fn git(dir: &Path, args: &[&str]) {
    assert!(try_git(dir, args), "git {args:?} failed");
}

/// A repository on `main` with `notes.txt` committed.
fn repository() -> TempDir {
    let dir = TempDir::new().unwrap();
    let path = dir.path();
    git(path, &["init", "--quiet", "--initial-branch=main"]);
    for (key, value) in [
        ("user.name", "Git Panther Tests"),
        ("user.email", "tests@git-panther.invalid"),
        ("core.autocrlf", "false"),
        ("commit.gpgsign", "false"),
    ] {
        git(path, &["config", key, value]);
    }
    commit_file(path, "notes.txt", "base\n");
    dir
}

fn commit_file(repo: &Path, file: &str, text: &str) {
    fs::write(repo.join(file), text).unwrap();
    git(repo, &["add", "--", file]);
    git(repo, &["commit", "--quiet", "-m", &format!("Write {file}")]);
}

fn read(repo: &Path, file: &str) -> String {
    fs::read_to_string(repo.join(file)).unwrap()
}

/// `topic` and `main` both change `notes.txt` from the same base.
fn diverged(dir: &TempDir) -> &Path {
    let repo = dir.path();
    git(repo, &["switch", "--quiet", "--create", "topic"]);
    commit_file(repo, "notes.txt", "topic\n");
    git(repo, &["switch", "--quiet", "main"]);
    commit_file(repo, "notes.txt", "main\n");
    repo
}

fn conflicted(repo: &Path) -> Vec<String> {
    GitWorkingTree::default().status(repo).unwrap().conflicted
}

fn stash() -> GitStashStore {
    GitStashStore::default()
}

fn resolver() -> GitConflictResolver {
    GitConflictResolver::default()
}

#[test]
fn saving_and_popping_a_stash_restores_the_changes() {
    let dir = repository();
    let repo = dir.path();
    fs::write(repo.join("notes.txt"), "work in progress\n").unwrap();

    stash().save(repo, Some("half done"), false).unwrap();

    assert_eq!(read(repo, "notes.txt"), "base\n");
    let stashes = stash().stashes(repo).unwrap();
    assert_eq!(stashes.len(), 1);
    assert!(stashes[0].message.contains("half done"), "{stashes:?}");

    stash().apply(repo, 0, true).unwrap();
    assert_eq!(read(repo, "notes.txt"), "work in progress\n");
    assert_eq!(stash().stashes(repo).unwrap().len(), 0);
}

#[test]
fn applying_keeps_the_entry_and_dropping_removes_it() {
    let dir = repository();
    let repo = dir.path();
    fs::write(repo.join("notes.txt"), "kept\n").unwrap();
    stash().save(repo, None, false).unwrap();

    stash().apply(repo, 0, false).unwrap();
    assert_eq!(stash().stashes(repo).unwrap().len(), 1);

    stash().remove(repo, 0).unwrap();
    assert_eq!(stash().stashes(repo).unwrap().len(), 0);
    assert!(matches!(
        stash().remove(repo, 0),
        Err(RepositoryError::StashNotFound { index: 0 })
    ));
}

#[test]
fn untracked_files_are_only_stashed_when_asked() {
    let dir = repository();
    let repo = dir.path();
    fs::write(repo.join("new.txt"), "new\n").unwrap();

    assert!(matches!(
        stash().save(repo, None, false),
        Err(RepositoryError::NothingToStash)
    ));
    stash().save(repo, None, true).unwrap();
    assert!(!repo.join("new.txt").exists());
}

#[test]
fn a_conflicting_pop_keeps_the_stash_entry() {
    let dir = repository();
    let repo = dir.path();
    fs::write(repo.join("notes.txt"), "stashed\n").unwrap();
    stash().save(repo, None, false).unwrap();
    commit_file(repo, "notes.txt", "committed\n");

    let result = stash().apply(repo, 0, true);

    assert!(
        matches!(result, Err(RepositoryError::StashConflict { .. })),
        "{result:?}"
    );
    assert_eq!(stash().stashes(repo).unwrap().len(), 1);
    assert_eq!(conflicted(repo), ["notes.txt"]);
}

#[test]
fn a_merge_conflict_resolved_with_the_incoming_side_can_be_concluded() {
    let dir = repository();
    let repo = diverged(&dir);
    assert!(!try_git(repo, &["merge", "topic"]));
    assert_eq!(resolver().operation(repo).unwrap(), Some(Operation::Merge));

    assert!(matches!(
        resolver().continue_operation(repo),
        Err(RepositoryError::UnresolvedConflicts)
    ));
    resolver()
        .take(repo, "notes.txt", ConflictSide::Incoming)
        .unwrap();
    resolver().continue_operation(repo).unwrap();

    assert_eq!(read(repo, "notes.txt"), "topic\n");
    assert_eq!(resolver().operation(repo).unwrap(), None);
    assert!(try_git(repo, &["rev-parse", "--verify", "HEAD^2"]));
}

#[test]
fn during_a_rebase_mine_is_the_commit_being_replayed() {
    let dir = repository();
    let repo = diverged(&dir);
    git(repo, &["switch", "--quiet", "topic"]);
    assert!(!try_git(repo, &["rebase", "main"]));
    assert_eq!(resolver().operation(repo).unwrap(), Some(Operation::Rebase));

    resolver()
        .take(repo, "notes.txt", ConflictSide::Mine)
        .unwrap();
    resolver().continue_operation(repo).unwrap();

    assert_eq!(read(repo, "notes.txt"), "topic\n");
    assert_eq!(resolver().operation(repo).unwrap(), None);
}

#[test]
fn hand_resolved_files_are_staged_by_marking_them() {
    let dir = repository();
    let repo = diverged(&dir);
    assert!(!try_git(repo, &["merge", "topic"]));
    fs::write(repo.join("notes.txt"), "both\n").unwrap();

    resolver()
        .mark_resolved(repo, &["notes.txt".to_owned()])
        .unwrap();

    assert_eq!(conflicted(repo), Vec::<String>::new());
    resolver().continue_operation(repo).unwrap();
    assert_eq!(read(repo, "notes.txt"), "both\n");
}

#[test]
fn aborting_returns_to_before_the_merge() {
    let dir = repository();
    let repo = diverged(&dir);
    assert!(!try_git(repo, &["merge", "topic"]));

    resolver().abort(repo).unwrap();

    assert_eq!(read(repo, "notes.txt"), "main\n");
    assert_eq!(resolver().operation(repo).unwrap(), None);
    assert!(matches!(
        resolver().abort(repo),
        Err(RepositoryError::NoOperationInProgress)
    ));
}

#[test]
fn keeping_the_side_that_deleted_a_file_deletes_it() {
    let dir = repository();
    let repo = dir.path();
    git(repo, &["switch", "--quiet", "--create", "topic"]);
    git(repo, &["rm", "--quiet", "notes.txt"]);
    git(repo, &["commit", "--quiet", "-m", "Remove notes"]);
    git(repo, &["switch", "--quiet", "main"]);
    commit_file(repo, "notes.txt", "edited\n");
    assert!(!try_git(repo, &["merge", "topic"]));

    resolver()
        .take(repo, "notes.txt", ConflictSide::Incoming)
        .unwrap();

    assert!(!repo.join("notes.txt").exists());
    assert_eq!(conflicted(repo), Vec::<String>::new());
}

#[test]
fn a_dropped_stash_can_be_restored() {
    let dir = repository();
    let repo = dir.path();
    fs::write(repo.join("notes.txt"), "keep me\n").unwrap();
    stash().save(repo, Some("precious"), false).unwrap();
    let dropped = stash().stashes(repo).unwrap().remove(0);

    stash().remove(repo, 0).unwrap();
    stash().restore(repo, &dropped).unwrap();

    let back = stash().stashes(repo).unwrap();
    assert_eq!(back.len(), 1);
    assert_eq!(back[0].id, dropped.id);
    assert!(back[0].message.contains("precious"));
}
