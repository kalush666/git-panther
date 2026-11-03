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
