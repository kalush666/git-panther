//! Git Panther use cases.
//!
//! Each use case represents one user intention and depends only on domain
//! ports, which the composition root fills with concrete adapters.

pub mod check_git_installation;
pub mod clone_repository;
pub mod open_repository;
pub mod recent_repositories;

#[cfg(test)]
mod test_support;
