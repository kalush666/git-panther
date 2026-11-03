//! Git Panther git adapters.
//!
//! Implements domain ports with libgit2 for fast local access and with the
//! system git CLI for network operations.

mod cli;
mod libgit2;

pub use cli::{GitCliCloner, SystemGitProbe};
pub use libgit2::Git2RepositoryOpener;
