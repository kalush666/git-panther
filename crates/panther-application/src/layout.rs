//! Use cases: submodules, linked worktrees and Git LFS.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use panther_domain::layout::{LfsStatus, Submodule, Worktree};
use panther_domain::ports::RepositoryLayout;
use panther_domain::repository::{CancellationToken, CloneProgress, RepositoryError};

pub struct Layout {
    layout: Arc<dyn RepositoryLayout>,
}

impl Layout {
    pub fn new(layout: Arc<dyn RepositoryLayout>) -> Self {
        Self { layout }
    }

    /// # Errors
    /// Propagates [`RepositoryLayout::submodules`] errors.
    pub fn submodules(&self, repository: &Path) -> Result<Vec<Submodule>, RepositoryError> {
        self.layout.submodules(repository)
    }

    /// # Errors
    /// Propagates [`RepositoryLayout::update_submodules`] errors.
    pub fn update_submodules(
        &self,
        repository: &Path,
        on_progress: &mut dyn FnMut(CloneProgress),
        cancel: &CancellationToken,
    ) -> Result<(), RepositoryError> {
        self.layout
            .update_submodules(repository, on_progress, cancel)
    }

    /// # Errors
    /// Propagates [`RepositoryLayout::worktrees`] errors.
    pub fn worktrees(&self, repository: &Path) -> Result<Vec<Worktree>, RepositoryError> {
        self.layout.worktrees(repository)
    }

    /// Checks `branch` out next to the repository, in
    /// `<repository>-<branch>` (slashes become dashes), and returns where.
    ///
    /// # Errors
    /// Propagates [`RepositoryLayout::add_worktree`] errors.
    pub fn add_worktree(
        &self,
        repository: &Path,
        branch: &str,
    ) -> Result<PathBuf, RepositoryError> {
        let path = sibling_for(repository, branch);
        self.layout.add_worktree(repository, &path, branch)?;
        Ok(path)
    }

    /// # Errors
    /// Propagates [`RepositoryLayout::remove_worktree`] errors.
    pub fn remove_worktree(&self, repository: &Path, path: &Path) -> Result<(), RepositoryError> {
        self.layout.remove_worktree(repository, path)
    }

    /// # Errors
    /// Propagates [`RepositoryLayout::lfs`] errors.
    pub fn lfs(&self, repository: &Path) -> Result<LfsStatus, RepositoryError> {
        self.layout.lfs(repository)
    }
}

/// `D:\\src\\app` + `feature/login` → `D:\\src\\app-feature-login`.
fn sibling_for(repository: &Path, branch: &str) -> PathBuf {
    let name = repository
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let suffix: String = branch
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    repository.with_file_name(format!("{name}-{suffix}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worktrees_go_next_to_the_repository() {
        assert_eq!(
            sibling_for(Path::new("/src/app"), "feature/login"),
            Path::new("/src/app-feature-login")
        );
    }
}
