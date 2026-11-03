//! User preferences the Rust core needs.

use std::path::{Path, PathBuf};

/// Run when no git executable is configured, resolved through `PATH`.
pub const DEFAULT_GIT_EXECUTABLE: &str = "git";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Settings {
    /// A specific git to use instead of the one on `PATH`.
    pub git_executable: Option<PathBuf>,
}

impl Settings {
    /// The git executable to run: the configured one, else `git` from `PATH`.
    pub fn git_executable(&self) -> &Path {
        self.git_executable
            .as_deref()
            .unwrap_or_else(|| Path::new(DEFAULT_GIT_EXECUTABLE))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn falls_back_to_git_on_path() {
        assert_eq!(Settings::default().git_executable(), Path::new("git"));
        let custom = Settings {
            git_executable: Some(PathBuf::from(r"D:\tools\git\cmd\git.exe")),
        };
        assert_eq!(
            custom.git_executable(),
            Path::new(r"D:\tools\git\cmd\git.exe")
        );
    }
}
