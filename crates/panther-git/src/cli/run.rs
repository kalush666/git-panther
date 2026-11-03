//! Runs short, local git commands and hands back git's explanation on failure.

use std::path::Path;

use super::background_command;

/// Runs `git -C <repository> <args>` with `GIT_EDITOR` disabled, so commands
/// that would open an editor (`merge --continue`) accept git's message.
///
/// # Errors
/// git's combined stderr and stdout, trimmed, for the caller to classify.
pub fn run_git(executable: &Path, repository: &Path, args: &[&str]) -> Result<String, String> {
    let output = background_command(executable)
        .env("GIT_EDITOR", "true")
        .arg("-C")
        .arg(repository)
        .args(args)
        .output()
        .map_err(|error| format!("could not start git: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    if output.status.success() {
        return Ok(stdout.into_owned());
    }
    let message = format!("{}\n{stdout}", String::from_utf8_lossy(&output.stderr));
    Err(message.trim().to_owned())
}
