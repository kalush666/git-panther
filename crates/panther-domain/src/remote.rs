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

/// Where and how a push goes.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PushOptions {
    /// Push to this remote instead of the branch's upstream (or `origin`).
    pub remote: Option<RemoteName>,
    /// Overwrite the remote branch, but only if it is still where it was
    /// last fetched (`--force-with-lease`), so nobody's work is lost unseen.
    pub force_with_lease: bool,
}

/// A valid remote name, e.g. `origin` or `upstream`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RemoteName(String);

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("\"{name}\" is not a valid remote name: {reason}.")]
pub struct InvalidRemoteName {
    pub name: String,
    pub reason: &'static str,
}

impl RemoteName {
    /// # Errors
    /// [`InvalidRemoteName`] for names git would reject (or misread as an
    /// option or a path).
    pub fn parse(input: &str) -> Result<Self, InvalidRemoteName> {
        let name = input.trim();
        let reason = crate::branch::ref_name_problem(name)
            .or_else(|| name.contains('/').then_some("it cannot contain slashes"));
        match reason {
            Some(reason) => Err(InvalidRemoteName {
                name: name.to_owned(),
                reason,
            }),
            None => Ok(Self(name.to_owned())),
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for RemoteName {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_names_are_single_ref_components() {
        assert_eq!(
            RemoteName::parse(" upstream ").unwrap().as_str(),
            "upstream"
        );
        for bad in ["", "-x", "a/b", "a b", "a..b"] {
            assert!(RemoteName::parse(bad).is_err(), "{bad}");
        }
    }
}
