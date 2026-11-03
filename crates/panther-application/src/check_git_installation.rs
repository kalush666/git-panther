//! Use case: verify that a supported system git is available.

use std::sync::Arc;

use panther_domain::git_installation::GitInstallation;
use panther_domain::ports::{GitBinaryProbe, GitProbeError};

pub struct CheckGitInstallation {
    probe: Arc<dyn GitBinaryProbe>,
}

impl CheckGitInstallation {
    pub fn new(probe: Arc<dyn GitBinaryProbe>) -> Self {
        Self { probe }
    }

    /// Reports whether the system git can be used.
    ///
    /// # Errors
    /// Propagates [`GitProbeError`] when git exists but cannot be queried.
    pub fn execute(&self) -> Result<GitInstallation, GitProbeError> {
        let version = self.probe.installed_version()?;
        Ok(GitInstallation::from_detected(version))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use panther_domain::git_installation::GitVersion;

    struct FixedProbe(Option<GitVersion>);

    impl GitBinaryProbe for FixedProbe {
        fn installed_version(&self) -> Result<Option<GitVersion>, GitProbeError> {
            Ok(self.0)
        }
    }

    struct FailingProbe;

    impl GitBinaryProbe for FailingProbe {
        fn installed_version(&self) -> Result<Option<GitVersion>, GitProbeError> {
            Err(GitProbeError::ExecutionFailed {
                reason: "exit code 1".into(),
            })
        }
    }

    fn check_with(probe: impl GitBinaryProbe + 'static) -> Result<GitInstallation, GitProbeError> {
        CheckGitInstallation::new(Arc::new(probe)).execute()
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
