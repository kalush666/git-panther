//! Status, diffs and whole-file staging with libgit2.

use std::fs;
use std::path::Path;

use git2::build::CheckoutBuilder;
use git2::{Diff, DiffOptions, ErrorCode, Repository, Status, StatusOptions};
use panther_domain::repository::RepositoryError;
use panther_domain::working_tree::{ChangedFile, DiffSide, FileDiff, FileState, WorkingTreeStatus};

use super::diff::LineSelection;
use super::diff::{file_diff, hunk_patch};
use super::git_error;

pub fn open(path: &Path) -> Result<Repository, RepositoryError> {
    Repository::open(path).map_err(|error| match error.code() {
        ErrorCode::NotFound => RepositoryError::NotARepository {
            path: path.to_path_buf(),
        },
        _ => git_error(&error),
    })
}

/// Staged, unstaged and conflicted files, sorted by path.
pub fn status(repository: &Path) -> Result<WorkingTreeStatus, RepositoryError> {
    let repository = open(repository)?;
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);
    let statuses = repository
        .statuses(Some(&mut options))
        .map_err(|error| git_error(&error))?;

    let mut result = WorkingTreeStatus::default();
    for entry in statuses.iter() {
        let flags = entry.status();
        let path = entry.path().unwrap_or_default().replace('\\', "/");
        if flags.is_conflicted() {
            result.conflicted.push(path);
            continue;
        }
        let renamed_from = |delta: Option<git2::DiffDelta<'_>>| {
            delta
                .and_then(|delta| {
                    delta
                        .old_file()
                        .path()
                        .map(|old| old.to_string_lossy().replace('\\', "/"))
                })
                .unwrap_or_default()
        };
        if let Some(state) = staged_state(flags, || renamed_from(entry.head_to_index())) {
            result.staged.push(ChangedFile {
                path: path.clone(),
                state,
            });
        }
        if let Some(state) = unstaged_state(flags, || renamed_from(entry.index_to_workdir())) {
            result.unstaged.push(ChangedFile { path, state });
        }
    }
    for list in [&mut result.staged, &mut result.unstaged] {
        list.sort_by(|a, b| a.path.cmp(&b.path));
    }
    result.conflicted.sort();
    Ok(result)
}

fn staged_state(flags: Status, renamed_from: impl FnOnce() -> String) -> Option<FileState> {
    if flags.is_index_new() {
        Some(FileState::Added)
    } else if flags.is_index_renamed() {
        Some(FileState::Renamed {
            from: renamed_from(),
        })
    } else if flags.is_index_deleted() {
        Some(FileState::Deleted)
    } else if flags.is_index_typechange() {
        Some(FileState::TypeChanged)
    } else if flags.is_index_modified() {
        Some(FileState::Modified)
    } else {
        None
    }
}

fn unstaged_state(flags: Status, renamed_from: impl FnOnce() -> String) -> Option<FileState> {
    if flags.is_wt_new() {
        Some(FileState::Untracked)
    } else if flags.is_wt_renamed() {
        Some(FileState::Renamed {
            from: renamed_from(),
        })
    } else if flags.is_wt_deleted() {
        Some(FileState::Deleted)
    } else if flags.is_wt_typechange() {
        Some(FileState::TypeChanged)
    } else if flags.is_wt_modified() {
        Some(FileState::Modified)
    } else {
        None
    }
}

/// The libgit2 diff of one file on one side of the index.
fn single_file_diff<'repo>(
    repository: &'repo Repository,
    path: &str,
    side: DiffSide,
) -> Result<Diff<'repo>, RepositoryError> {
    let mut options = DiffOptions::new();
    options.pathspec(path).disable_pathspec_match(true);
    let diff = match side {
        DiffSide::Staged => {
            let head_tree = head_tree(repository)?;
            repository.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut options))
        }
        DiffSide::Unstaged => {
            options
                .include_untracked(true)
                .recurse_untracked_dirs(true)
                .show_untracked_content(true);
            repository.diff_index_to_workdir(None, Some(&mut options))
        }
    };
    diff.map_err(|error| git_error(&error))
}

