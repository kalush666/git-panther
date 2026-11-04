//! Adapters backed by libgit2 (via `git2`), used for fast in-process access.

pub mod branches;
mod diff;
mod log;
mod opener;
pub mod working_tree;

pub use diff::LineSelection;
pub use log::{Git2CommitLog, history_tips};
pub use opener::Git2RepositoryOpener;

fn git_error(error: &git2::Error) -> panther_domain::repository::RepositoryError {
    panther_domain::repository::RepositoryError::Git {
        details: error.message().to_owned(),
    }
}
