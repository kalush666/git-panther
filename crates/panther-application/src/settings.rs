//! Use cases: read and change the user's settings.

use std::path::PathBuf;
use std::sync::Arc;

use panther_domain::git_installation::GitInstallation;
use panther_domain::ports::{GitBinaryProbe, SettingsStore};
use panther_domain::repository::RepositoryError;
use panther_domain::settings::Settings;

pub struct AppSettings {
    store: Arc<dyn SettingsStore>,
    probe: Arc<dyn GitBinaryProbe>,
}

impl AppSettings {
    pub fn new(store: Arc<dyn SettingsStore>, probe: Arc<dyn GitBinaryProbe>) -> Self {
        Self { store, probe }
    }

    /// # Errors
    /// Propagates [`SettingsStore::load`] errors.
    pub fn load(&self) -> Result<Settings, RepositoryError> {
        self.store.load()
    }

    /// Saves a new git executable (`None` uses git from `PATH`), refusing one
    /// that is missing or too old so the next start cannot break.
    ///
    /// # Errors
    /// [`RepositoryError::InvalidGitExecutable`] or a storage error.
    pub fn set_git_executable(
        &self,
        executable: Option<PathBuf>,
    ) -> Result<Settings, RepositoryError> {
        let mut settings = self.store.load()?;
        settings.git_executable = executable;
        let path = settings.git_executable();
        let reason = match self.probe.version_of(path) {
            Ok(version) => match GitInstallation::from_detected(version) {
                GitInstallation::Supported(_) => None,
                GitInstallation::Missing => Some("no git executable was found there.".to_owned()),
                GitInstallation::Unsupported { found } => Some(format!(
                    "it is git {found}; Git Panther needs {} or newer.",
                    panther_domain::git_installation::GitVersion::MINIMUM_SUPPORTED
                )),
            },
            Err(error) => Some(error.to_string()),
        };
        if let Some(reason) = reason {
            return Err(RepositoryError::InvalidGitExecutable {
                path: path.to_path_buf(),
                reason,
            });
        }
        self.store.save(&settings)?;
        Ok(settings)
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::Mutex;

    use panther_domain::git_installation::GitVersion;
    use panther_domain::ports::GitProbeError;

    use super::*;

    #[derive(Default)]
    struct MemoryStore(Mutex<Settings>);

    impl SettingsStore for MemoryStore {
        fn load(&self) -> Result<Settings, RepositoryError> {
            Ok(self.0.lock().unwrap().clone())
        }

        fn save(&self, settings: &Settings) -> Result<(), RepositoryError> {
            *self.0.lock().unwrap() = settings.clone();
            Ok(())
        }
    }

    /// Knows one supported git at `good-git` and an old one at `old-git`.
    struct KnownGits;

    impl GitBinaryProbe for KnownGits {
        fn version_of(&self, executable: &Path) -> Result<Option<GitVersion>, GitProbeError> {
            Ok(match executable.to_str() {
                Some("good-git" | "git") => Some(GitVersion::new(2, 52, 0)),
                Some("old-git") => Some(GitVersion::new(2, 30, 0)),
                _ => None,
            })
        }
    }

    fn settings() -> (AppSettings, Arc<MemoryStore>) {
        let store = Arc::new(MemoryStore::default());
        (AppSettings::new(store.clone(), Arc::new(KnownGits)), store)
    }

    #[test]
    fn saves_a_supported_git() {
        let (settings, store) = settings();
        settings
            .set_git_executable(Some("good-git".into()))
            .unwrap();
        assert_eq!(
            store.load().unwrap().git_executable(),
            Path::new("good-git")
        );
    }

    #[test]
    fn refuses_missing_or_old_git_and_keeps_the_previous_one() {
        let (settings, store) = settings();
        settings
            .set_git_executable(Some("good-git".into()))
            .unwrap();

        for candidate in ["old-git", "nowhere"] {
            let result = settings.set_git_executable(Some(candidate.into()));
            assert!(
                matches!(result, Err(RepositoryError::InvalidGitExecutable { .. })),
                "{candidate}: {result:?}"
            );
        }
        assert_eq!(
            store.load().unwrap().git_executable(),
            Path::new("good-git")
        );
    }

    #[test]
    fn clearing_the_path_goes_back_to_git_on_path() {
        let (settings, _) = settings();
        let saved = settings.set_git_executable(None).unwrap();
        assert_eq!(saved.git_executable, None);
    }
}