fn head_tree(repository: &Repository) -> Result<Option<git2::Tree<'_>>, RepositoryError> {
    match repository.head() {
        Ok(head) => Ok(Some(
            head.peel_to_tree().map_err(|error| git_error(&error))?,
        )),
        Err(error) if matches!(error.code(), ErrorCode::UnbornBranch | ErrorCode::NotFound) => {
            Ok(None)
        }
        Err(error) => Err(git_error(&error)),
    }
}

pub fn diff(repository: &Path, path: &str, side: DiffSide) -> Result<FileDiff, RepositoryError> {
    let repository = open(repository)?;
    file_diff(&single_file_diff(&repository, path, side)?, path)
}

/// The patch for one hunk, or `None` if it no longer matches what the UI showed.
pub fn patch_for_hunk(
    repository: &Path,
    path: &str,
    side: DiffSide,
    index: usize,
    header: &str,
    selection: Option<LineSelection<'_>>,
) -> Result<Option<String>, RepositoryError> {
    let repository = open(repository)?;
    hunk_patch(
        &single_file_diff(&repository, path, side)?,
        index,
        header,
        selection,
    )
}

/// Whether `path` exists on both sides of `side`'s diff (HEAD and index for
/// staged changes, index and work tree for unstaged ones). Only then can a
/// single hunk be applied with a plain unified patch.
pub fn has_both_sides(
    repository: &Path,
    path: &str,
    side: DiffSide,
) -> Result<bool, RepositoryError> {
    let repo = open(repository)?;
    let in_index = repo
        .index()
        .map_err(|error| git_error(&error))?
        .get_path(Path::new(path), 0)
        .is_some();
    let other_side = match side {
        DiffSide::Unstaged => work_tree_path(&repo, path)?.exists(),
        DiffSide::Staged => {
            head_tree(&repo)?.is_some_and(|tree| tree.get_path(Path::new(path)).is_ok())
        }
    };
    Ok(in_index && other_side)
}

pub fn stage(repository: &Path, paths: &[String]) -> Result<(), RepositoryError> {
    let repo = open(repository)?;
    let mut index = repo.index().map_err(|error| git_error(&error))?;
    for path in paths {
        let result = if work_tree_path(&repo, path)?.symlink_metadata().is_ok() {
            index.add_path(Path::new(path))
        } else {
            index.remove_path(Path::new(path))
        };
        result.map_err(|error| git_error(&error))?;
    }
    index.write().map_err(|error| git_error(&error))
}

pub fn unstage(repository: &Path, paths: &[String]) -> Result<(), RepositoryError> {
    let repo = open(repository)?;
    if let Ok(head) = repo.head().and_then(|head| head.peel_to_commit()) {
        return repo
            .reset_default(Some(head.as_object()), paths)
            .map_err(|error| git_error(&error));
    }
    // Before the first commit, unstaging means removing from the index.
    let mut index = repo.index().map_err(|error| git_error(&error))?;
    for path in paths {
        index
            .remove_path(Path::new(path))
            .map_err(|error| git_error(&error))?;
    }
    index.write().map_err(|error| git_error(&error))
}

/// Restores tracked files from the index and deletes untracked ones.
pub fn discard(repository: &Path, paths: &[String]) -> Result<(), RepositoryError> {
    let repo = open(repository)?;
    let mut tracked = Vec::new();
    for path in paths {
        let flags = repo
            .status_file(Path::new(path))
            .map_err(|error| git_error(&error))?;
        if flags.is_wt_new() {
            fs::remove_file(work_tree_path(&repo, path)?).map_err(|error| {
                RepositoryError::Git {
                    details: format!("could not delete {path}: {error}"),
                }
            })?;
        } else {
            tracked.push(path);
        }
    }
    if tracked.is_empty() {
        return Ok(());
    }
    let mut checkout = CheckoutBuilder::new();
    checkout.force().disable_pathspec_match(true);
    for path in tracked {
        checkout.path(path);
    }
    repo.checkout_index(None, Some(&mut checkout))
        .map_err(|error| git_error(&error))
}

fn work_tree_path(repo: &Repository, path: &str) -> Result<std::path::PathBuf, RepositoryError> {
    let root = repo.workdir().ok_or_else(|| RepositoryError::Git {
        details: "bare repositories have no working tree".into(),
    })?;
    Ok(root.join(path))
}
