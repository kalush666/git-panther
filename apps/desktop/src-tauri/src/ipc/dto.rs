//! Serializable data shapes sent to the UI.

use std::path::Path;

use panther_application::commit_graph::{GraphEntry, GraphPage};
use panther_domain::commit::{ChangeKind, CommitDetails, FileChange, Person, RefKind, RefLabel};
use panther_domain::git_installation::{GitInstallation, GitVersion};
use panther_domain::ports::HunkAction;
use panther_domain::repository::{CloneProgress, HeadState, RepositorySummary, repository_name};
use panther_domain::working_tree::{
    ChangedFile, DiffLine, DiffSide, FileDiff, FileState, Hunk, LineKind, WorkingTreeStatus,
};
use panther_graph::{GraphRow, Segment};
use serde::{Deserialize, Serialize};
use specta::Type;

/// The system git status, as shown by the UI.
#[derive(Debug, Serialize, Type)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum GitInstallationDto {
    Supported { version: String },
    Unsupported { found: String, minimum: String },
    Missing { minimum: String },
}

impl From<GitInstallation> for GitInstallationDto {
    fn from(installation: GitInstallation) -> Self {
        let minimum = GitVersion::MINIMUM_SUPPORTED.to_string();
        match installation {
            GitInstallation::Supported(version) => Self::Supported {
                version: version.to_string(),
            },
            GitInstallation::Unsupported { found } => Self::Unsupported {
                found: found.to_string(),
                minimum,
            },
            GitInstallation::Missing => Self::Missing { minimum },
        }
    }
}

/// Where HEAD points, as shown in a repository tab.
#[derive(Debug, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HeadDto {
    Branch { name: String },
    Detached { commit: String },
    Unborn { name: String },
}

/// An opened repository.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySummaryDto {
    pub path: String,
    pub name: String,
    pub head: HeadDto,
}

impl From<RepositorySummary> for RepositorySummaryDto {
    fn from(summary: RepositorySummary) -> Self {
        let head = match summary.head {
            HeadState::Branch(name) => HeadDto::Branch { name },
            HeadState::Detached(commit) => HeadDto::Detached { commit },
            HeadState::Unborn(name) => HeadDto::Unborn { name },
        };
        Self {
            path: summary.path.display().to_string(),
            name: summary.name,
            head,
        }
    }
}

/// An entry in the recent-repositories list.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepositoryDto {
    pub path: String,
    pub name: String,
}

impl From<&Path> for RecentRepositoryDto {
    fn from(path: &Path) -> Self {
        Self {
            path: path.display().to_string(),
            name: repository_name(path),
        }
    }
}

/// One progress update while cloning.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CloneProgressDto {
    pub phase: String,
    pub percent: Option<u8>,
}

impl From<CloneProgress> for CloneProgressDto {
    fn from(progress: CloneProgress) -> Self {
        Self {
            phase: progress.phase,
            percent: progress.percent,
        }
    }
}

/// Emitted when files inside a watched repository change.
#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryChanged {
    pub path: String,
}

/// A line within half a graph row.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SegmentDto {
    pub from: u32,
    pub to: u32,
    pub color: u32,
}

/// How to draw one row of the commit graph.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphRowDto {
    pub lane: u32,
    pub color: u32,
    pub width: u32,
    pub top: Vec<SegmentDto>,
    pub bottom: Vec<SegmentDto>,
}

impl From<GraphRow> for GraphRowDto {
    fn from(row: GraphRow) -> Self {
        let segments = |segments: Vec<Segment>| {
            segments
                .into_iter()
                .map(|segment| SegmentDto {
                    from: segment.from,
                    to: segment.to,
                    color: segment.color,
                })
                .collect()
        };
        Self {
            lane: row.lane,
            color: row.color,
            width: row.width,
            top: segments(row.top),
            bottom: segments(row.bottom),
        }
    }
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RefKindDto {
    LocalBranch,
    RemoteBranch,
    Tag,
}

/// A branch or tag label shown next to a commit.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RefLabelDto {
    pub name: String,
    pub kind: RefKindDto,
    pub is_head: bool,
}

impl From<RefLabel> for RefLabelDto {
    fn from(label: RefLabel) -> Self {
        Self {
            name: label.name,
            kind: match label.kind {
                RefKind::LocalBranch => RefKindDto::LocalBranch,
                RefKind::RemoteBranch => RefKindDto::RemoteBranch,
                RefKind::Tag => RefKindDto::Tag,
            },
            is_head: label.is_head,
        }
    }
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PersonDto {
    pub name: String,
    pub email: String,
    /// Seconds since the Unix epoch. Exported as a plain number: timestamps
    /// fit a JS number exactly, so no `BigInt` is needed.
    #[specta(type = u32)]
    pub time: i64,
}

impl From<Person> for PersonDto {
    fn from(person: Person) -> Self {
        Self {
            name: person.name,
            email: person.email,
            time: person.time,
        }
    }
}

/// One row of the commit list.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphEntryDto {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    /// First meaningful line of the body, or empty.
    pub body_preview: String,
    pub author: PersonDto,
    pub refs: Vec<RefLabelDto>,
    pub graph: GraphRowDto,
}

impl From<GraphEntry> for GraphEntryDto {
    fn from(entry: GraphEntry) -> Self {
        Self {
            short_id: entry.commit.id.short().to_owned(),
            id: entry.commit.id.to_string(),
            summary: entry.commit.summary,
            body_preview: entry.commit.body_preview,
            author: entry.commit.author.into(),
            refs: entry.refs.into_iter().map(RefLabelDto::from).collect(),
            graph: entry.row.into(),
        }
    }
}

/// A window of the commit graph.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphPageDto {
    /// Commits in the whole history.
    pub total: u32,
    pub offset: u32,
    pub entries: Vec<GraphEntryDto>,
}

