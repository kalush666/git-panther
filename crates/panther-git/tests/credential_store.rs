//! Integration tests for [`GitCredentialStore`] with an isolated git config,
//! so the developer's real credential helper is never touched.

use std::fs;
use std::path::Path;

use panther_domain::account::{Account, Password, Server};
use panther_domain::ports::CredentialStore;
use panther_git::GitCredentialStore;
use tempfile::TempDir;

/// A store whose git sees only `config` as its configuration.
fn store_with_config(dir: &Path, config: &str) -> GitCredentialStore {
    let global = dir.join("gitconfig");
    fs::write(&global, config).unwrap();
    GitCredentialStore::new("git")
        .with_env("GIT_CONFIG_GLOBAL", &global)
        .with_env("GIT_CONFIG_NOSYSTEM", "1")
}

/// Uses git's plain-text `store` helper writing to `credentials` in `dir`.
fn file_backed_store(dir: &Path) -> GitCredentialStore {
    let file = dir.join("credentials").to_string_lossy().replace('\\', "/");
    store_with_config(
        dir,
        &format!("[credential]\n\thelper = \"store --file='{file}'\"\n"),
    )
}

fn account() -> Account {
    Account {
        server: Server::parse("https://gitlab.example.internal").unwrap(),
        username: "p9493378".into(),
    }
}

fn stored(dir: &Path) -> String {
    fs::read_to_string(dir.join("credentials")).unwrap_or_default()
}

#[test]
fn hands_credentials_to_the_helper_and_erases_them() {
    let dir = TempDir::new().unwrap();
    let store = file_backed_store(dir.path());
    assert!(store.has_helper().unwrap());

    store
        .store(&account(), &Password::new("s3cret".into()).unwrap())
        .unwrap();
    assert_eq!(
        stored(dir.path()).trim(),
        "https://p9493378:s3cret@gitlab.example.internal"
    );

    store.erase(&account()).unwrap();
    assert_eq!(stored(dir.path()).trim(), "");
}

#[test]
fn notices_when_no_helper_is_configured() {
    let dir = TempDir::new().unwrap();
    assert!(!store_with_config(dir.path(), "").has_helper().unwrap());
}

#[test]
fn verifying_a_readable_remote_succeeds() {
    let dir = TempDir::new().unwrap();
    let remote = dir.path().join("remote.git");
    let status = std::process::Command::new("git")
        .args(["init", "--quiet", "--bare"])
        .arg(&remote)
        .status()
        .unwrap();
    assert!(status.success());

    file_backed_store(dir.path())
        .verify(&remote.to_string_lossy())
        .unwrap();
}
