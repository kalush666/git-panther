//! Ports: capabilities the application needs from the outside world.
//!
//! Each port is a small trait implemented by an infrastructure adapter and
//! injected into use cases by the composition root.

use std::path::Path;

use crate::account::{Account, Password, Server};
use crate::branch::{Branch, BranchName};
use crate::commit::{BlameLine, CommitDetails, CommitId, CommitNode, CommitSummary, RefLabel};
use crate::conflict::ConflictChunk;
use crate::git_installation::{GitVersion, GitVersionParseError};
use crate::history::{HeadSnapshot, RebaseStep, ResetMode, TagName};
use crate::hosting::{HostedProject, Issue, NewPullRequest, PullRequest};
use crate::identity::Identity;
use crate::layout::{LfsStatus, Submodule, Worktree};
use crate::recent::RecentRepositories;
use crate::remote::{PullStrategy, PushOptions, Remote, RemoteName};
use crate::repository::{
    CancellationToken, CloneProgress, CloneRequest, RepositoryError, RepositorySummary,
};
use crate::settings::Settings;
use crate::stash::{ConflictSide, Operation, Stash};
use crate::working_tree::{CommitMessage, DiffSide, FileDiff, HunkRef, WorkingTreeStatus};

/// What to do with a single hunk.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HunkAction {
    /// Add an unstaged hunk to the index.
    Stage,
    /// Remove a staged hunk from the index.
    Unstage,
    /// Throw away an unstaged hunk from the work tree.
    Discard,
}

/// Reads and changes uncommitted work.
pub trait WorkingTree: Send + Sync {
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn status(&self, repository: &Path) -> Result<WorkingTreeStatus, RepositoryError>;

