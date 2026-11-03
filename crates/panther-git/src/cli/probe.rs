//! Detects the installed git version.

use std::io;
use std::path::Path;

use panther_domain::git_installation::GitVersion;
use panther_domain::ports::{GitBinaryProbe, GitProbeError};

use super::background_command;

/// Probes a git executable by running `git --version`.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemGitProbe;

impl GitBinaryProbe for SystemGitProbe {
    fn version_of(&self, executable: &Path) -> Result<Option<GitVersion>, GitProbeError> {
        let output = match background_command(executable).arg("--version").output() {
            Ok(output) => output,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(GitProbeError::ExecutionFailed {
                    reason: error.to_string(),
                });
            }
        };
        if !output.status.success() {
            return Err(GitProbeError::ExecutionFailed {
                reason: format!(
                    "{}: {}",
                    output.status,
                    String::from_utf8_lossy(&output.stderr).trim()
                ),
            });
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(Some(GitVersion::parse_cli_output(&stdout)?))
    }
}
