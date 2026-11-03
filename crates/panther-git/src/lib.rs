//! Git Panther git adapters.
//!
//! Implements domain ports with libgit2 for fast local access and with the
//! system git CLI for network operations and the history walk.

mod cli;
mod commit_log;
mod libgit2;

pub use cli::{GitCliCloner, SystemGitProbe};
pub use commit_log::GitCommitLog;
pub use libgit2::{Git2CommitLog, Git2RepositoryOpener};
