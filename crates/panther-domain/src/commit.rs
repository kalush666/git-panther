//! Commits and the references that point at them.

use std::fmt;

/// Length of the abbreviated id shown in the UI.
pub const SHORT_ID_LENGTH: usize = 7;

/// A full commit id: 40 (SHA-1) or 64 (SHA-256) lowercase hex characters.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct CommitId(String);

/// Text that is not a full commit id.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("\"{input}\" is not a commit id.")]
pub struct InvalidCommitId {
    pub input: String,
}

impl CommitId {
    /// # Errors
    /// [`InvalidCommitId`] unless `hex` is 40 or 64 hex characters.
    pub fn parse(hex: &str) -> Result<Self, InvalidCommitId> {
        let is_valid =
            matches!(hex.len(), 40 | 64) && hex.bytes().all(|byte| byte.is_ascii_hexdigit());
        if is_valid {
            Ok(Self(hex.to_ascii_lowercase()))
        } else {
            Err(InvalidCommitId {
                input: hex.to_owned(),
            })
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn short(&self) -> &str {
        &self.0[..SHORT_ID_LENGTH]
    }
}

impl fmt::Display for CommitId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// A commit's place in history: just enough for graph layout.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitNode {
    pub id: CommitId,
    /// First parent first, as git records them.
    pub parents: Vec<CommitId>,
}

/// Who made a change and when.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Person {
    pub name: String,
    pub email: String,
    /// Seconds since the Unix epoch.
    pub time: i64,
}

/// What a row of the commit list shows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitSummary {
    pub id: CommitId,
    pub parents: Vec<CommitId>,
    /// The first line of the message.
    pub summary: String,
    pub author: Person,
}

/// How a file changed in a commit, compared to its first parent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed { from: String },
    TypeChanged,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileChange {
    pub path: String,
    pub kind: ChangeKind,
}

/// Everything the details panel shows for one commit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitDetails {
    pub id: CommitId,
    pub parents: Vec<CommitId>,
    pub message: String,
    pub author: Person,
    pub committer: Person,
    pub changes: Vec<FileChange>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefKind {
    LocalBranch,
    RemoteBranch,
    Tag,
}

/// A branch or tag pointing at a commit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefLabel {
    /// Short name, e.g. `main`, `origin/main`, `v1.0`.
    pub name: String,
    pub kind: RefKind,
    pub target: CommitId,
    /// Whether HEAD is on this branch.
    pub is_head: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHA1: &str = "0123456789abcdef0123456789abcdef01234567";

    #[test]
    fn parses_sha1_and_sha256_ids() {
        assert_eq!(CommitId::parse(SHA1).unwrap().as_str(), SHA1);
        assert!(CommitId::parse(&"a".repeat(64)).is_ok());
    }

    #[test]
    fn normalizes_to_lowercase() {
        let id = CommitId::parse(&SHA1.to_uppercase()).unwrap();
        assert_eq!(id.as_str(), SHA1);
    }

    #[test]
    fn rejects_partial_or_non_hex_ids() {
        for bad in ["", "abc123", &"g".repeat(40), &"a".repeat(41)] {
            assert!(CommitId::parse(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn abbreviates_to_seven_characters() {
        assert_eq!(CommitId::parse(SHA1).unwrap().short(), "0123456");
    }
}
