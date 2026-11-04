//! Integration tests for [`GitRemoteSync`]: two clones of one bare origin.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use panther_domain::ports::RemoteSync;
use panther_domain::remote::{PullStrategy, PushOptions};
use panther_domain::repository::{CancellationToken, RepositoryError};
use panther_git::GitRemoteSync;
use tempfile::TempDir;

/// Runs git in `dir`, panicking with its output if it fails.
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
    String::from_utf8_lossy(&output.stdout).into_owned()
}

struct Remote {
    _dir: TempDir,
    origin: PathBuf,
    alice: PathBuf,
    bob: PathBuf,
}

/// A bare `origin` with one commit on `main`, cloned as `alice` and `bob`.
fn remote() -> Remote {
    let dir = TempDir::new().unwrap();
    let seed = dir.path().join("seed");
    fs::create_dir(&seed).unwrap();
    git(
        &seed,
        &[
            "-c",
            "core.autocrlf=false",
            "init",
            "--quiet",
            "--initial-branch=main",
        ],
    );
    configure(&seed);
    fs::write(seed.join("shared.txt"), "one\n").unwrap();
    git(&seed, &["add", "."]);
    git(&seed, &["commit", "--quiet", "-m", "Seed"]);

    let origin = dir.path().join("origin.git");
    git(
        dir.path(),
        &["clone", "--quiet", "--bare", "seed", "origin.git"],
    );
    let clone = |name: &str| {
        // autocrlf off from the start, so checkouts match the committed bytes.
        git(
            dir.path(),
            &[
                "-c",
                "core.autocrlf=false",
                "clone",
                "--quiet",
                "origin.git",
                name,
            ],
        );
        let path = dir.path().join(name);
        configure(&path);
        path
    };
    let alice = clone("alice");
    let bob = clone("bob");
    Remote {
        _dir: dir,
        origin,
        alice,
        bob,
    }
}

fn configure(repo: &Path) {
    git(repo, &["config", "user.name", "Git Panther Tests"]);
    git(repo, &["config", "user.email", "tests@git-panther.invalid"]);
    git(repo, &["config", "core.autocrlf", "false"]);
    git(repo, &["config", "commit.gpgsign", "false"]);
}

fn commit_file(repo: &Path, file: &str, text: &str) {
    fs::write(repo.join(file), text).unwrap();
    git(repo, &["add", file]);
    git(
        repo,
        &["commit", "--quiet", "-m", &format!("Change {file}")],
    );
}

fn sync() -> GitRemoteSync {
    GitRemoteSync::default()
}

fn pull(repo: &Path, strategy: PullStrategy) -> Result<(), RepositoryError> {
    sync().pull(repo, strategy, &mut |_| {}, &CancellationToken::default())
}

fn push(repo: &Path) -> Result<(), RepositoryError> {
    sync().push(
        repo,
        &PushOptions::default(),
        &mut |_| {},
        &CancellationToken::default(),
    )
}

fn head(repo: &Path) -> String {
    git(repo, &["rev-parse", "HEAD"]).trim().to_owned()
}

#[test]
fn lists_remotes_with_their_url() {
    let remote = remote();
    let remotes = sync().remotes(&remote.alice).unwrap();
    assert_eq!(remotes.len(), 1);
    assert_eq!(remotes[0].name, "origin");
    assert!(remotes[0].url.contains("origin.git"));
}

#[test]
fn pushed_commits_reach_another_clone_by_fetch_and_pull() {
    let remote = remote();
    commit_file(&remote.alice, "alice.txt", "hi\n");

    push(&remote.alice).unwrap();
    sync()
        .fetch(&remote.bob, &mut |_| {}, &CancellationToken::default())
        .unwrap();
    pull(&remote.bob, PullStrategy::FastForwardOnly).unwrap();

    assert_eq!(head(&remote.bob), head(&remote.alice));
}

#[test]
fn first_push_of_a_new_branch_sets_its_upstream() {
    let remote = remote();
    git(&remote.alice, &["switch", "--quiet", "--create", "topic"]);
    commit_file(&remote.alice, "topic.txt", "topic\n");

    push(&remote.alice).unwrap();

    let upstream = git(
        &remote.alice,
        &["rev-parse", "--abbrev-ref", "topic@{upstream}"],
    );
    assert_eq!(upstream.trim(), "origin/topic");
    git(
        &remote.origin,
        &["rev-parse", "--verify", "refs/heads/topic"],
    );
}

#[test]
fn diverged_branches_reject_pushes_and_fast_forward_pulls() {
    let remote = remote();
    commit_file(&remote.alice, "alice.txt", "alice\n");
    push(&remote.alice).unwrap();
    commit_file(&remote.bob, "bob.txt", "bob\n");

    assert!(matches!(
        push(&remote.bob),
        Err(RepositoryError::PushRejected { .. })
    ));
    assert!(matches!(
        pull(&remote.bob, PullStrategy::FastForwardOnly),
        Err(RepositoryError::NotFastForward)
    ));

    pull(&remote.bob, PullStrategy::Merge).unwrap();
    push(&remote.bob).unwrap();
    assert!(remote.bob.join("alice.txt").exists());
}

