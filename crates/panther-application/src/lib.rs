//! Git Panther use cases.
//!
//! Each use case represents one user intention and depends only on domain
//! ports, which the composition root fills with concrete adapters.

pub mod branches;
pub mod check_git_installation;
pub mod clone_repository;
pub mod commit_graph;
pub mod conflicts;
pub mod open_repository;
pub mod recent_repositories;
pub mod stashes;
pub mod sync;
pub mod working_copy;

#[cfg(test)]
mod test_support;
