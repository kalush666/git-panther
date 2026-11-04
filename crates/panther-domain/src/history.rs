//! Rewriting and moving history: merge, rebase, cherry-pick, revert, reset,
//! tags, and what HEAD looked like before, so an action can be undone.

use std::fmt;

use crate::branch::ref_name_problem;
use crate::commit::CommitId;

/// How far `reset` goes beyond moving the branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResetMode {
    /// Keep the index and the work tree: the undone commits become staged.
    Soft,
    /// Keep the work tree: the undone commits become unstaged changes.
    Mixed,
    /// Throw away the index and work tree changes too.
    Hard,
}

/// Where HEAD was: on a branch (and at which commit), or detached.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HeadSnapshot {
    pub branch: Option<String>,
    pub commit: CommitId,
}

/// A valid tag name (the part after `refs/tags/`).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TagName(String);

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("\"{name}\" is not a valid tag name: {reason}.")]
pub struct InvalidTagName {
    pub name: String,
    pub reason: &'static str,
}

impl TagName {
    /// Applies git's reference-name rules.
    ///
    /// # Errors
    /// [`InvalidTagName`] explaining the first rule the name breaks.
    pub fn parse(input: &str) -> Result<Self, InvalidTagName> {
        let name = input.trim();
        match ref_name_problem(name) {
            Some(reason) => Err(InvalidTagName {
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

impl fmt::Display for TagName {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tag_names_follow_ref_rules() {
        assert_eq!(TagName::parse(" v1.2.0 ").unwrap().as_str(), "v1.2.0");
        assert!(TagName::parse("release/2026-11").is_ok());
        for bad in ["", "v1 beta", "-v1", "v1..2", "v1.lock"] {
            assert!(TagName::parse(bad).is_err(), "{bad}");
        }
    }
}
