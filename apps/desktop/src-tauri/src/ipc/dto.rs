//! Serializable data shapes sent to the UI.

use std::path::Path;

use panther_application::commit_graph::{GraphEntry, GraphPage};
use panther_application::gitflow::FlowFinished;
use panther_domain::account::Account;
use panther_domain::branch::{Branch, BranchKind};
use panther_domain::commit::{
    BlameLine, ChangeKind, CommitDetails, CommitSummary, FileChange, Person, RefKind, RefLabel,
};
use panther_domain::commit::{Comparison, ReflogEntry};
use panther_domain::conflict::ConflictChunk;
use panther_domain::git_installation::{GitInstallation, GitVersion};
use panther_domain::gitflow::FlowKind;
use panther_domain::history::{RebaseAction, RebaseStep, ResetMode};
use panther_domain::hosting::{
    HostingAccess, HostingKind, Issue, Pipeline, PipelineState, PullRequest, PullRequestReview,
    ReviewComment,
};
use panther_domain::identity::{Identity, Signing, SigningFormat};
use panther_domain::layout::{LfsStatus, Submodule, SubmoduleState, Worktree};
use panther_domain::ports::HunkAction;
use panther_domain::remote::{PullStrategy, Remote};
use panther_domain::repository::{CloneProgress, HeadState, RepositorySummary, repository_name};
use panther_domain::settings::Settings;
use panther_domain::stash::{ConflictSide, Operation, Stash};
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

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BranchKindDto {
    Local,
    Remote,
}

/// A branch shown in the sidebar.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BranchDto {
    pub name: String,
    pub kind: BranchKindDto,
    pub target: String,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub is_head: bool,
}

impl From<Branch> for BranchDto {
    fn from(branch: Branch) -> Self {
        Self {
            name: branch.name,
            kind: match branch.kind {
                BranchKind::Local => BranchKindDto::Local,
                BranchKind::Remote => BranchKindDto::Remote,
            },
            target: branch.target.to_string(),
            upstream: branch.upstream,
            ahead: branch.ahead,
            behind: branch.behind,
            is_head: branch.is_head,
        }
    }
}

/// A configured remote.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDto {
    pub name: String,
    pub url: String,
}

impl From<Remote> for RemoteDto {
    fn from(remote: Remote) -> Self {
        Self {
            name: remote.name,
            url: remote.url,
        }
    }
}

/// How a pull combines fetched work with local commits.
#[derive(Debug, Clone, Copy, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PullStrategyDto {
    FastForwardOnly,
    Merge,
    Rebase,
}

impl From<PullStrategyDto> for PullStrategy {
    fn from(strategy: PullStrategyDto) -> Self {
        match strategy {
            PullStrategyDto::FastForwardOnly => Self::FastForwardOnly,
            PullStrategyDto::Merge => Self::Merge,
            PullStrategyDto::Rebase => Self::Rebase,
        }
    }
}

/// One stash entry, newest first.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StashDto {
    pub index: u32,
    pub message: String,
    pub id: String,
}

impl From<Stash> for StashDto {
    fn from(stash: Stash) -> Self {
        Self {
            // Nobody keeps four billion stashes; saturate rather than fail.
            index: u32::try_from(stash.index).unwrap_or(u32::MAX),
            message: stash.message,
            id: stash.id.to_string(),
        }
    }
}

/// An operation waiting for conflicts to be resolved.
#[derive(Debug, Clone, Copy, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum OperationDto {
    Merge,
    Rebase,
    CherryPick,
    Revert,
}

impl From<Operation> for OperationDto {
    fn from(operation: Operation) -> Self {
        match operation {
            Operation::Merge => Self::Merge,
            Operation::Rebase => Self::Rebase,
            Operation::CherryPick => Self::CherryPick,
            Operation::Revert => Self::Revert,
        }
    }
}

/// Which version of a conflicted file to keep.
#[derive(Debug, Clone, Copy, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ConflictSideDto {
    Mine,
    Incoming,
}

impl From<ConflictSideDto> for ConflictSide {
    fn from(side: ConflictSideDto) -> Self {
        match side {
            ConflictSideDto::Mine => Self::Mine,
            ConflictSideDto::Incoming => Self::Incoming,
        }
    }
}

