//! Fast-forward, upstream and push-to-a-named-branch against real repositories.

use std::fs;
use std::path::Path;
use std::process::Command;

use panther_domain::branch::BranchName;
use panther_domain::ports::{BranchStore, RemoteSync};
use panther_domain::remote::PushOptions;
use panther_domain::repository::{CancellationToken, RepositoryError};
use panther_git::{GitBranchStore, GitRemoteSync};
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

fn commit(dir: &Path, name: &str) {
    fs::write(dir.join(name), name).unwrap();
    git(dir, &["add", "."]);
    git(dir, &["commit", "-qm", name]);
}

fn rev(dir: &Path, name: &str) -> String {
    git(dir, &["rev-parse", name]).trim().to_owned()
}

/// `main` with `ahead` one commit further, `main` checked out.
fn repository() -> TempDir {
    let dir = TempDir::new().unwrap();
    git(dir.path(), &["init", "-q", "-b", "main"]);
    commit(dir.path(), "base.txt");
    git(dir.path(), &["switch", "-qc", "ahead"]);
    commit(dir.path(), "more.txt");
    git(dir.path(), &["switch", "-q", "main"]);
    dir
}

fn name(branch: &str) -> BranchName {
    BranchName::parse(branch).unwrap()
}

#[test]
fn fast_forwards_checked_out_and_other_branches() {
    let dir = repository();
    let store = GitBranchStore::default();
    git(dir.path(), &["branch", "behind", "main"]);

    store
        .fast_forward(dir.path(), &name("behind"), "ahead")
        .unwrap();
    assert_eq!(rev(dir.path(), "behind"), rev(dir.path(), "ahead"));

    store
        .fast_forward(dir.path(), &name("main"), "ahead")
        .unwrap();
    assert_eq!(rev(dir.path(), "main"), rev(dir.path(), "ahead"));
    assert!(dir.path().join("more.txt").exists(), "work tree moved too");
}

#[test]
fn refuses_to_fast_forward_diverged_branches() {
    let dir = repository();
    commit(dir.path(), "main-only.txt");
    let result = GitBranchStore::default().fast_forward(dir.path(), &name("ahead"), "main");
    assert!(
        matches!(result, Err(RepositoryError::NotFastForward)),
        "{result:?}"
    );
}

#[test]
fn pushes_any_branch_to_a_named_remote_branch_and_tracks_it() {
    let dir = repository();
    let remote = TempDir::new().unwrap();
    git(remote.path(), &["init", "-q", "--bare"]);
    let url = remote.path().to_string_lossy().replace('\\', "/");
    git(dir.path(), &["remote", "add", "origin", &url]);

    let options = PushOptions {
        source: Some("ahead".into()),
        target: Some("review/ahead".into()),
        ..PushOptions::default()
    };
    GitRemoteSync::default()
        .push(
            dir.path(),
            &options,
            &mut |_| {},
            &CancellationToken::default(),
        )
        .unwrap();
    assert_eq!(rev(remote.path(), "review/ahead"), rev(dir.path(), "ahead"));
    assert_eq!(
        git(
            dir.path(),
            &["rev-parse", "--abbrev-ref", "ahead@{upstream}"]
        )
        .trim(),
        "origin/review/ahead"
    );

    let store = GitBranchStore::default();
    store
        .set_upstream(dir.path(), &name("ahead"), None)
        .unwrap();
    git(dir.path(), &["fetch", "-q", "origin"]);
    store
        .set_upstream(dir.path(), &name("main"), Some("origin/review/ahead"))
        .unwrap();
    assert_eq!(
        git(
            dir.path(),
            &["rev-parse", "--abbrev-ref", "main@{upstream}"]
        )
        .trim(),
        "origin/review/ahead"
    );
}

#[test]
fn deletes_a_tag_on_the_remote_but_keeps_it_here() {
    use panther_domain::history::TagName;
    use panther_domain::ports::TagStore;
    use panther_git::GitTagStore;

    let dir = repository();
    let remote = TempDir::new().unwrap();
    git(remote.path(), &["init", "-q", "--bare"]);
    let url = remote.path().to_string_lossy().replace('\\', "/");
    git(dir.path(), &["remote", "add", "origin", &url]);
    git(dir.path(), &["tag", "v1.0"]);
    let tags = GitTagStore::default();
    let name = TagName::parse("v1.0").unwrap();
    tags.push(dir.path(), &name).unwrap();
    assert_eq!(git(remote.path(), &["tag", "--list"]).trim(), "v1.0");

    tags.delete_remote(dir.path(), &name).unwrap();
    assert_eq!(git(remote.path(), &["tag", "--list"]).trim(), "");
    assert_eq!(git(dir.path(), &["tag", "--list"]).trim(), "v1.0");
}
