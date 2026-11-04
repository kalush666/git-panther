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

/// Who last changed one line of a file, from `git blame`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlameLine {
    /// 1-based line number in the current file.
    pub line: u32,
    pub commit: CommitId,
    pub author: String,
    /// Seconds since the Unix epoch.
    pub time: i64,
    /// The first line of the commit's message.
    pub summary: String,
    pub content: String,
}

/// What a row of the commit list shows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitSummary {
    pub id: CommitId,
    pub parents: Vec<CommitId>,
    /// The first line of the message.
    pub summary: String,
    /// The first meaningful line of the body, see [`body_preview`].
    pub body_preview: String,
    pub author: Person,
}

/// The first line of a commit body worth showing next to the summary:
/// skips blank lines and git trailers such as `Co-Authored-By: …` or
/// `Signed-off-by: …`, which repeat on many commits and add no information.
pub fn body_preview(message: &str) -> String {
    message
        .lines()
        .skip(1)
        .map(str::trim)
        .find(|line| !line.is_empty() && !is_trailer(line))
        .unwrap_or_default()
        .to_owned()
}

/// `Token: value`, where the token is a single word of letters and dashes.
fn is_trailer(line: &str) -> bool {
    line.split_once(": ").is_some_and(|(token, _)| {
        !token.is_empty() && token.chars().all(|c| c.is_ascii_alphabetic() || c == '-')
    })
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

/// What `head` changes since it forked from `base`, the way a merge request
/// shows it: commits on `head` only, and files changed from the fork point.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Comparison {
    /// Where `head` forked from `base` (their merge base).
    pub fork: CommitId,
    pub head: CommitId,
    /// Newest first, at most [`Comparison::MAX_COMMITS`].
    pub commits: Vec<CommitSummary>,
    pub changes: Vec<FileChange>,
}

impl Comparison {
    /// Enough to review; a longer list is cut.
    pub const MAX_COMMITS: usize = 500;
}

/// One place HEAD pointed at, from git's reflog, newest first.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReflogEntry {
    pub id: CommitId,
    /// The commit's own summary line.
    pub summary: String,
    /// What moved HEAD there, e.g. `reset: moving to HEAD~1`.
    pub action: String,
    /// Unix seconds.
    pub time: i64,
    /// No branch or tag contains the commit any more, so it is lost unless
    /// recovered.
    pub lost: bool,
}

impl ReflogEntry {
    /// Enough to recover recent work; older entries are left out.
    pub const LIMIT: usize = 200;
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
    fn previews_the_first_body_line() {
        let message = "Fix crash\n\nThe cache was stale.\nMore detail.";
        assert_eq!(body_preview(message), "The cache was stale.");
    }

    #[test]
    fn skips_trailers_and_empty_bodies() {
        let trailers_only = "Fix\n\nCo-Authored-By: A <a@x>\nSigned-off-by: B <b@x>";
        assert_eq!(body_preview(trailers_only), "");
        assert_eq!(body_preview("Only a summary"), "");
    }

    #[test]
    fn keeps_prose_that_contains_a_colon() {
        let message = "Fix\n\nThe fix: retry twice before failing.";
        assert_eq!(
            body_preview(message),
            "The fix: retry twice before failing."
        );
    }

    #[test]
    fn abbreviates_to_seven_characters() {
        assert_eq!(CommitId::parse(SHA1).unwrap().short(), "0123456");
    }
}
