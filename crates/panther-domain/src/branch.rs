//! Branches: names, kinds and what they point at.

use std::fmt;

use crate::commit::CommitId;

/// A valid local branch name (the part after `refs/heads/`).
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct BranchName(String);

/// Why a branch name was rejected, in words the UI can show.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("\"{name}\" is not a valid branch name: {reason}.")]
pub struct InvalidBranchName {
    pub name: String,
    pub reason: &'static str,
}

const FORBIDDEN_CHARACTERS: &[char] = &[' ', '~', '^', ':', '?', '*', '[', '\\'];

/// The first of git's reference-name rules (`check-ref-format`) that `name`
/// breaks, if any.
// git's ".lock" rule is case-sensitive (`x.LOCK` is a valid name).
#[allow(clippy::case_sensitive_file_extension_comparisons)]
pub(crate) fn ref_name_problem(name: &str) -> Option<&'static str> {
    if name.is_empty() {
        return Some("it is empty");
    }
    if name == "@" || name == "HEAD" {
        return Some("it is reserved by git");
    }
    if name.starts_with('-') {
        return Some("it cannot start with a dash");
    }
    if name.starts_with('/') || name.ends_with('/') || name.contains("//") {
        return Some("slashes must separate non-empty parts");
    }
    if name.ends_with('.') || name.ends_with(".lock") {
        return Some("it cannot end with \".\" or \".lock\"");
    }
    if name.contains("..") || name.contains("@{") {
        return Some("it cannot contain \"..\" or \"@{\"");
    }
    if name.split('/').any(|part| part.starts_with('.')) {
        return Some("no part may start with a dot");
    }
    if name
        .chars()
        .any(|c| c.is_control() || FORBIDDEN_CHARACTERS.contains(&c))
    {
        return Some("it cannot contain spaces or any of ~ ^ : ? * [ \\");
    }
    None
}

impl BranchName {
    /// Applies git's `check-ref-format --branch` rules.
    ///
    /// # Errors
    /// [`InvalidBranchName`] explaining the first rule the name breaks.
    pub fn parse(input: &str) -> Result<Self, InvalidBranchName> {
        let name = input.trim();
        match ref_name_problem(name) {
            Some(reason) => Err(InvalidBranchName {
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

impl fmt::Display for BranchName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BranchKind {
    Local,
    Remote,
}

/// A branch and the commit it points at.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Branch {
    /// Short name: `main` for local branches, `origin/main` for remote ones.
    pub name: String,
    pub kind: BranchKind,
    pub target: CommitId,
    /// The remote branch a local branch tracks, e.g. `origin/main`.
    pub upstream: Option<String>,
    /// Commits on this branch that its upstream lacks, and vice versa.
    pub ahead: u32,
    pub behind: u32,
    pub is_head: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_common_branch_names() {
        for name in [
            "main",
            "feature/login",
            "fix-123",
            "release/2.0",
            "user.name/topic",
        ] {
            assert_eq!(BranchName::parse(name).unwrap().as_str(), name);
        }
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(BranchName::parse("  topic \n").unwrap().as_str(), "topic");
    }

    #[test]
    fn rejects_names_git_would_refuse() {
        for bad in [
            "",
            "HEAD",
            "-x",
            "/x",
            "x/",
            "a//b",
            "x.",
            "x.lock",
            "a..b",
            "a@{1",
            ".hidden",
            "a/.b",
            "has space",
            "a~1",
            "a^",
            "a:b",
            "a?",
            "a*",
            "a[b",
            "a\\b",
        ] {
            assert!(
                BranchName::parse(bad).is_err(),
                "{bad:?} should be rejected"
            );
        }
    }

    #[test]
    fn explains_the_rule_that_was_broken() {
        let error = BranchName::parse("has space").unwrap_err();
        assert_eq!(
            error.to_string(),
            "\"has space\" is not a valid branch name: it cannot contain spaces or any of ~ ^ : ? * [ \\."
        );
    }
}
