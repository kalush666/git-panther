//! Stores the recent-repositories list as JSON in the app config folder.

use std::fs;
use std::io;
use std::path::PathBuf;

use panther_domain::ports::RecentRepositoryStore;
use panther_domain::recent::RecentRepositories;
use panther_domain::repository::RepositoryError;
use serde::{Deserialize, Serialize};

const FORMAT_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct StoredRecent {
    version: u32,
    paths: Vec<PathBuf>,
}

pub struct JsonRecentRepositoryStore {
    file: PathBuf,
}

impl JsonRecentRepositoryStore {
    pub fn new(file: PathBuf) -> Self {
        Self { file }
    }
}

fn storage_error(error: impl std::fmt::Display) -> RepositoryError {
    RepositoryError::Storage {
        details: error.to_string(),
    }
}

impl RecentRepositoryStore for JsonRecentRepositoryStore {
    fn load(&self) -> Result<RecentRepositories, RepositoryError> {
        let text = match fs::read_to_string(&self.file) {
            Ok(text) => text,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(RecentRepositories::default());
            }
            Err(error) => return Err(storage_error(error)),
        };
        let stored: StoredRecent = serde_json::from_str(&text).map_err(storage_error)?;
        Ok(RecentRepositories::from_paths(stored.paths))
    }

    fn save(&self, recent: &RecentRepositories) -> Result<(), RepositoryError> {
        let stored = StoredRecent {
            version: FORMAT_VERSION,
            paths: recent.paths().to_vec(),
        };
        let text = serde_json::to_string_pretty(&stored).map_err(storage_error)?;
        if let Some(folder) = self.file.parent() {
            fs::create_dir_all(folder).map_err(storage_error)?;
        }
        // Write then rename so a crash never leaves a half-written file.
        let temporary = self.file.with_extension("json.tmp");
        fs::write(&temporary, text).map_err(storage_error)?;
        fs::rename(&temporary, &self.file).map_err(storage_error)
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use tempfile::TempDir;

    use super::*;

    fn store_in(dir: &TempDir) -> JsonRecentRepositoryStore {
        JsonRecentRepositoryStore::new(dir.path().join("config").join("recent.json"))
    }

    #[test]
    fn missing_file_means_no_recent_repositories() {
        let dir = TempDir::new().unwrap();
        assert_eq!(
            store_in(&dir).load().unwrap(),
            RecentRepositories::default()
        );
    }

    #[test]
    fn round_trips_the_list() {
        let dir = TempDir::new().unwrap();
        let store = store_in(&dir);
        let mut recent = RecentRepositories::default();
        recent.record(Path::new("one"));
        recent.record(Path::new("two"));

        store.save(&recent).unwrap();

        assert_eq!(store.load().unwrap(), recent);
    }

    #[test]
    fn reports_corrupt_files() {
        let dir = TempDir::new().unwrap();
        let store = store_in(&dir);
        fs::create_dir_all(dir.path().join("config")).unwrap();
        fs::write(dir.path().join("config").join("recent.json"), "{ nope").unwrap();

        assert!(matches!(store.load(), Err(RepositoryError::Storage { .. })));
    }
}
