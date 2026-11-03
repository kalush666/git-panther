//! Git Panther git adapters.
//!
//! Implements domain ports on top of the system git CLI (and, from M1, libgit2).

mod cli;

pub use cli::SystemGitProbe;
