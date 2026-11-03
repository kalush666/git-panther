//! Git Panther git adapters.
//!
//! Implements domain ports with libgit2 for fast local access and with the
//! system git CLI for network operations and the history walk.

mod branch_store;
mod cli;
mod commit_log;
mod libgit2;
mod remote_sync;
mod working_tree;

pub use branch_store::GitBranchStore;
pub use cli::{GitCliCloner, SystemGitProbe};
pub use commit_log::GitCommitLog;
pub use libgit2::{Git2CommitLog, Git2RepositoryOpener};
pub use remote_sync::GitRemoteSync;
pub use working_tree::{GitCommitWriter, GitWorkingTree};
