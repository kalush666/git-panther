//! Opens a repository in the user's own tools: the file manager, a terminal
//! or a code editor. Each starts detached; Git Panther does not wait for it.

use std::io;
use std::path::Path;
use std::process::Command;

/// Where to open a folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenTarget {
    FileManager,
    Terminal,
    /// A command such as `code` (found on `PATH`) or a full path to an editor.
    Editor(String),
}

/// Starts the tool for `folder`.
///
/// # Errors
/// The system's reason when the tool cannot be started, e.g. it is not installed.
pub fn open(folder: &Path, target: &OpenTarget) -> io::Result<()> {
    match target {
        OpenTarget::FileManager => file_manager(folder),
        OpenTarget::Terminal => terminal(folder),
        OpenTarget::Editor(editor) => editor_command(editor.trim(), folder).spawn().map(drop),
    }
}

#[cfg(windows)]
fn file_manager(folder: &Path) -> io::Result<()> {
    Command::new("explorer").arg(folder).spawn().map(drop)
}

#[cfg(target_os = "macos")]
fn file_manager(folder: &Path) -> io::Result<()> {
    Command::new("open").arg(folder).spawn().map(drop)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn file_manager(folder: &Path) -> io::Result<()> {
    Command::new("xdg-open").arg(folder).spawn().map(drop)
}

/// Windows Terminal when installed, otherwise a Command Prompt window.
#[cfg(windows)]
fn terminal(folder: &Path) -> io::Result<()> {
    Command::new("wt")
        .arg("-d")
        .arg(folder)
        .spawn()
        .or_else(|_| {
            Command::new("cmd")
                .args(["/c", "start", "", "cmd"])
                .current_dir(folder)
                .spawn()
        })
        .map(drop)
}

#[cfg(target_os = "macos")]
fn terminal(folder: &Path) -> io::Result<()> {
    Command::new("open")
        .args(["-a", "Terminal"])
        .arg(folder)
        .spawn()
        .map(drop)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn terminal(folder: &Path) -> io::Result<()> {
    Command::new("x-terminal-emulator")
        .current_dir(folder)
        .spawn()
        .map(drop)
}

/// A full path runs as it is. A bare name like `code` may be a `.cmd` shim on
/// Windows, which only the shell can start, so it goes through `cmd /c`.
fn editor_command(editor: &str, folder: &Path) -> Command {
    let mut command = if cfg!(windows) && !Path::new(editor).is_absolute() {
        let mut shell = Command::new("cmd");
        shell.args(["/c", editor]);
        shell
    } else {
        Command::new(editor)
    };
    command.arg(folder);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // The shell itself needs no window; the editor opens its own.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bare_editor_names_go_through_the_shell_on_windows() {
        let command = editor_command("code", Path::new("C:/repos/app"));
        let args: Vec<_> = command.get_args().collect();
        if cfg!(windows) {
            assert_eq!(command.get_program(), "cmd");
            assert_eq!(args, ["/c", "code", "C:/repos/app"]);
        } else {
            assert_eq!(command.get_program(), "code");
        }
        let full = editor_command("C:/tools/editor.exe", Path::new("C:/repos/app"));
        if cfg!(windows) {
            assert_eq!(full.get_program(), "C:/tools/editor.exe");
        }
    }
}
