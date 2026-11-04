//! Git Panther adapters for self-hosted code review servers.
//!
//! Each implements [`panther_domain::ports::HostingProvider`] over the
//! server's REST API. Only servers the user connects are ever contacted.

mod github;
mod gitlab;
mod http;

pub use github::GitHubProvider;
pub use gitlab::GitLabProvider;
