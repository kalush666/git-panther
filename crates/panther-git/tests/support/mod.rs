//! Helpers that build real repositories in temporary folders.

#![allow(dead_code)] // Each integration test binary uses a different subset.

use std::path::Path;

use git2::{Oid, Repository, RepositoryInitOptions, Signature, Time};

/// Creates a repository on branch `main` with a single commit.
pub fn repository_with_commit(path: &Path) -> Repository {
    let repository = empty_repository(path);
    commit(&repository, Some("HEAD"), "initial commit", &[], &[]);
    repository
}

/// Creates a repository on an unborn `main` branch.
pub fn empty_repository(path: &Path) -> Repository {
    let mut options = RepositoryInitOptions::new();
    options.initial_head("main");
    Repository::init_opts(path, &options).expect("init test repository")
}

/// Commits a tree holding exactly `files` with the given `parents`,
/// updating `reference` (e.g. `"HEAD"` or `"refs/heads/topic"`) if given.
/// Commits are timestamped one minute apart so ordering is deterministic.
pub fn commit(
    repository: &Repository,
    reference: Option<&str>,
    message: &str,
    files: &[(&str, &str)],
    parents: &[Oid],
) -> Oid {
    let mut builder = repository.treebuilder(None).expect("tree builder");
    for (name, content) in files {
        let blob = repository.blob(content.as_bytes()).expect("write blob");
        builder.insert(name, blob, 0o100_644).expect("insert blob");
    }
    let tree = repository
        .find_tree(builder.write().expect("write tree"))
        .expect("find tree");
    let parents: Vec<git2::Commit<'_>> = parents
        .iter()
        .map(|oid| repository.find_commit(*oid).expect("find parent"))
        .collect();
    let parent_refs: Vec<&git2::Commit<'_>> = parents.iter().collect();
    let seconds = 1_700_000_000 + 60 * i64::try_from(count_commits(repository)).unwrap();
    let signature = Signature::new(
        "Git Panther Tests",
        "tests@git-panther.invalid",
        &Time::new(seconds, 0),
    )
    .expect("valid test signature");
    repository
        .commit(
            reference,
            &signature,
            &signature,
            message,
            &tree,
            &parent_refs,
        )
        .expect("create test commit")
}

fn count_commits(repository: &Repository) -> usize {
    let Ok(mut walk) = repository.revwalk() else {
        return 0;
    };
    if walk.push_glob("*").is_err() {
        return 0;
    }
    walk.count()
}
