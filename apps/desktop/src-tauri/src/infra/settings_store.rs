//! Stores [`Settings`] as JSON in the app config folder.

use std::fs;
use std::io;
use std::path::PathBuf;

use panther_domain::account::{Account, Server, parse_username};
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
    #[serde(default)]
    accounts: Vec<StoredAccount>,
}

/// Server and user name only; passwords stay in the credential helper.
#[derive(Serialize, Deserialize)]
struct StoredAccount {
    server: String,
    username: String,
}

impl StoredAccount {
    /// Skips entries edited into something unreadable rather than failing.
    fn into_account(self) -> Option<Account> {
        Some(Account {
            server: Server::parse(&self.server).ok()?,
            username: parse_username(&self.username).ok()?,
        })
    }
}

impl From<&Account> for StoredAccount {
    fn from(account: &Account) -> Self {
        Self {
            server: account.server.to_string(),
            username: account.username.clone(),
        }
    }
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
            accounts: stored
                .accounts
                .into_iter()
                .filter_map(StoredAccount::into_account)
                .collect(),
        })
    }

    fn save(&self, settings: &Settings) -> Result<(), RepositoryError> {
        let stored = StoredSettings {
            version: FORMAT_VERSION,
            git_executable: settings.git_executable.clone(),
            accounts: settings.accounts.iter().map(StoredAccount::from).collect(),
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
            accounts: vec![Account {
                server: Server::parse("https://gitlab.example.internal").unwrap(),
                username: "p9493378".into(),
            }],
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
