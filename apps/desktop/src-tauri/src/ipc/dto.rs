//! Serializable data shapes sent to the UI.

use panther_domain::git_installation::{GitInstallation, GitVersion};
use serde::Serialize;
use specta::Type;

/// The system git status, as shown by the UI.
#[derive(Debug, Serialize, Type)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum GitInstallationDto {
    Supported { version: String },
    Unsupported { found: String, minimum: String },
    Missing { minimum: String },
}

impl From<GitInstallation> for GitInstallationDto {
    fn from(installation: GitInstallation) -> Self {
        let minimum = GitVersion::MINIMUM_SUPPORTED.to_string();
        match installation {
            GitInstallation::Supported(version) => Self::Supported {
                version: version.to_string(),
            },
            GitInstallation::Unsupported { found } => Self::Unsupported {
                found: found.to_string(),
                minimum,
            },
            GitInstallation::Missing => Self::Missing { minimum },
        }
    }
}