    /// The staged or unstaged diff of one file.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn diff(
        &self,
        repository: &Path,
        path: &str,
        side: DiffSide,
    ) -> Result<FileDiff, RepositoryError>;

    /// Stages whole files, including deletions and untracked files.
    ///
    /// # Errors
    /// [`RepositoryError`] when the index cannot be updated.
    fn stage(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError>;

    /// Moves staged changes of whole files back to the work tree.
    ///
    /// # Errors
    /// [`RepositoryError`] when the index cannot be updated.
    fn unstage(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError>;

    /// Throws away unstaged changes; untracked files are deleted.
    ///
    /// # Errors
    /// [`RepositoryError`] when files cannot be restored.
    fn discard(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError>;

    /// Stages, unstages or discards one hunk.
    ///
    /// # Errors
    /// [`RepositoryError::HunkOutdated`] if the hunk no longer matches.
    fn apply_hunk(
        &self,
        repository: &Path,
        hunk: &HunkRef,
        action: HunkAction,
    ) -> Result<(), RepositoryError>;
}

/// Lists and changes branches.
pub trait BranchStore: Send + Sync {
    /// Local branches first, then remote branches, each sorted by name.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn branches(&self, repository: &Path) -> Result<Vec<Branch>, RepositoryError>;

    /// Creates `name` at `start`, optionally switching to it.
    ///
    /// # Errors
    /// [`RepositoryError::BranchExists`] or a checkout error.
    fn create(
        &self,
        repository: &Path,
        name: &BranchName,
        start: &CommitId,
        checkout: bool,
    ) -> Result<(), RepositoryError>;

    /// Switches to a local branch. For a remote branch such as
    /// `origin/topic`, creates and switches to a local `topic` tracking it.
    ///
    /// # Errors
    /// [`RepositoryError::CheckoutConflict`] if uncommitted changes would be lost.
    fn checkout(&self, repository: &Path, name: &str) -> Result<(), RepositoryError>;

    /// # Errors
    /// [`RepositoryError::BranchExists`] or [`RepositoryError::BranchNotFound`].
    fn rename(
        &self,
        repository: &Path,
        from: &BranchName,
        to: &BranchName,
    ) -> Result<(), RepositoryError>;

    /// Deletes a local branch; without `force`, only if it is merged.
    ///
    /// # Errors
    /// [`RepositoryError::BranchNotMerged`] or
    /// [`RepositoryError::CannotDeleteCurrentBranch`].
    fn delete(
        &self,
        repository: &Path,
        name: &BranchName,
        force: bool,
    ) -> Result<(), RepositoryError>;
}

/// Adds, edits and removes remotes, and deletes branches on them.
pub trait RemoteConfig: Send + Sync {
    /// # Errors
    /// [`RepositoryError::RemoteExists`] or [`RepositoryError::InvalidRemoteUrl`].
    fn add(&self, repository: &Path, name: &RemoteName, url: &str) -> Result<(), RepositoryError>;

    /// # Errors
    /// [`RepositoryError::RemoteNotFound`].
    fn set_url(
        &self,
        repository: &Path,
        name: &RemoteName,
        url: &str,
    ) -> Result<(), RepositoryError>;

    /// Removes the remote and its remote-tracking branches.
    ///
    /// # Errors
    /// [`RepositoryError::RemoteNotFound`].
    fn remove(&self, repository: &Path, name: &RemoteName) -> Result<(), RepositoryError>;

    /// Deletes `branch` on `remote` (a push of nothing to it).
    ///
    /// # Errors
    /// Authentication, network or rejection errors.
    fn delete_branch(
        &self,
        repository: &Path,
        remote: &RemoteName,
        branch: &str,
    ) -> Result<(), RepositoryError>;
}

/// Submodules, linked worktrees and Git LFS.
pub trait RepositoryLayout: Send + Sync {
    /// # Errors
    /// [`RepositoryError`] when git cannot list them.
    fn submodules(&self, repository: &Path) -> Result<Vec<Submodule>, RepositoryError>;

    /// Clones missing submodules and checks every one out at its recorded
    /// commit, recursively.
    ///
    /// # Errors
    /// Authentication or network errors.
    fn update_submodules(
        &self,
        repository: &Path,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError>;

    /// The main working tree first.
    ///
    /// # Errors
    /// [`RepositoryError`] when git cannot list them.
    fn worktrees(&self, repository: &Path) -> Result<Vec<Worktree>, RepositoryError>;

    /// Checks out `branch` in a new working tree at `path`.
    ///
    /// # Errors
    /// [`RepositoryError::WorktreeFailed`].
    fn add_worktree(
        &self,
        repository: &Path,
        path: &Path,
        branch: &str,
    ) -> Result<(), RepositoryError>;

    /// # Errors
    /// [`RepositoryError::WorktreeFailed`] when it has uncommitted changes.
    fn remove_worktree(&self, repository: &Path, path: &Path) -> Result<(), RepositoryError>;

    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn lfs(&self, repository: &Path) -> Result<LfsStatus, RepositoryError>;
}

/// Who commits in a repository.
pub trait IdentityConfig: Send + Sync {
    /// The effective identity (repository, then global config), or `None`
    /// when git does not know a name and email yet.
    ///
    /// # Errors
    /// [`RepositoryError`] when git cannot be run.
    fn identity(&self, repository: &Path) -> Result<Option<Identity>, RepositoryError>;

    /// Writes `identity` into the repository's own config.
    ///
    /// # Errors
    /// [`RepositoryError`] when the config cannot be written.
    fn apply(&self, repository: &Path, identity: &Identity) -> Result<(), RepositoryError>;
}

/// Saves uncommitted work aside and brings it back.
pub trait StashStore: Send + Sync {
    /// Newest first.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn stashes(&self, repository: &Path) -> Result<Vec<Stash>, RepositoryError>;

    /// Stashes staged and unstaged changes, and untracked files if asked.
    ///
    /// # Errors
    /// [`RepositoryError::NothingToStash`] for a clean work tree.
    fn save(
        &self,
        repository: &Path,
        message: Option<&str>,
        include_untracked: bool,
    ) -> Result<(), RepositoryError>;

    /// Applies entry `index`; with `drop_after` (a pop) the entry is removed
    /// once it applied cleanly.
    ///
    /// # Errors
    /// [`RepositoryError::StashConflict`], [`RepositoryError::StashNotFound`]
    /// or [`RepositoryError::CheckoutConflict`].
    fn apply(
        &self,
        repository: &Path,
        index: usize,
        drop_after: bool,
    ) -> Result<(), RepositoryError>;

    /// # Errors
    /// [`RepositoryError::StashNotFound`].
    fn remove(&self, repository: &Path, index: usize) -> Result<(), RepositoryError>;

    /// Puts a dropped stash commit back on top of the stash, e.g. to undo a drop.
    ///
    /// # Errors
    /// [`RepositoryError`] when the commit is gone (garbage-collected).
    fn restore(&self, repository: &Path, stash: &Stash) -> Result<(), RepositoryError>;
}

/// Finishes or abandons an operation that stopped with conflicts.
pub trait ConflictResolver: Send + Sync {
    /// The interrupted operation, if any.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn operation(&self, repository: &Path) -> Result<Option<Operation>, RepositoryError>;

    /// Resolves `path` by keeping one side entirely, and stages the result.
    ///
    /// # Errors
    /// [`RepositoryError`] when git cannot check out that side.
    fn take(
        &self,
        repository: &Path,
        path: &str,
        side: ConflictSide,
    ) -> Result<(), RepositoryError>;

    /// The conflicted file `path` split into agreed text and conflicts,
    /// with "mine" and "incoming" as the user sees them.
    ///
    /// # Errors
    /// [`RepositoryError::NotFound`] if the file is missing.
    fn conflict_chunks(
        &self,
        repository: &Path,
        path: &str,
    ) -> Result<Vec<ConflictChunk>, RepositoryError>;

    /// Writes the user's resolution of `path` and stages it.
    ///
    /// # Errors
    /// [`RepositoryError`] when the file cannot be written or staged.
    fn resolve_with(
        &self,
        repository: &Path,
        path: &str,
        content: &str,
    ) -> Result<(), RepositoryError>;

    /// Stages files the user resolved by hand.
    ///
    /// # Errors
    /// [`RepositoryError`] when the files cannot be staged.
    fn mark_resolved(&self, repository: &Path, paths: &[String]) -> Result<(), RepositoryError>;

    /// Concludes the operation once every conflict is resolved.
    ///
    /// # Errors
    /// [`RepositoryError::UnresolvedConflicts`] or
    /// [`RepositoryError::NoOperationInProgress`].
    fn continue_operation(&self, repository: &Path) -> Result<(), RepositoryError>;

    /// Returns the repository to how it was before the operation.
    ///
    /// # Errors
    /// [`RepositoryError::NoOperationInProgress`].
    fn abort(&self, repository: &Path) -> Result<(), RepositoryError>;
}

/// Exchanges commits with remotes. Every operation reports progress and can
/// be cancelled.
pub trait RemoteSync: Send + Sync {
    /// # Errors
    /// [`RepositoryError`] when the configuration cannot be read.
    fn remotes(&self, repository: &Path) -> Result<Vec<Remote>, RepositoryError>;

    /// Fetches from every remote and prunes deleted remote branches.
    ///
    /// # Errors
    /// [`RepositoryError::AuthenticationFailed`], [`RepositoryError::NetworkFailed`]
    /// or [`RepositoryError::Cancelled`].
    fn fetch(
        &self,
        repository: &Path,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError>;

    /// Pulls the current branch's upstream.
    ///
    /// # Errors
    /// [`RepositoryError::NoUpstream`], [`RepositoryError::NotFastForward`],
    /// [`RepositoryError::PullConflict`] or any fetch error.
    fn pull(
        &self,
        repository: &Path,
        strategy: PullStrategy,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError>;

    /// Pushes the current branch, setting its upstream on the first push.
    ///
    /// # Errors
    /// [`RepositoryError::PushRejected`], [`RepositoryError::NoRemote`] or any
    /// network error.
    fn push(
        &self,
        repository: &Path,
        options: &PushOptions,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError>;
}

/// Creates commits.
pub trait CommitWriter: Send + Sync {
    /// Commits the index, or replaces the last commit when `amend` is set.
    ///
    /// # Errors
    /// [`RepositoryError::NothingToCommit`], [`RepositoryError::IdentityMissing`]
    /// or [`RepositoryError::CommitFailed`] (e.g. a rejecting hook).
    fn commit(
        &self,
        repository: &Path,
        message: &CommitMessage,
        amend: bool,
    ) -> Result<CommitId, RepositoryError>;

    /// The message of the HEAD commit, used to prefill an amend.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn head_message(&self, repository: &Path) -> Result<Option<String>, RepositoryError>;
}

/// Reads commit history.
pub trait CommitLog: Send + Sync {
    /// A token that changes whenever any ref or HEAD moves, so callers can
    /// cache history until it does.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn refs_fingerprint(&self, repository: &Path) -> Result<String, RepositoryError>;

    /// Every commit reachable from HEAD and the branches, remote branches
    /// and tags not named in `hidden`, children before parents and newest
    /// first.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn history(
        &self,
        repository: &Path,
        hidden: &[String],
    ) -> Result<Vec<CommitNode>, RepositoryError>;

    /// Commits whose message or author contains `query` (ignoring case).
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn search(&self, repository: &Path, query: &str) -> Result<Vec<CommitId>, RepositoryError>;

    /// Commits that changed `path` (following renames), newest first, at
    /// most `limit`.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn file_history(
        &self,
        repository: &Path,
        path: &str,
        limit: usize,
    ) -> Result<Vec<CommitId>, RepositoryError>;

    /// Who last changed each line of `path` as it is in HEAD.
    ///
    /// # Errors
    /// [`RepositoryError::NotFound`] if HEAD has no such file.
    fn blame(&self, repository: &Path, path: &str) -> Result<Vec<BlameLine>, RepositoryError>;

    /// Summaries for `ids`, in the same order.
    ///
    /// # Errors
    /// [`RepositoryError::CommitNotFound`] if an id is unknown.
    fn summaries(
        &self,
        repository: &Path,
        ids: &[CommitId],
    ) -> Result<Vec<CommitSummary>, RepositoryError>;

    /// Branches and tags, each with the commit it points at.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read.
    fn refs(&self, repository: &Path) -> Result<Vec<RefLabel>, RepositoryError>;

    /// The full message, people and changed files of one commit.
    ///
    /// # Errors
    /// [`RepositoryError::CommitNotFound`] if `id` is unknown.
    fn details(&self, repository: &Path, id: &CommitId) -> Result<CommitDetails, RepositoryError>;

    /// How `path` changed in commit `id` compared to its first parent.
    ///
    /// # Errors
    /// [`RepositoryError::CommitNotFound`] if `id` is unknown.
    fn commit_file_diff(
        &self,
        repository: &Path,
        id: &CommitId,
        path: &str,
    ) -> Result<FileDiff, RepositoryError>;
}

/// Opens existing repositories and creates new ones on the local disk.
pub trait RepositoryOpener: Send + Sync {
    /// Opens the repository containing `path` and summarizes it.
    ///
    /// # Errors
    /// [`RepositoryError::NotFound`] if `path` does not exist and
    /// [`RepositoryError::NotARepository`] if it is not inside a repository.
    fn open(&self, path: &Path) -> Result<RepositorySummary, RepositoryError>;

    /// Creates a new repository in `path` (created if missing).
    ///
    /// # Errors
    /// [`RepositoryError::AlreadyARepository`] if `path` already is one.
    fn init(&self, path: &Path) -> Result<RepositorySummary, RepositoryError>;
}

/// Copies a remote repository to the local disk.
pub trait RepositoryCloner: Send + Sync {
    /// Clones `request.url` into `request.destination`, reporting progress
    /// until done or until `cancel` is triggered.
    ///
    /// # Errors
    /// [`RepositoryError::DestinationNotEmpty`], [`RepositoryError::Cancelled`]
    /// or [`RepositoryError::CloneFailed`] with git's explanation.
    fn clone_repository(
        &self,
        request: &CloneRequest,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError>;
}

/// Persists the recent-repositories list between sessions.
pub trait RecentRepositoryStore: Send + Sync {
    /// # Errors
    /// [`RepositoryError::Storage`] when stored data cannot be read.
    fn load(&self) -> Result<RecentRepositories, RepositoryError>;

    /// # Errors
    /// [`RepositoryError::Storage`] when the list cannot be written.
    fn save(&self, recent: &RecentRepositories) -> Result<(), RepositoryError>;
}

/// Detects which git version an executable is.
pub trait GitBinaryProbe: Send + Sync {
    /// The version of `executable` (a path, or a bare name resolved through
    /// `PATH`), or `Ok(None)` when it does not exist.
    ///
    /// # Errors
    /// Returns [`GitProbeError`] when it exists but cannot be queried.
    fn version_of(&self, executable: &Path) -> Result<Option<GitVersion>, GitProbeError>;
}

/// Moves HEAD and rewrites history on the current branch.
pub trait HistoryEditor: Send + Sync {
    /// Where HEAD is now.
    ///
    /// # Errors
    /// [`RepositoryError`] when the repository cannot be read (or has no commit yet).
    fn head(&self, repository: &Path) -> Result<HeadSnapshot, RepositoryError>;

    /// Merges `branch` (local or remote) into the current branch.
    ///
    /// # Errors
    /// [`RepositoryError::OperationConflict`] or [`RepositoryError::CheckoutConflict`].
    fn merge(&self, repository: &Path, branch: &str) -> Result<(), RepositoryError>;

    /// Replays the current branch's own commits on top of `onto`.
    ///
    /// # Errors
    /// [`RepositoryError::OperationConflict`] or [`RepositoryError::CheckoutConflict`].
    fn rebase(&self, repository: &Path, onto: &str) -> Result<(), RepositoryError>;

    /// Applies the changes of `commit` as a new commit on the current branch.
    ///
    /// # Errors
    /// [`RepositoryError::OperationConflict`] or [`RepositoryError::CheckoutConflict`].
    fn cherry_pick(&self, repository: &Path, commit: &CommitId) -> Result<(), RepositoryError>;

    /// Adds a commit that undoes the changes of `commit`.
    ///
    /// # Errors
    /// [`RepositoryError::OperationConflict`] or [`RepositoryError::CheckoutConflict`].
    fn revert(&self, repository: &Path, commit: &CommitId) -> Result<(), RepositoryError>;

    /// Moves the current branch to `commit`.
    ///
    /// # Errors
    /// [`RepositoryError`] when git refuses.
    fn reset(
        &self,
        repository: &Path,
        commit: &CommitId,
        mode: ResetMode,
    ) -> Result<(), RepositoryError>;

    /// Checks out `commit` without a branch (detached HEAD).
    ///
    /// # Errors
    /// [`RepositoryError::CheckoutConflict`] if uncommitted changes would be lost.
    fn checkout_commit(&self, repository: &Path, commit: &CommitId) -> Result<(), RepositoryError>;

    /// Commits on the current branch after `base`, oldest first, leaving
    /// out merge commits (an interactive rebase flattens them).
    ///
    /// # Errors
    /// [`RepositoryError::CommitNotFound`] if `base` is unknown.
    fn commits_since(
        &self,
        repository: &Path,
        base: &CommitId,
    ) -> Result<Vec<CommitId>, RepositoryError>;

    /// Rewrites the commits after `base` as `steps` says, in that order.
    ///
    /// # Errors
    /// [`RepositoryError::OperationConflict`] or [`RepositoryError::CheckoutConflict`].
    fn rebase_interactive(
        &self,
        repository: &Path,
        base: &CommitId,
        steps: &[RebaseStep],
    ) -> Result<(), RepositoryError>;

    /// Puts HEAD back where `snapshot` says, keeping uncommitted changes.
    ///
    /// # Errors
    /// [`RepositoryError::CheckoutConflict`] if uncommitted changes would be lost.
    fn restore(&self, repository: &Path, snapshot: &HeadSnapshot) -> Result<(), RepositoryError>;
}

/// Creates, deletes and publishes tags.
pub trait TagStore: Send + Sync {
    /// An annotated tag when `message` is given, else a lightweight one.
    ///
    /// # Errors
    /// [`RepositoryError::TagExists`].
    fn create(
        &self,
        repository: &Path,
        name: &TagName,
        target: &CommitId,
        message: Option<&str>,
    ) -> Result<(), RepositoryError>;

    /// # Errors
    /// [`RepositoryError::TagNotFound`].
    fn delete(&self, repository: &Path, name: &TagName) -> Result<(), RepositoryError>;

    /// Pushes the tag to the default remote.
    ///
    /// # Errors
    /// [`RepositoryError::NoRemote`], authentication or network errors.
    fn push(&self, repository: &Path, name: &TagName) -> Result<(), RepositoryError>;
}

/// Hands credentials for HTTPS git servers to the user's credential helper.
pub trait CredentialStore: Send + Sync {
    /// Whether git is configured to remember credentials at all.
    ///
    /// # Errors
    /// [`RepositoryError`] when git cannot be run.
    fn has_helper(&self) -> Result<bool, RepositoryError>;

    /// # Errors
    /// [`RepositoryError`] when the helper refuses the credentials.
    fn store(&self, account: &Account, password: &Password) -> Result<(), RepositoryError>;

    /// Forgets the stored password of `account`.
    ///
    /// # Errors
    /// [`RepositoryError`] when the helper cannot be reached.
    fn erase(&self, account: &Account) -> Result<(), RepositoryError>;

    /// Keeps an API access token for `server`, apart from the git password.
    ///
    /// # Errors
    /// [`RepositoryError::CredentialHelperMissing`] or a helper error.
    fn store_token(&self, server: &Server, token: &Password) -> Result<(), RepositoryError>;

    /// The API access token kept for `server`, if any.
    ///
    /// # Errors
    /// [`RepositoryError`] when the helper cannot be reached.
    fn token(&self, server: &Server) -> Result<Option<Password>, RepositoryError>;

    /// # Errors
    /// [`RepositoryError`] when the helper cannot be reached.
    fn erase_token(&self, server: &Server) -> Result<(), RepositoryError>;

    /// Reads the remote at `url` with the stored credentials.
    ///
    /// # Errors
    /// [`RepositoryError::AuthenticationFailed`] for wrong credentials, or a
    /// network error.
    fn verify(&self, url: &str) -> Result<(), RepositoryError>;
}

/// The API of one kind of code review server.
pub trait HostingProvider: Send + Sync {
    /// Checks that `token` is accepted by `server`.
    ///
    /// # Errors
    /// [`RepositoryError::HostingUnauthorized`] or a network error.
    fn check(&self, server: &Server, token: &Password) -> Result<(), RepositoryError>;

    /// Open merge / pull requests of `project`.
    ///
    /// # Errors
    /// [`RepositoryError::HostingUnauthorized`], [`RepositoryError::HostingFailed`]
    /// or a network error.
    fn pull_requests(
        &self,
        project: &HostedProject,
        token: &Password,
    ) -> Result<Vec<PullRequest>, RepositoryError>;

    /// # Errors
    /// [`RepositoryError::HostingFailed`] (e.g. one already exists for the branch).
    fn create_pull_request(
        &self,
        project: &HostedProject,
        token: &Password,
        request: &NewPullRequest,
    ) -> Result<PullRequest, RepositoryError>;

    /// Open issues of `project`.
    ///
    /// # Errors
    /// Like [`HostingProvider::pull_requests`].
    fn issues(
        &self,
        project: &HostedProject,
        token: &Password,
    ) -> Result<Vec<Issue>, RepositoryError>;
}

/// Persists [`Settings`] between runs.
pub trait SettingsStore: Send + Sync {
    /// Defaults when nothing was saved yet.
    ///
    /// # Errors
    /// [`RepositoryError::Storage`] when saved settings cannot be read.
    fn load(&self) -> Result<Settings, RepositoryError>;

    /// # Errors
    /// [`RepositoryError::Storage`] when the settings cannot be written.
    fn save(&self, settings: &Settings) -> Result<(), RepositoryError>;
}

/// Git was found but its version could not be determined.
#[derive(Debug, thiserror::Error)]
pub enum GitProbeError {
    #[error("`git --version` failed: {reason}")]
    ExecutionFailed { reason: String },
    #[error(transparent)]
    UnrecognizedVersion(#[from] GitVersionParseError),
}
