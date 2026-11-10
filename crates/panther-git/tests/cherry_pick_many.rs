//! Cherry-picking several commits as one sequence.

use std::fs;
use std::path::Path;
use std::process::Command;

use panther_domain::commit::CommitId;
use panther_domain::ports::HistoryEditor;
use panther_git::GitHistoryEditor;
use tempfile::TempDir;

fn git(dir: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Tests")
        .env("GIT_AUTHOR_EMAIL", "tests@git-panther.invalid")
        .env("GIT_COMMITTER_NAME", "Tests")
        .env("GIT_COMMITTER_EMAIL", "tests@git-panther.invalid")
        .output()
        .unwrap();
    assert!(output.status.success(), "git {args:?}: {output:?}");
    String::from_utf8(output.stdout).unwrap()
}

fn commit_file(dir: &Path, name: &str) -> CommitId {
    fs::write(dir.join(name), name).unwrap();
    git(dir, &["add", "."]);
    git(dir, &["commit", "-qm", name]);
    CommitId::parse(git(dir, &["rev-parse", "HEAD"]).trim()).unwrap()
}

#[test]
fn applies_several_commits_oldest_first() {
    let dir = TempDir::new().unwrap();
    let path = dir.path();
    git(path, &["init", "-q", "-b", "main"]);
    commit_file(path, "base.txt");
    git(path, &["switch", "-qc", "topic"]);
    let first = commit_file(path, "one.txt");
    let second = commit_file(path, "two.txt");
    git(path, &["switch", "-q", "main"]);

    GitHistoryEditor::default()
        .cherry_pick_many(path, &[first, second])
        .unwrap();

    assert!(path.join("one.txt").exists() && path.join("two.txt").exists());
    let log = git(path, &["log", "--format=%s", "-3"]);
    assert_eq!(log, "two.txt\none.txt\nbase.txt\n");
}
