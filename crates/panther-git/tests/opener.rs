//! Integration tests for [`Git2RepositoryOpener`] against real repositories.

mod support;

use std::fs;

use panther_domain::ports::RepositoryOpener;
use panther_domain::repository::{HeadState, RepositoryError};
use panther_git::Git2RepositoryOpener;
use tempfile::TempDir;

/// The single spelling the opener reports for a folder.
fn canonical(path: &std::path::Path) -> std::path::PathBuf {
    dunce::canonicalize(path).unwrap()
}

#[test]
fn opens_repository_on_its_branch() {
    let dir = TempDir::new().unwrap();
    support::repository_with_commit(dir.path());

    let summary = Git2RepositoryOpener.open(dir.path()).unwrap();

    assert_eq!(summary.head, HeadState::Branch("main".into()));
    assert_eq!(summary.path, canonical(dir.path()));
}

#[test]
fn opening_a_subfolder_finds_the_repository_root() {
    let dir = TempDir::new().unwrap();
    support::repository_with_commit(dir.path());
    let nested = dir.path().join("src").join("deep");
    fs::create_dir_all(&nested).unwrap();

    let summary = Git2RepositoryOpener.open(&nested).unwrap();

    assert_eq!(summary.path, canonical(dir.path()));
}

#[test]
fn reports_detached_head_by_short_id() {
    let dir = TempDir::new().unwrap();
    let repository = support::repository_with_commit(dir.path());
    let head = repository.head().unwrap().target().unwrap();
    repository.set_head_detached(head).unwrap();

    let summary = Git2RepositoryOpener.open(dir.path()).unwrap();

    let HeadState::Detached(short_id) = summary.head else {
        panic!("expected detached HEAD, got {:?}", summary.head);
    };
    assert!(head.to_string().starts_with(&short_id));
}

#[test]
fn rejects_missing_folders() {
    let dir = TempDir::new().unwrap();
    let missing = dir.path().join("missing");
    assert!(matches!(
        Git2RepositoryOpener.open(&missing),
        Err(RepositoryError::NotFound { .. })
    ));
}

#[test]
fn rejects_folders_outside_any_repository() {
    let dir = TempDir::new().unwrap();
    assert!(matches!(
        Git2RepositoryOpener.open(dir.path()),
        Err(RepositoryError::NotARepository { .. })
    ));
}

#[test]
fn init_creates_an_unborn_repository() {
    let dir = TempDir::new().unwrap();
    let target = dir.path().join("fresh");

    let summary = Git2RepositoryOpener.init(&target).unwrap();

    assert!(target.join(".git").is_dir());
    assert!(matches!(summary.head, HeadState::Unborn(ref branch) if !branch.is_empty()));
    assert_eq!(summary.name, "fresh");
}

#[test]
fn init_refuses_an_existing_repository() {
    let dir = TempDir::new().unwrap();
    support::repository_with_commit(dir.path());
    assert!(matches!(
        Git2RepositoryOpener.init(dir.path()),
        Err(RepositoryError::AlreadyARepository { .. })
    ));
}

/// Windows can spell one folder two ways (`C:\PROGRA~1` vs `C:\Program Files`);
/// GitHub's runners put temp folders under such a short name.
#[cfg(windows)]
#[test]
fn reports_the_long_spelling_when_opened_through_a_short_name() {
    let dir = TempDir::new().unwrap();
    let long = dir
        .path()
        .join("a-folder-name-longer-than-eight-characters");
    support::repository_with_commit(&long);
    // `raw_arg`: cmd needs the quotes verbatim, not Rust's argument escaping.
    let output = {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .arg("/c")
            .raw_arg(format!("for %I in (\"{}\") do @echo %~sI", long.display()))
            .output()
            .unwrap()
    };
    let short = std::path::PathBuf::from(String::from_utf8_lossy(&output.stdout).trim());
    assert_ne!(
        short, long,
        "8.3 short names must be enabled on this volume"
    );

    let summary = Git2RepositoryOpener.open(&short).unwrap();

    assert_eq!(summary.path, canonical(&long));
}
