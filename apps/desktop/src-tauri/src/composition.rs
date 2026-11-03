//! Composition root: the only place that knows concrete adapter types.

use std::sync::Arc;

use panther_application::check_git_installation::CheckGitInstallation;
use panther_git::SystemGitProbe;

/// Use cases available to IPC commands, shared as Tauri managed state.
pub struct AppServices {
    pub check_git_installation: Arc<CheckGitInstallation>,
}

impl AppServices {
    pub fn new() -> Self {
        let git_probe = Arc::new(SystemGitProbe::default());
        Self {
            check_git_installation: Arc::new(CheckGitInstallation::new(git_probe)),
        }
    }
}