/// Settings kept by the Rust core. UI-only preferences live in the webview.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    /// The configured git, or `None` for git from `PATH`.
    pub git_executable: Option<String>,
    /// The git this run uses; differs from the configured one until restart.
    pub active_git_executable: String,
}

impl SettingsDto {
    pub fn new(settings: &Settings, active: &std::path::Path) -> Self {
        Self {
            git_executable: settings
                .git_executable
                .as_ref()
                .map(|path| path.display().to_string()),
            active_git_executable: active.display().to_string(),
        }
    }
}

/// An HTTPS git server the user signed in to. Never carries the password.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AccountDto {
    /// e.g. `https://gitlab.example.internal`
    pub server: String,
    pub username: String,
}

impl From<Account> for AccountDto {
    fn from(account: Account) -> Self {
        Self {
            server: account.server.to_string(),
            username: account.username,
        }
    }
}

/// How far a reset goes beyond moving the branch.
#[derive(Debug, Clone, Copy, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ResetModeDto {
    Soft,
    Mixed,
    Hard,
}

impl From<ResetModeDto> for ResetMode {
    fn from(mode: ResetModeDto) -> Self {
        match mode {
            ResetModeDto::Soft => Self::Soft,
            ResetModeDto::Mixed => Self::Mixed,
            ResetModeDto::Hard => Self::Hard,
        }
    }
}

/// A commit in a list outside the graph, e.g. a file's history.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummaryDto {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub author: PersonDto,
}

impl From<CommitSummary> for CommitSummaryDto {
    fn from(commit: CommitSummary) -> Self {
        Self {
            short_id: commit.id.short().to_owned(),
            id: commit.id.to_string(),
            summary: commit.summary,
            author: commit.author.into(),
        }
    }
}

/// Who last changed one line.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BlameLineDto {
    pub line: u32,
    pub commit: String,
    pub short_id: String,
    pub author: String,
    #[specta(type = u32)]
    pub time: i64,
    pub summary: String,
    pub content: String,
}

impl From<BlameLine> for BlameLineDto {
    fn from(line: BlameLine) -> Self {
        Self {
            line: line.line,
            short_id: line.commit.short().to_owned(),
            commit: line.commit.to_string(),
            author: line.author,
            time: line.time,
            summary: line.summary,
            content: line.content,
        }
    }
}

/// What an interactive rebase does with one commit.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum RebaseActionDto {
    Pick,
    Reword { message: String },
    Squash,
    Fixup,
    Drop,
}

/// One line of an interactive rebase, oldest commit first.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RebaseStepDto {
    pub commit: String,
    pub action: RebaseActionDto,
}

impl RebaseStepDto {
    /// # Errors
    /// [`RepositoryError::CommitNotFound`] for a malformed commit id.
    pub fn into_step(self) -> Result<RebaseStep, panther_domain::repository::RepositoryError> {
        let commit = panther_domain::commit::CommitId::parse(&self.commit).map_err(|error| {
            panther_domain::repository::RepositoryError::CommitNotFound { id: error.input }
        })?;
        let action = match self.action {
            RebaseActionDto::Pick => RebaseAction::Pick,
            RebaseActionDto::Reword { message } => RebaseAction::Reword(message),
            RebaseActionDto::Squash => RebaseAction::Squash,
            RebaseActionDto::Fixup => RebaseAction::Fixup,
            RebaseActionDto::Drop => RebaseAction::Drop,
        };
        Ok(RebaseStep { commit, action })
    }
}

/// A piece of a conflicted file.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ConflictChunkDto {
    Common {
        text: String,
    },
    Conflict {
        mine: String,
        base: Option<String>,
        incoming: String,
    },
}