impl From<GraphPage> for GraphPageDto {
    fn from(page: GraphPage) -> Self {
        Self {
            total: saturating_u32(page.total),
            offset: saturating_u32(page.offset),
            entries: page.entries.into_iter().map(GraphEntryDto::from).collect(),
        }
    }
}

fn saturating_u32(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

/// How a file changed in a commit.
#[derive(Debug, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileChangeDto {
    Added { path: String },
    Modified { path: String },
    Deleted { path: String },
    Renamed { path: String, from: String },
    TypeChanged { path: String },
}

impl From<FileChange> for FileChangeDto {
    fn from(change: FileChange) -> Self {
        let path = change.path;
        match change.kind {
            ChangeKind::Added => Self::Added { path },
            ChangeKind::Modified => Self::Modified { path },
            ChangeKind::Deleted => Self::Deleted { path },
            ChangeKind::Renamed { from } => Self::Renamed { path, from },
            ChangeKind::TypeChanged => Self::TypeChanged { path },
        }
    }
}

/// Everything the details panel shows for one commit.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetailsDto {
    pub id: String,
    pub parents: Vec<String>,
    pub message: String,
    pub author: PersonDto,
    pub committer: PersonDto,
    pub changes: Vec<FileChangeDto>,
}

impl From<CommitDetails> for CommitDetailsDto {
    fn from(details: CommitDetails) -> Self {
        Self {
            id: details.id.to_string(),
            parents: details.parents.iter().map(ToString::to_string).collect(),
            message: details.message,
            author: details.author.into(),
            committer: details.committer.into(),
            changes: details
                .changes
                .into_iter()
                .map(FileChangeDto::from)
                .collect(),
        }
    }
}

/// A changed file in the working tree or index.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFileDto {
    pub path: String,
    pub kind: ChangedFileKindDto,
    /// The previous path, for renames.
    pub from: Option<String>,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ChangedFileKindDto {
    Added,
    Modified,
    Deleted,
    Renamed,
    TypeChanged,
    Untracked,
}

impl From<ChangedFile> for ChangedFileDto {
    fn from(file: ChangedFile) -> Self {
        let (kind, from) = match file.state {
            FileState::Added => (ChangedFileKindDto::Added, None),
            FileState::Modified => (ChangedFileKindDto::Modified, None),
            FileState::Deleted => (ChangedFileKindDto::Deleted, None),
            FileState::Renamed { from } => (ChangedFileKindDto::Renamed, Some(from)),
            FileState::TypeChanged => (ChangedFileKindDto::TypeChanged, None),
            FileState::Untracked => (ChangedFileKindDto::Untracked, None),
        };
        Self {
            path: file.path,
            kind,
            from,
        }
    }
}

/// Uncommitted changes of a repository.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkingTreeStatusDto {
    pub staged: Vec<ChangedFileDto>,
    pub unstaged: Vec<ChangedFileDto>,
    pub conflicted: Vec<String>,
}

impl From<WorkingTreeStatus> for WorkingTreeStatusDto {
    fn from(status: WorkingTreeStatus) -> Self {
        Self {
            staged: status
                .staged
                .into_iter()
                .map(ChangedFileDto::from)
                .collect(),
            unstaged: status
                .unstaged
                .into_iter()
                .map(ChangedFileDto::from)
                .collect(),
            conflicted: status.conflicted,
        }
    }
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LineKindDto {
    Context,
    Added,
    Removed,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiffLineDto {
    pub kind: LineKindDto,
    pub old_number: Option<u32>,
    pub new_number: Option<u32>,
    pub content: String,
}

impl From<DiffLine> for DiffLineDto {
    fn from(line: DiffLine) -> Self {
        Self {
            kind: match line.kind {
                LineKind::Context => LineKindDto::Context,
                LineKind::Added => LineKindDto::Added,
                LineKind::Removed => LineKindDto::Removed,
            },
            old_number: line.old_number,
            new_number: line.new_number,
            content: line.content,
        }
    }
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HunkDto {
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLineDto>,
}

impl From<Hunk> for HunkDto {
    fn from(hunk: Hunk) -> Self {
        Self {
            header: hunk.header,
            old_start: hunk.old_start,
            old_lines: hunk.old_lines,
            new_start: hunk.new_start,
            new_lines: hunk.new_lines,
            lines: hunk.lines.into_iter().map(DiffLineDto::from).collect(),
        }
    }
}

/// The diff of one file.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffDto {
    pub path: String,
    pub old_path: Option<String>,
    pub is_binary: bool,
    pub is_truncated: bool,
    pub hunks: Vec<HunkDto>,
}

impl From<FileDiff> for FileDiffDto {
    fn from(diff: FileDiff) -> Self {
        Self {
            path: diff.path,
            old_path: diff.old_path,
            is_binary: diff.is_binary,
            is_truncated: diff.is_truncated,
            hunks: diff.hunks.into_iter().map(HunkDto::from).collect(),
        }
    }
}

/// Which side of the index a diff compares.
#[derive(Debug, Clone, Copy, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum DiffSideDto {
    Staged,
    Unstaged,
}

impl From<DiffSideDto> for DiffSide {
    fn from(side: DiffSideDto) -> Self {
        match side {
            DiffSideDto::Staged => Self::Staged,
            DiffSideDto::Unstaged => Self::Unstaged,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum HunkActionDto {
    Stage,
    Unstage,
    Discard,
}

impl From<HunkActionDto> for HunkAction {
    fn from(action: HunkActionDto) -> Self {
        match action {
            HunkActionDto::Stage => Self::Stage,
            HunkActionDto::Unstage => Self::Unstage,
            HunkActionDto::Discard => Self::Discard,
        }
    }
}
