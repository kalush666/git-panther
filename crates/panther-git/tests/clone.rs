//! Integration tests for [`GitCliCloner`], cloning from local repositories so
//! no network access is needed.

mod support;

use std::fs;
use std::path::Path;

use panther_domain::ports::{RepositoryCloner, RepositoryOpener};
use panther_domain::repository::{
    CancellationToken, CloneRequest, HeadState, RemoteUrl, RepositoryError,
};
use panther_git::{Git2RepositoryOpener, GitCliCloner};
use tempfile::TempDir;

fn request(source: &Path, destination: &Path) -> CloneRequest {
    CloneRequest {
        url: RemoteUrl::parse(source.to_str().unwrap()).unwrap(),
        destination: destination.to_path_buf(),
    }
}

fn clone(request: &CloneRequest, cancel: &CancellationToken) -> Result<(), RepositoryError> {
    GitCliCloner::default().clone_repository(request, &mut |_| {}, cancel)
}

#[test]
fn clones_a_local_repository() {
    let dir = TempDir::new().unwrap();
    let source = dir.path().join("source");
    support::repository_with_commit(&source);
    let destination = dir.path().join("copy");

    clone(
        &request(&source, &destination),
        &CancellationToken::default(),
    )
    .unwrap();

    let summary = Git2RepositoryOpener.open(&destination).unwrap();
    assert_eq!(summary.head, HeadState::Branch("main".into()));
}

#[test]
fn clones_into_an_existing_empty_folder() {
    let dir = TempDir::new().unwrap();
    let source = dir.path().join("source");
    support::repository_with_commit(&source);
    let destination = dir.path().join("empty");
    fs::create_dir(&destination).unwrap();

    clone(
        &request(&source, &destination),
        &CancellationToken::default(),
    )
    .unwrap();

    assert!(destination.join(".git").is_dir());
}

#[test]
fn refuses_a_non_empty_destination() {
    let dir = TempDir::new().unwrap();
    let source = dir.path().join("source");
    support::repository_with_commit(&source);
    let destination = dir.path().join("busy");
    fs::create_dir(&destination).unwrap();
    fs::write(destination.join("keep.txt"), "user data").unwrap();

    let result = clone(
        &request(&source, &destination),
        &CancellationToken::default(),
    );

    assert!(matches!(
        result,
        Err(RepositoryError::DestinationNotEmpty { .. })
    ));
    assert!(
        destination.join("keep.txt").exists(),
        "user files must be untouched"
    );
}

#[test]
fn explains_failures_and_removes_the_partial_folder() {
    let dir = TempDir::new().unwrap();
    let destination = dir.path().join("copy");
    let missing_source = dir.path().join("does-not-exist");

    let result = clone(
        &request(&missing_source, &destination),
        &CancellationToken::default(),
    );

    let Err(RepositoryError::CloneFailed { details }) = result else {
        panic!("expected CloneFailed, got {result:?}");
    };
    assert!(
        details.contains("does-not-exist"),
        "details were: {details}"
    );
    assert!(!destination.exists());
}

#[test]
fn cancellation_stops_the_clone_and_cleans_up() {
    let dir = TempDir::new().unwrap();
    let source = dir.path().join("source");
    support::repository_with_commit(&source);
    let destination = dir.path().join("copy");
    let cancel = CancellationToken::default();
    cancel.cancel();

    let result = clone(&request(&source, &destination), &cancel);

    assert!(matches!(result, Err(RepositoryError::Cancelled)));
    assert!(!destination.exists());
}
