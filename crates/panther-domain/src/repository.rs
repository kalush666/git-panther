//! Repositories the user opens, creates and clones.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

/// Where HEAD points in a repository.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HeadState {
    /// HEAD is on a branch that has at least one commit.
    Branch(String),
    /// HEAD points directly at a commit, identified by its short id.
    Detached(String),
    /// HEAD is on a branch without commits yet, e.g. right after `git init`.
    Unborn(String),
}

/// What the UI needs to show an opened repository.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositorySummary {
    /// Root of the working tree.
    pub path: PathBuf,
    pub name: String,
    pub head: HeadState,
}

impl RepositorySummary {
    pub fn new(path: PathBuf, head: HeadState) -> Self {
        let name = repository_name(&path);
        Self { path, name, head }
    }
}

/// The display name of a repository: its folder name.
pub fn repository_name(path: &Path) -> String {
    path.file_name().map_or_else(
        || path.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    )
}

/// A remote location `git clone` accepts (URL, scp-style address or local path).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteUrl(String);

impl RemoteUrl {
    /// Validates user input as a clone source.
    ///
    /// # Errors
    /// Returns [`RepositoryError::InvalidRemoteUrl`] for empty input, input
    /// containing whitespace, or input starting with `-` (which git would read
    /// as a command-line option).
    pub fn parse(input: &str) -> Result<Self, RepositoryError> {
        let trimmed = input.trim();
        let is_valid = !trimmed.is_empty()
            && !trimmed.starts_with('-')
            && !trimmed.chars().any(char::is_whitespace);
        if is_valid {
            Ok(Self(trimmed.to_owned()))
        } else {
            Err(RepositoryError::InvalidRemoteUrl {
                input: input.to_owned(),
            })
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A request to clone `url` into the `destination` folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloneRequest {
    pub url: RemoteUrl,
    pub destination: PathBuf,
}

/// One progress update reported while cloning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloneProgress {
    /// Human-readable phase, e.g. "Receiving objects".
    pub phase: String,
    pub percent: Option<u8>,
}

/// Lets a caller ask a long-running operation to stop.
#[derive(Debug, Clone, Default)]
pub struct CancellationToken(Arc<AtomicBool>);

impl CancellationToken {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// Everything that can go wrong opening, creating or cloning a repository.
#[derive(Debug, thiserror::Error)]
pub enum RepositoryError {
    #[error("No folder exists at {}.", path.display())]
    NotFound { path: PathBuf },
    #[error("{} is not a git repository.", path.display())]
    NotARepository { path: PathBuf },
    #[error("{} is already a git repository.", path.display())]
    AlreadyARepository { path: PathBuf },
    #[error("{} is not empty. Choose an empty or new folder to clone into.", path.display())]
    DestinationNotEmpty { path: PathBuf },
    #[error("\"{input}\" is not a valid clone URL.")]
    InvalidRemoteUrl { input: String },
    #[error("Clone failed: {details}")]
    CloneFailed { details: String },
    #[error("The operation was cancelled.")]
    Cancelled,
    #[error("Git reported an error: {details}")]
    Git { details: String },
    #[error("Could not save or load recent repositories: {details}")]
    Storage { details: String },
    #[error("Commit {id} does not exist in this repository.")]
    CommitNotFound { id: String },
    #[error("There is nothing staged to commit.")]
    NothingToCommit,
    #[error("{path} changed since it was shown. Review the updated diff and try again.")]
    HunkOutdated { path: String },
    #[error("Git does not know who you are. Set user.name and user.email in your git config.")]
    IdentityMissing,
    #[error("The commit was not created: {details}")]
    CommitFailed { details: String },
    #[error(transparent)]
    InvalidBranchName(#[from] crate::branch::InvalidBranchName),
    #[error("A branch named \"{name}\" already exists.")]
    BranchExists { name: String },
    #[error("There is no branch named \"{name}\".")]
    BranchNotFound { name: String },
    #[error(
        "\"{name}\" has commits that are not merged anywhere else. Delete it anyway to lose them."
    )]
    BranchNotMerged { name: String },
    #[error("\"{name}\" is checked out. Switch to another branch before deleting it.")]
    CannotDeleteCurrentBranch { name: String },
    #[error(
        "Your uncommitted changes would be overwritten. Commit or stash them first.\n{details}"
    )]
    CheckoutConflict { details: String },
    #[error("Authentication failed. {hint} ({details})", hint = crate::remote::AUTHENTICATION_HINT)]
    AuthenticationFailed { details: String },
    #[error("The remote could not be reached: {details}")]
    NetworkFailed { details: String },
    #[error(
        "The push was rejected because the remote has commits you do not have. Pull first, then push again. If you rebased or amended commits you had already pushed, force push instead."
    )]
    PushRejected { details: String },
    #[error("\"{branch}\" has no upstream branch to pull from.")]
    NoUpstream { branch: String },
    #[error(
        "The branches have diverged, so they cannot be fast-forwarded. Pull with merge or rebase instead."
    )]
    NotFastForward,
    #[error(
        "The pull stopped with conflicts. Resolve them, then commit (or abort the merge or rebase)."
    )]
    PullConflict { details: String },
    #[error("This repository has no remote to push to.")]
    NoRemote,
    #[error("There are no local changes to stash.")]
    NothingToStash,
    #[error(
        "Stash entry {index} does not exist. The stash may have changed; refresh and try again."
    )]
    StashNotFound { index: usize },
    #[error(
        "The stash was applied with conflicts. Resolve them; the stash entry was kept so nothing is lost."
    )]
    StashConflict { details: String },
    #[error("No merge, rebase, cherry-pick or revert is in progress.")]
    NoOperationInProgress,
    #[error("Some files still have conflicts. Resolve every file before continuing.")]
    UnresolvedConflicts,
    #[error("{path} cannot be used as git: {reason}")]
    InvalidGitExecutable { path: PathBuf, reason: String },
    #[error(transparent)]
    InvalidServer(#[from] crate::account::InvalidServer),
    #[error(transparent)]
    InvalidCredentials(#[from] crate::account::InvalidCredentials),
    #[error(
        "Git is not set up to remember passwords. Install Git for Windows with Git Credential Manager, or configure credential.helper."
    )]
    CredentialHelperMissing,
    #[error(
        "The {operation} stopped with conflicts. Resolve them in the working copy panel, then continue (or abort)."
    )]
    OperationConflict {
        operation: &'static str,
        details: String,
    },
    #[error(transparent)]
    InvalidTagName(#[from] crate::history::InvalidTagName),
    #[error("A tag named \"{name}\" already exists.")]
    TagExists { name: String },
    #[error("There is no tag named \"{name}\".")]
    TagNotFound { name: String },
    #[error("There is nothing to undo.")]
    NothingToUndo,
    #[error("The repository changed since that action, so it can no longer be undone safely.")]
    UndoOutdated,
    #[error(transparent)]
    InvalidRebasePlan(#[from] crate::history::InvalidRebasePlan),
    #[error(transparent)]
    InvalidRemoteName(#[from] crate::remote::InvalidRemoteName),
    #[error("A remote named \"{name}\" already exists.")]
    RemoteExists { name: String },
    #[error("There is no remote named \"{name}\".")]
    RemoteNotFound { name: String },
    #[error("{path} cannot be used for a new worktree: {details}")]
    WorktreeFailed { path: PathBuf, details: String },
    #[error(transparent)]
    InvalidIdentity(#[from] crate::identity::InvalidIdentity),
    #[error(
        "{server} refused the access token. Create a new one with API access and connect again."
    )]
    HostingUnauthorized { server: String },
    #[error("Connect {server} to see its merge requests and issues.")]
    HostingNotConnected { server: String },
    #[error(
        "{server} does not let Git Panther use your sign-in for merge requests. Connect it with an access token instead."
    )]
    HostingLoginUnsupported { server: String },
    #[error("This repository has no remote on a code review server.")]
    NoHostedProject,
    #[error("The server answered with an error: {details}")]
    HostingFailed { details: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_repository_after_its_folder() {
        let summary = RepositorySummary::new(
            PathBuf::from("/work/git-panther"),
            HeadState::Branch("main".into()),
        );
        assert_eq!(summary.name, "git-panther");
    }

    #[test]
    fn accepts_common_clone_sources() {
        for source in [
            "https://github.com/acme/app.git",
            "git@github.com:acme/app.git",
            "C:/repos/app",
        ] {
            assert_eq!(RemoteUrl::parse(source).unwrap().as_str(), source);
        }
    }

    #[test]
    fn trims_surrounding_whitespace() {
        let url = RemoteUrl::parse("  https://example.com/a.git \n").unwrap();
        assert_eq!(url.as_str(), "https://example.com/a.git");
    }

    #[test]
    fn rejects_option_injection_and_blank_input() {
        for bad in ["", "   ", "--upload-pack=evil", "-c", "https://a b"] {
            assert!(
                matches!(
                    RemoteUrl::parse(bad),
                    Err(RepositoryError::InvalidRemoteUrl { .. })
                ),
                "{bad:?} should be rejected"
            );
        }
    }

    #[test]
    fn cancellation_is_shared_between_clones() {
        let token = CancellationToken::default();
        let observer = token.clone();
        assert!(!observer.is_cancelled());
        token.cancel();
        assert!(observer.is_cancelled());
    }
}