impl From<ConflictChunk> for ConflictChunkDto {
    fn from(chunk: ConflictChunk) -> Self {
        match chunk {
            ConflictChunk::Common(text) => Self::Common { text },
            ConflictChunk::Conflict {
                mine,
                base,
                incoming,
            } => Self::Conflict {
                mine,
                base,
                incoming,
            },
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SubmoduleStateDto {
    Current,
    NotInitialized,
    OutOfDate,
    Conflicted,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SubmoduleDto {
    pub path: String,
    pub commit: String,
    pub state: SubmoduleStateDto,
}

impl From<Submodule> for SubmoduleDto {
    fn from(submodule: Submodule) -> Self {
        Self {
            path: submodule.path,
            commit: submodule.commit.to_string(),
            state: match submodule.state {
                SubmoduleState::Current => SubmoduleStateDto::Current,
                SubmoduleState::NotInitialized => SubmoduleStateDto::NotInitialized,
                SubmoduleState::OutOfDate => SubmoduleStateDto::OutOfDate,
                SubmoduleState::Conflicted => SubmoduleStateDto::Conflicted,
            },
        }
    }
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeDto {
    pub path: String,
    pub branch: Option<String>,
    pub is_main: bool,
}

impl From<Worktree> for WorktreeDto {
    fn from(worktree: Worktree) -> Self {
        Self {
            path: worktree.path.display().to_string(),
            branch: worktree.branch,
            is_main: worktree.is_main,
        }
    }
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LfsStatusDto {
    pub used: bool,
    pub installed: bool,
}

impl From<LfsStatus> for LfsStatusDto {
    fn from(status: LfsStatus) -> Self {
        Self {
            used: status.used,
            installed: status.installed,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SigningFormatDto {
    OpenPgp,
    Ssh,
    X509,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SigningDto {
    pub format: SigningFormatDto,
    pub key: String,
}

/// Who commits, and with which signing key if any.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IdentityDto {
    pub name: String,
    pub email: String,
    pub signing: Option<SigningDto>,
}

impl From<Identity> for IdentityDto {
    fn from(identity: Identity) -> Self {
        Self {
            name: identity.name,
            email: identity.email,
            signing: identity.signing.map(|signing| SigningDto {
                format: match signing.format {
                    SigningFormat::OpenPgp => SigningFormatDto::OpenPgp,
                    SigningFormat::Ssh => SigningFormatDto::Ssh,
                    SigningFormat::X509 => SigningFormatDto::X509,
                },
                key: signing.key,
            }),
        }
    }
}

impl From<IdentityDto> for Identity {
    fn from(identity: IdentityDto) -> Self {
        Self {
            name: identity.name,
            email: identity.email,
            signing: identity.signing.map(|signing| Signing {
                format: match signing.format {
                    SigningFormatDto::OpenPgp => SigningFormat::OpenPgp,
                    SigningFormatDto::Ssh => SigningFormat::Ssh,
                    SigningFormatDto::X509 => SigningFormat::X509,
                },
                key: signing.key,
            }),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum HostingKindDto {
    GitLab,
    GitHub,
}

impl From<HostingKind> for HostingKindDto {
    fn from(kind: HostingKind) -> Self {
        match kind {
            HostingKind::GitLab => Self::GitLab,
            HostingKind::GitHub => Self::GitHub,
        }
    }
}

impl From<HostingKindDto> for HostingKind {
    fn from(kind: HostingKindDto) -> Self {
        match kind {
            HostingKindDto::GitLab => Self::GitLab,
            HostingKindDto::GitHub => Self::GitHub,
        }
    }
}

/// A connected code review server.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HostingAccessDto {
    pub server: String,
    pub kind: HostingKindDto,
}

impl From<HostingAccess> for HostingAccessDto {
    fn from(access: HostingAccess) -> Self {
        Self {
            server: access.server.to_string(),
            kind: access.kind.into(),
        }
    }
}

/// A repository's project on a code review server.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HostingStatusDto {
    pub server: String,
    pub project: String,
    /// `None` until the server is connected.
    pub kind: Option<HostingKindDto>,
}

impl From<panther_application::hosting::HostingStatus> for HostingStatusDto {
    fn from(status: panther_application::hosting::HostingStatus) -> Self {
        Self {
            server: status.project.server.to_string(),
            project: status.project.path,
            kind: status.kind.map(HostingKindDto::from),
        }
    }
}

/// A merge request (GitLab) or pull request (GitHub).
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestDto {
    #[specta(type = u32)]
    pub number: u64,
    pub title: String,
    pub author: String,
    pub source_branch: String,
    pub target_branch: String,
    pub url: String,
    pub draft: bool,
}

impl From<PullRequest> for PullRequestDto {
    fn from(request: PullRequest) -> Self {
        Self {
            number: request.number,
            title: request.title,
            author: request.author,
            source_branch: request.source_branch,
            target_branch: request.target_branch,
            url: request.url,
            draft: request.draft,
        }
    }
}

/// The newest CI pipeline of one commit.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PipelineDto {
    pub commit: String,
    pub state: PipelineStateDto,
    pub url: String,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PipelineStateDto {
    Pending,
    Running,
    Passed,
    Failed,
    Canceled,
    Skipped,
}

impl From<Pipeline> for PipelineDto {
    fn from(pipeline: Pipeline) -> Self {
        Self {
            commit: pipeline.commit,
            state: match pipeline.state {
                PipelineState::Pending => PipelineStateDto::Pending,
                PipelineState::Running => PipelineStateDto::Running,
                PipelineState::Passed => PipelineStateDto::Passed,
                PipelineState::Failed => PipelineStateDto::Failed,
                PipelineState::Canceled => PipelineStateDto::Canceled,
                PipelineState::Skipped => PipelineStateDto::Skipped,
            },
            url: pipeline.url,
        }
    }
}

/// Description, approvals and comments of a request.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestReviewDto {
    pub description: String,
    pub approved_by: Vec<String>,
    pub comments: Vec<ReviewCommentDto>,
    pub mergeable: bool,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCommentDto {
    pub author: String,
    pub body: String,
    pub created_at: String,
    pub file: Option<String>,
    pub line: Option<u32>,
}

impl From<ReviewComment> for ReviewCommentDto {
    fn from(comment: ReviewComment) -> Self {
        Self {
            author: comment.author,
            body: comment.body,
            created_at: comment.created_at,
            file: comment.file,
            line: comment.line,
        }
    }
}

impl From<PullRequestReview> for PullRequestReviewDto {
    fn from(review: PullRequestReview) -> Self {
        Self {
            description: review.description,
            approved_by: review.approved_by,
            comments: review
                .comments
                .into_iter()
                .map(ReviewCommentDto::from)
                .collect(),
            mergeable: review.mergeable,
        }
    }
}

/// A git flow branch kind, as the UI sends it.
#[derive(Debug, Clone, Copy, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum FlowKindDto {
    Feature,
    Release,
    Hotfix,
}

impl From<FlowKindDto> for FlowKind {
    fn from(kind: FlowKindDto) -> Self {
        match kind {
            FlowKindDto::Feature => Self::Feature,
            FlowKindDto::Release => Self::Release,
            FlowKindDto::Hotfix => Self::Hotfix,
        }
    }
}

/// What finishing a flow branch did.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FlowFinishedDto {
    pub merged_into: Vec<String>,
    pub tag: Option<String>,
}

impl From<FlowFinished> for FlowFinishedDto {
    fn from(finished: FlowFinished) -> Self {
        Self {
            merged_into: finished.merged_into,
            tag: finished.tag,
        }
    }
}

/// One place HEAD pointed at recently.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntryDto {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub action: String,
    /// Seconds since the Unix epoch, as a plain number like [`PersonDto::time`].
    #[specta(type = u32)]
    pub time: i64,
    pub lost: bool,
}

impl From<ReflogEntry> for ReflogEntryDto {
    fn from(entry: ReflogEntry) -> Self {
        Self {
            short_id: entry.id.short().to_owned(),
            id: entry.id.to_string(),
            summary: entry.summary,
            action: entry.action,
            time: entry.time,
            lost: entry.lost,
        }
    }
}

/// What a branch changes since it forked from another, like a merge request.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonDto {
    /// Where the head forked (the merge base); diffs run from here.
    pub fork: String,
    pub head: String,
    pub commits: Vec<CommitSummaryDto>,
    pub changes: Vec<FileChangeDto>,
}

impl From<Comparison> for ComparisonDto {
    fn from(comparison: Comparison) -> Self {
        Self {
            fork: comparison.fork.to_string(),
            head: comparison.head.to_string(),
            commits: comparison
                .commits
                .into_iter()
                .map(CommitSummaryDto::from)
                .collect(),
            changes: comparison
                .changes
                .into_iter()
                .map(FileChangeDto::from)
                .collect(),
        }
    }
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IssueDto {
    #[specta(type = u32)]
    pub number: u64,
    pub title: String,
    pub author: String,
    pub url: String,
    pub labels: Vec<String>,
}

impl From<Issue> for IssueDto {
    fn from(issue: Issue) -> Self {
        Self {
            number: issue.number,
            title: issue.title,
            author: issue.author,
            url: issue.url,
            labels: issue.labels,
        }
    }
}
