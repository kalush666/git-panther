//! Adapters that shell out to the system `git` executable.

use std::io;
use std::path::PathBuf;
use std::process::Command;

use panther_domain::git_installation::GitVersion;
use panther_domain::ports::{GitBinaryProbe, GitProbeError};

/// Probes a git executable by running `git --version`.
#[derive(Debug, Clone)]
pub struct SystemGitProbe {
    executable: PathBuf,
}

impl SystemGitProbe {
    /// Probes the given executable path (or bare name resolved via `PATH`).
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }
}

impl Default for SystemGitProbe {
    fn default() -> Self {
        Self::new("git")
    }
}

impl GitBinaryProbe for SystemGitProbe {
    fn installed_version(&self) -> Result<Option<GitVersion>, GitProbeError> {
        let output = match background_command(&self.executable)
            .arg("--version")
            .output()
        {
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

/// Builds a command that never flashes a console window on Windows.
fn background_command(executable: &PathBuf) -> Command {
    let mut command = Command::new(executable);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}
