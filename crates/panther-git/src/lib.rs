//! Git Panther git adapters.
//!
//! Implements domain ports with libgit2 for fast local access and with the
//! system git CLI for network operations and the history walk.

mod branch_store;
mod cli;
mod commit_log;
mod conflict_resolver;
mod credential_store;
mod history_editor;
mod libgit2;
mod remote_sync;
mod stash_store;
mod tag_store;
mod working_tree;

pub use branch_store::GitBranchStore;
pub use cli::{GitCliCloner, SystemGitProbe};
pub use commit_log::GitCommitLog;
pub use conflict_resolver::GitConflictResolver;
pub use credential_store::GitCredentialStore;
pub use history_editor::GitHistoryEditor;
pub use libgit2::{Git2CommitLog, Git2RepositoryOpener};
pub use remote_sync::GitRemoteSync;
pub use stash_store::GitStashStore;
pub use tag_store::GitTagStore;
pub use working_tree::{GitCommitWriter, GitWorkingTree};
