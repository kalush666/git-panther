//! The list of recently opened repositories shown on the welcome screen.

use std::path::{Path, PathBuf};

/// How many recent repositories are remembered.
pub const MAX_RECENT_REPOSITORIES: usize = 10;

/// Recently opened repository paths, most recent first, without duplicates.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RecentRepositories(Vec<PathBuf>);

impl RecentRepositories {
    /// Builds the list from stored paths, dropping duplicates and overflow.
    pub fn from_paths(paths: impl IntoIterator<Item = PathBuf>) -> Self {
        let mut recent = Self::default();
        for path in paths {
            if !recent.0.contains(&path) && recent.0.len() < MAX_RECENT_REPOSITORIES {
                recent.0.push(path);
            }
        }
        recent
    }

    /// Moves `path` to the front, adding it if new.
    pub fn record(&mut self, path: &Path) {
        self.remove(path);
        self.0.insert(0, path.to_path_buf());
        self.0.truncate(MAX_RECENT_REPOSITORIES);
    }

    pub fn remove(&mut self, path: &Path) {
        self.0.retain(|existing| existing != path);
    }

    pub fn paths(&self) -> &[PathBuf] {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(recent: &RecentRepositories) -> Vec<&str> {
        recent
            .paths()
            .iter()
            .map(|path| path.to_str().unwrap())
            .collect()
    }

    #[test]
    fn records_most_recent_first_without_duplicates() {
        let mut recent = RecentRepositories::default();
        recent.record(Path::new("a"));
        recent.record(Path::new("b"));
        recent.record(Path::new("a"));
        assert_eq!(paths(&recent), ["a", "b"]);
    }

    #[test]
    fn keeps_only_the_newest_entries() {
        let mut recent = RecentRepositories::default();
        for index in 0..=MAX_RECENT_REPOSITORIES {
            recent.record(&PathBuf::from(index.to_string()));
        }
        assert_eq!(recent.paths().len(), MAX_RECENT_REPOSITORIES);
        assert_eq!(recent.paths()[0], PathBuf::from(MAX_RECENT_REPOSITORIES.to_string()));
        assert!(!recent.paths().contains(&PathBuf::from("0")));
    }

    #[test]
    fn sanitizes_stored_paths() {
        let stored = ["a", "a", "b"].map(PathBuf::from);
        assert_eq!(paths(&RecentRepositories::from_paths(stored)), ["a", "b"]);
    }

    #[test]
    fn removes_entries() {
        let mut recent = RecentRepositories::from_paths(["a", "b"].map(PathBuf::from));
        recent.remove(Path::new("a"));
        assert_eq!(paths(&recent), ["b"]);
    }
}
