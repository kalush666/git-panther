//! Git Panther git adapters.
//!
//! Implements domain ports with libgit2 for fast local access and with the
//! system git CLI for network operations and the history walk.

mod branch_store;
mod cli;
mod commit_log;
mod conflict_resolver;
mod libgit2;
mod remote_sync;
mod stash_store;
mod working_tree;

pub use branch_store::GitBranchStore;
pub use cli::{GitCliCloner, SystemGitProbe};
pub use commit_log::GitCommitLog;
pub use conflict_resolver::GitConflictResolver;
pub use libgit2::{Git2CommitLog, Git2RepositoryOpener};
pub use remote_sync::GitRemoteSync;
pub use stash_store::GitStashStore;
pub use working_tree::{GitCommitWriter, GitWorkingTree};
