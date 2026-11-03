//! Helpers that build real repositories in temporary folders.

use std::path::Path;

use git2::{Repository, RepositoryInitOptions, Signature};

/// Creates a repository on branch `main` with a single commit.
pub fn repository_with_commit(path: &Path) -> Repository {
    let mut options = RepositoryInitOptions::new();
    options.initial_head("main");
    let repository = Repository::init_opts(path, &options).expect("init test repository");
    commit_empty_tree(&repository, "initial commit");
    repository
}

fn commit_empty_tree(repository: &Repository, message: &str) {
    let signature = Signature::now("Git Panther Tests", "tests@git-panther.invalid")
        .expect("valid test signature");
    let tree_id = repository
        .index()
        .and_then(|mut index| index.write_tree())
        .expect("write empty tree");
    let tree = repository.find_tree(tree_id).expect("find written tree");
    repository
        .commit(Some("HEAD"), &signature, &signature, message, &tree, &[])
        .expect("create test commit");
}
