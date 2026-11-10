//! Merge and rebase keep working with uncommitted changes in the way.

use std::fs;
use std::path::Path;
use std::process::Command;

use panther_domain::ports::HistoryEditor;
use panther_git::GitHistoryEditor;
use tempfile::TempDir;

fn git(dir: &Path, args: &[&str]) {
    let status = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Tests")
        .env("GIT_AUTHOR_EMAIL", "tests@git-panther.invalid")
        .env("GIT_COMMITTER_NAME", "Tests")
        .env("GIT_COMMITTER_EMAIL", "tests@git-panther.invalid")
        .output()
        .unwrap();
    assert!(status.status.success(), "git {args:?}: {status:?}");
}

/// `main` and `topic` each with a commit of their own; `topic` checked out
/// with an uncommitted edit to its own file.
fn diverged_with_changes() -> TempDir {
    let dir = TempDir::new().unwrap();
    let path = dir.path();
    git(path, &["init", "-q", "-b", "main"]);
    git(path, &["config", "core.autocrlf", "false"]);
    fs::write(path.join("shared.txt"), "base\n").unwrap();
    git(path, &["add", "."]);
    git(path, &["commit", "-qm", "base"]);
    git(path, &["switch", "-qc", "topic"]);
    fs::write(path.join("topic.txt"), "topic\n").unwrap();
    git(path, &["add", "."]);
    git(path, &["commit", "-qm", "topic"]);
    git(path, &["switch", "-q", "main"]);
    fs::write(path.join("main.txt"), "main\n").unwrap();
    git(path, &["add", "."]);
    git(path, &["commit", "-qm", "main"]);
    git(path, &["switch", "-q", "topic"]);
    fs::write(path.join("topic.txt"), "topic\nwork in progress\n").unwrap();
    dir
}

#[test]
fn rebasing_puts_uncommitted_changes_aside_and_back() {
    let dir = diverged_with_changes();
    GitHistoryEditor::default()
        .rebase(dir.path(), "main")
        .unwrap();
    assert!(dir.path().join("main.txt").exists(), "rebased onto main");
    assert_eq!(
        fs::read_to_string(dir.path().join("topic.txt")).unwrap(),
        "topic\nwork in progress\n"
    );
}

#[test]
fn merging_puts_uncommitted_changes_aside_and_back() {
    let dir = diverged_with_changes();
    GitHistoryEditor::default()
        .merge(dir.path(), "main")
        .unwrap();
    assert!(dir.path().join("main.txt").exists(), "merged main");
    assert_eq!(
        fs::read_to_string(dir.path().join("topic.txt")).unwrap(),
        "topic\nwork in progress\n"
    );
}
