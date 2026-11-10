//! Git Panther git adapters.
//!
//! Implements domain ports with libgit2 for fast local access and with the
//! system git CLI for network operations and the history walk.

pub mod activity;
mod bisector;
mod branch_store;
mod cli;
mod commit_log;
mod conflict_resolver;
mod credential_store;
mod history_editor;
mod identity_config;
mod libgit2;
mod remote_config;
mod remote_sync;
mod repository_layout;
mod stash_store;
mod tag_store;
mod working_tree;

pub use bisector::GitBisector;
pub use branch_store::GitBranchStore;
pub use cli::{GitCliCloner, SystemGitProbe};
pub use commit_log::GitCommitLog;
pub use conflict_resolver::GitConflictResolver;
pub use credential_store::GitCredentialStore;
pub use history_editor::GitHistoryEditor;
pub use identity_config::GitIdentityConfig;
pub use libgit2::{Git2CommitLog, Git2RepositoryOpener};
pub use remote_config::GitRemoteConfig;
pub use remote_sync::GitRemoteSync;
pub use repository_layout::GitRepositoryLayout;
pub use stash_store::GitStashStore;
pub use tag_store::GitTagStore;
pub use working_tree::{GitCommitWriter, GitWorkingTree};
