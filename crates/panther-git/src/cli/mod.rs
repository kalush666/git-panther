//! Adapters that shell out to the system `git` executable.

mod apply;
mod branches;
mod clone;
mod commit;
mod history;
mod probe;
mod progress;
mod run;
mod sync;
mod transfer;

use std::path::Path;
use std::process::Command;

pub use apply::{PatchTarget, apply_patch};
pub use branches::run_branch_command;
pub use clone::GitCliCloner;
pub use commit::commit;
pub use history::read_history;
pub use probe::SystemGitProbe;
pub use run::{run_git, run_git_with_env};
pub use sync::{classify as classify_sync_failure, pull_args, run_sync};

/// Builds a git command that never flashes a console window on Windows and
/// never blocks waiting for terminal input.
pub fn background_command(executable: &Path) -> Command {
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
