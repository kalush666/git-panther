//! Remotes and how local work is synchronized with them.

/// A configured remote, e.g. `origin`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Remote {
    pub name: String,
    /// The fetch URL, as written in the git config.
    pub url: String,
}

/// How `pull` combines fetched work with local commits.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PullStrategy {
    /// Only move the branch forward; refuse if it has diverged.
    #[default]
    FastForwardOnly,
    /// Create a merge commit when the branch has diverged.
    Merge,
    /// Replay local commits on top of the fetched ones.
    Rebase,
}

/// Explains how to fix authentication in the user's own git setup, since
/// Git Panther never stores credentials itself.
pub const AUTHENTICATION_HINT: &str = "Git Panther uses your git credentials. Sign in once with git in a terminal, or configure a credential helper or SSH key for this remote.";
