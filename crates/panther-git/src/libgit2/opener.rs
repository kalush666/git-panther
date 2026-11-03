//! Opens and initializes repositories with libgit2.

use std::path::{Path, PathBuf};

use git2::{ErrorCode, Repository};
use panther_domain::ports::RepositoryOpener;
use panther_domain::repository::{HeadState, RepositoryError, RepositorySummary};

use super::git_error;

#[derive(Debug, Clone, Copy, Default)]
pub struct Git2RepositoryOpener;

impl RepositoryOpener for Git2RepositoryOpener {
    fn open(&self, path: &Path) -> Result<RepositorySummary, RepositoryError> {
        if !path.exists() {
            return Err(RepositoryError::NotFound {
                path: path.to_path_buf(),
            });
        }
        let repository = Repository::discover(path).map_err(|error| match error.code() {
            ErrorCode::NotFound => RepositoryError::NotARepository {
                path: path.to_path_buf(),
            },
            _ => git_error(&error),
        })?;
        summarize(&repository)
    }

    fn init(&self, path: &Path) -> Result<RepositorySummary, RepositoryError> {
        if Repository::open(path).is_ok() {
            return Err(RepositoryError::AlreadyARepository {
                path: path.to_path_buf(),
            });
        }
        let repository = Repository::init(path).map_err(|error| git_error(&error))?;
        summarize(&repository)
    }
}

fn summarize(repository: &Repository) -> Result<RepositorySummary, RepositoryError> {
    let root = repository.workdir().ok_or_else(|| RepositoryError::Git {
        details: "bare repositories are not supported yet".into(),
    })?;
    Ok(RepositorySummary::new(
        normalize(root),
        head_state(repository)?,
    ))
}

/// libgit2 reports work trees with forward slashes and a trailing separator;
/// rebuilding from components gives the platform's canonical spelling, which
/// keeps the recent list free of duplicates.
fn normalize(path: &Path) -> PathBuf {
    path.components().collect()
}

fn head_state(repository: &Repository) -> Result<HeadState, RepositoryError> {
    match repository.head() {
        Ok(head)
            if repository
                .head_detached()
                .map_err(|error| git_error(&error))? =>
        {
            let commit = head.peel_to_commit().map_err(|error| git_error(&error))?;
            let short_id = commit
                .as_object()
                .short_id()
                .map_err(|error| git_error(&error))?;
            Ok(HeadState::Detached(
                short_id.as_str().unwrap_or_default().to_owned(),
            ))
        }
        Ok(head) => {
            let branch = head.shorthand().map_err(|error| git_error(&error))?;
            Ok(HeadState::Branch(branch.to_owned()))
        }
        Err(error) if error.code() == ErrorCode::UnbornBranch => {
            let head = repository
                .find_reference("HEAD")
                .map_err(|error| git_error(&error))?;
            let target = head
                .symbolic_target()
                .map_err(|error| git_error(&error))?
                .unwrap_or_default();
            Ok(HeadState::Unborn(
                target.trim_start_matches("refs/heads/").to_owned(),
            ))
        }
        Err(error) => Err(git_error(&error)),
    }
}
