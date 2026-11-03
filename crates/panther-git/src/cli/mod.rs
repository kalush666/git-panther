//! Adapters that shell out to the system `git` executable.

mod clone;
mod probe;
mod progress;

use std::path::Path;
use std::process::Command;

pub use clone::GitCliCloner;
pub use probe::SystemGitProbe;

/// Builds a git command that never flashes a console window on Windows and
/// never blocks waiting for terminal input.
fn background_command(executable: &Path) -> Command {
    let mut command = Command::new(executable);
    command.env("GIT_TERMINAL_PROMPT", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}