#[test]
fn rebase_pull_replays_local_commits_on_top() {
    let remote = remote();
    commit_file(&remote.alice, "alice.txt", "alice\n");
    push(&remote.alice).unwrap();
    commit_file(&remote.bob, "bob.txt", "bob\n");

    pull(&remote.bob, PullStrategy::Rebase).unwrap();

    let parents = git(&remote.bob, &["rev-list", "--parents", "-n", "1", "HEAD"]);
    assert_eq!(
        parents.split_whitespace().count(),
        2,
        "rebase keeps history linear"
    );
}

#[test]
fn conflicting_pulls_report_the_conflict() {
    let remote = remote();
    commit_file(&remote.alice, "shared.txt", "alice\n");
    push(&remote.alice).unwrap();
    commit_file(&remote.bob, "shared.txt", "bob\n");

    let result = pull(&remote.bob, PullStrategy::Merge);

    assert!(
        matches!(result, Err(RepositoryError::PullConflict { .. })),
        "{result:?}"
    );
}

#[test]
fn pulling_a_branch_without_upstream_is_explained() {
    let remote = remote();
    git(
        &remote.alice,
        &["switch", "--quiet", "--create", "local-only"],
    );

    assert!(matches!(
        pull(&remote.alice, PullStrategy::FastForwardOnly),
        Err(RepositoryError::NoUpstream { .. })
    ));
}

#[test]
fn force_push_with_lease_replaces_a_rewritten_branch() {
    let remote = remote();
    commit_file(&remote.alice, "alice.txt", "alice\n");
    push(&remote.alice).unwrap();
    git(
        &remote.alice,
        &["commit", "--quiet", "--amend", "-m", "Rewritten"],
    );

    assert!(matches!(
        push(&remote.alice),
        Err(RepositoryError::PushRejected { .. })
    ));
    let force = PushOptions {
        force_with_lease: true,
        ..PushOptions::default()
    };
    sync()
        .push(
            &remote.alice,
            &force,
            &mut |_| {},
            &CancellationToken::default(),
        )
        .unwrap();
    assert_eq!(
        git(&remote.origin, &["rev-parse", "main"]).trim(),
        head(&remote.alice)
    );
}

#[test]
fn manages_remotes_and_pushes_to_a_chosen_one() {
    use panther_domain::ports::RemoteConfig;
    use panther_domain::remote::RemoteName;
    use panther_git::GitRemoteConfig;

    let remote = remote();
    let config = GitRemoteConfig::default();
    let mirror = remote.origin.with_file_name("mirror.git");
    git(
        remote.origin.parent().unwrap(),
        &["init", "--quiet", "--bare", "mirror.git"],
    );
    let name = RemoteName::parse("mirror").unwrap();
    config
        .add(&remote.alice, &name, &mirror.to_string_lossy())
        .unwrap();
    assert!(matches!(
        config.add(&remote.alice, &name, "elsewhere"),
        Err(RepositoryError::RemoteExists { .. })
    ));

    let options = PushOptions {
        remote: Some(name.clone()),
        ..PushOptions::default()
    };
    sync()
        .push(
            &remote.alice,
            &options,
            &mut |_| {},
            &CancellationToken::default(),
        )
        .unwrap();
    git(&mirror, &["rev-parse", "--verify", "refs/heads/main"]);

    config.delete_branch(&remote.alice, &name, "main").unwrap();
    assert!(
        git_fails(&mirror, &["rev-parse", "--verify", "refs/heads/main"]),
        "the branch is gone from the mirror"
    );

    config
        .set_url(&remote.alice, &name, "../other.git")
        .unwrap();
    config.remove(&remote.alice, &name).unwrap();
    assert!(matches!(
        config.remove(&remote.alice, &name),
        Err(RepositoryError::RemoteNotFound { .. })
    ));
}

#[test]
fn lists_adds_and_removes_worktrees() {
    use panther_domain::ports::RepositoryLayout;
    use panther_git::GitRepositoryLayout;

    let remote = remote();
    let layout = GitRepositoryLayout::default();
    git(&remote.alice, &["branch", "topic"]);
    let extra = remote.alice.with_file_name("alice-topic");

    layout.add_worktree(&remote.alice, &extra, "topic").unwrap();
    let worktrees = layout.worktrees(&remote.alice).unwrap();
    assert_eq!(worktrees.len(), 2);
    assert!(worktrees[0].is_main);
    assert_eq!(worktrees[1].branch.as_deref(), Some("topic"));

    layout.remove_worktree(&remote.alice, &extra).unwrap();
    assert_eq!(layout.worktrees(&remote.alice).unwrap().len(), 1);
    assert!(!layout.lfs(&remote.alice).unwrap().used);
    fs::write(
        remote.alice.join(".gitattributes"),
        "*.psd filter=lfs diff=lfs merge=lfs -text\n",
    )
    .unwrap();
    assert!(layout.lfs(&remote.alice).unwrap().used);
}

/// Whether git fails in `dir`.
fn git_fails(dir: &Path, args: &[&str]) -> bool {
    !Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .expect("git runs")
        .status
        .success()
}
