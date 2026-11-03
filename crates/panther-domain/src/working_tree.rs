//! Uncommitted changes: what is staged, what is not, and how files differ.

/// How a file differs between two states (HEAD → index, or index → work tree).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileState {
    Added,
    Modified,
    Deleted,
    Renamed {
        from: String,
    },
    TypeChanged,
    /// Not tracked by git yet (only appears among unstaged changes).
    Untracked,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChangedFile {
    /// Repository-relative path with `/` separators.
    pub path: String,
    pub state: FileState,
}

/// Uncommitted changes of a repository.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkingTreeStatus {
    /// Changes in the index that the next commit will contain.
    pub staged: Vec<ChangedFile>,
    /// Changes in the work tree that are not staged.
    pub unstaged: Vec<ChangedFile>,
    /// Files with unresolved merge conflicts.
    pub conflicted: Vec<String>,
}

impl WorkingTreeStatus {
    pub fn is_clean(&self) -> bool {
        self.staged.is_empty() && self.unstaged.is_empty() && self.conflicted.is_empty()
    }

    pub fn change_count(&self) -> usize {
        self.staged.len() + self.unstaged.len() + self.conflicted.len()
    }
}

/// Which side of the index a diff compares.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffSide {
    /// HEAD → index: what would be committed.
    Staged,
    /// Index → work tree: what is not staged yet.
    Unstaged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineKind {
    Context,
    Added,
    Removed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffLine {
    pub kind: LineKind,
    pub old_number: Option<u32>,
    pub new_number: Option<u32>,
    /// Line text without its trailing newline.
    pub content: String,
}

/// A contiguous block of changes with surrounding context.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hunk {
    /// The `@@ -a,b +c,d @@ …` line identifying the hunk.
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileDiff {
    pub path: String,
    /// The previous path, for renames.
    pub old_path: Option<String>,
    pub is_binary: bool,
    /// Set when the diff exceeded the size limit and its hunks were dropped.
    pub is_truncated: bool,
    pub hunks: Vec<Hunk>,
}

/// Identifies one hunk of a file diff the UI displayed, so an action on it
/// can be refused if the file changed meanwhile.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HunkRef {
    pub path: String,
    pub index: usize,
    /// The header the UI showed; must still match when the action runs.
    pub header: String,
}

/// Diffs larger than this many lines are not sent to the UI in full.
pub const MAX_DIFF_LINES: usize = 20_000;

/// A commit message the user typed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitMessage(String);

/// Text that cannot be used as a commit message.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("A commit needs a summary line.")]
pub struct EmptyCommitMessage;

impl CommitMessage {
    /// Normalizes line endings and trailing whitespace.
    ///
    /// # Errors
    /// [`EmptyCommitMessage`] when the summary line is blank.
    pub fn parse(text: &str) -> Result<Self, EmptyCommitMessage> {
        let normalized = text.replace("\r\n", "\n");
        let trimmed = normalized.trim();
        let has_summary = trimmed
            .lines()
            .next()
            .is_some_and(|line| !line.trim().is_empty());
        if has_summary {
            Ok(Self(format!("{trimmed}\n")))
        } else {
            Err(EmptyCommitMessage)
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_changes_across_sections() {
        let status = WorkingTreeStatus {
            staged: vec![ChangedFile {
                path: "a".into(),
                state: FileState::Added,
            }],
            unstaged: vec![],
            conflicted: vec!["b".into()],
        };
        assert_eq!(status.change_count(), 2);
        assert!(!status.is_clean());
        assert!(WorkingTreeStatus::default().is_clean());
    }

    #[test]
    fn commit_messages_need_a_summary() {
        assert_eq!(CommitMessage::parse("   \n\n"), Err(EmptyCommitMessage));
        assert_eq!(
            CommitMessage::parse("\n\nbody only"),
            Ok(CommitMessage("body only\n".into()))
        );
    }

    #[test]
    fn commit_messages_are_normalized() {
        let message = CommitMessage::parse("  Fix crash\r\n\r\nBody\r\n\r\n").unwrap();
        assert_eq!(message.as_str(), "Fix crash\n\nBody\n");
    }
}
