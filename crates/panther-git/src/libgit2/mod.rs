//! Adapters backed by libgit2 (via `git2`), used for fast in-process access.

mod opener;

pub use opener::Git2RepositoryOpener;

fn git_error(error: &git2::Error) -> panther_domain::repository::RepositoryError {
    panther_domain::repository::RepositoryError::Git {
        details: error.message().to_owned(),
    }
}
