//! Stores [`Settings`] as JSON in the app config folder.

use std::fs;
use std::io;
use std::path::PathBuf;

use panther_domain::ports::SettingsStore;
use panther_domain::repository::RepositoryError;
use panther_domain::settings::Settings;
use serde::{Deserialize, Serialize};

const FORMAT_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    version: u32,
    #[serde(default)]
    git_executable: Option<PathBuf>,
}

pub struct JsonSettingsStore {
    file: PathBuf,
}

impl JsonSettingsStore {
    pub fn new(file: PathBuf) -> Self {
        Self { file }
    }
}

fn storage_error(error: impl std::fmt::Display) -> RepositoryError {
    RepositoryError::Storage {
        details: error.to_string(),
    }
}

impl SettingsStore for JsonSettingsStore {
    fn load(&self) -> Result<Settings, RepositoryError> {
        let text = match fs::read_to_string(&self.file) {
            Ok(text) => text,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(Settings::default());
            }
            Err(error) => return Err(storage_error(error)),
        };
        let stored: StoredSettings = serde_json::from_str(&text).map_err(storage_error)?;
        Ok(Settings {
            git_executable: stored.git_executable,
        })
    }

    fn save(&self, settings: &Settings) -> Result<(), RepositoryError> {
        let stored = StoredSettings {
            version: FORMAT_VERSION,
            git_executable: settings.git_executable.clone(),
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
    use tempfile::TempDir;

    use super::*;

    fn store_in(dir: &TempDir) -> JsonSettingsStore {
        JsonSettingsStore::new(dir.path().join("config").join("settings.json"))
    }

    #[test]
    fn missing_file_means_defaults() {
        let dir = TempDir::new().unwrap();
        assert_eq!(store_in(&dir).load().unwrap(), Settings::default());
    }

    #[test]
    fn round_trips_settings() {
        let dir = TempDir::new().unwrap();
        let store = store_in(&dir);
        let settings = Settings {
            git_executable: Some(PathBuf::from(r"D:\tools\git\cmd\git.exe")),
        };

        store.save(&settings).unwrap();

        assert_eq!(store.load().unwrap(), settings);
    }

    #[test]
    fn reports_corrupt_files() {
        let dir = TempDir::new().unwrap();
        let store = store_in(&dir);
        fs::create_dir_all(dir.path().join("config")).unwrap();
        fs::write(dir.path().join("config").join("settings.json"), "{ nope").unwrap();

        assert!(matches!(store.load(), Err(RepositoryError::Storage { .. })));
    }
}
