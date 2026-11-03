//! Use case: verify that a supported system git is available.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use panther_domain::git_installation::GitInstallation;
use panther_domain::ports::{GitBinaryProbe, GitProbeError};

pub struct CheckGitInstallation {
    probe: Arc<dyn GitBinaryProbe>,
    /// The git this run of the app uses.
    executable: PathBuf,
}

impl CheckGitInstallation {
    pub fn new(probe: Arc<dyn GitBinaryProbe>, executable: PathBuf) -> Self {
        Self { probe, executable }
    }

    /// Reports whether the git in use is supported.
    ///
    /// # Errors
    /// Propagates [`GitProbeError`] when git exists but cannot be queried.
    pub fn execute(&self) -> Result<GitInstallation, GitProbeError> {
        self.check(&self.executable)
    }

    /// Reports whether `executable` would be a supported git, e.g. before
    /// the user switches to it.
    ///
    /// # Errors
    /// Propagates [`GitProbeError`] when it exists but cannot be queried.
    pub fn check(&self, executable: &Path) -> Result<GitInstallation, GitProbeError> {
        let version = self.probe.version_of(executable)?;
        Ok(GitInstallation::from_detected(version))
    }

    pub fn executable(&self) -> &Path {
        &self.executable
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use panther_domain::git_installation::GitVersion;

    struct FixedProbe(Option<GitVersion>);

    impl GitBinaryProbe for FixedProbe {
        fn version_of(&self, _: &Path) -> Result<Option<GitVersion>, GitProbeError> {
            Ok(self.0)
        }
    }

    struct FailingProbe;

    impl GitBinaryProbe for FailingProbe {
        fn version_of(&self, _: &Path) -> Result<Option<GitVersion>, GitProbeError> {
            Err(GitProbeError::ExecutionFailed {
                reason: "exit code 1".into(),
            })
        }
    }

    fn check_with(probe: impl GitBinaryProbe + 'static) -> Result<GitInstallation, GitProbeError> {
        CheckGitInstallation::new(Arc::new(probe), PathBuf::from("git")).execute()
    }

    #[test]
    fn reports_supported_git() {
        let version = GitVersion::new(2, 52, 0);
        let result = check_with(FixedProbe(Some(version))).unwrap();
        assert_eq!(result, GitInstallation::Supported(version));
    }

    #[test]
    fn reports_missing_git() {
        assert_eq!(
            check_with(FixedProbe(None)).unwrap(),
            GitInstallation::Missing
        );
    }

    #[test]
    fn propagates_probe_failures() {
        assert!(matches!(
            check_with(FailingProbe),
            Err(GitProbeError::ExecutionFailed { .. })
        ));
    }
}
