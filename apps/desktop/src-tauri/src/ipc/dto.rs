//! Serializable data shapes sent to the UI.

use std::path::Path;

use panther_domain::git_installation::{GitInstallation, GitVersion};
use panther_domain::repository::{CloneProgress, HeadState, RepositorySummary, repository_name};
use serde::{Deserialize, Serialize};
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

/// Where HEAD points, as shown in a repository tab.
#[derive(Debug, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HeadDto {
    Branch { name: String },
    Detached { commit: String },
    Unborn { name: String },
}

/// An opened repository.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySummaryDto {
    pub path: String,
    pub name: String,
    pub head: HeadDto,
}

impl From<RepositorySummary> for RepositorySummaryDto {
    fn from(summary: RepositorySummary) -> Self {
        let head = match summary.head {
            HeadState::Branch(name) => HeadDto::Branch { name },
            HeadState::Detached(commit) => HeadDto::Detached { commit },
            HeadState::Unborn(name) => HeadDto::Unborn { name },
        };
        Self {
            path: summary.path.display().to_string(),
            name: summary.name,
            head,
        }
    }
}

/// An entry in the recent-repositories list.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepositoryDto {
    pub path: String,
    pub name: String,
}

impl From<&Path> for RecentRepositoryDto {
    fn from(path: &Path) -> Self {
        Self {
            path: path.display().to_string(),
            name: repository_name(path),
        }
    }
}

/// One progress update while cloning.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CloneProgressDto {
    pub phase: String,
    pub percent: Option<u8>,
}

impl From<CloneProgress> for CloneProgressDto {
    fn from(progress: CloneProgress) -> Self {
        Self {
            phase: progress.phase,
            percent: progress.percent,
        }
    }
}

/// Emitted when files inside a watched repository change.
#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryChanged {
    pub path: String,
}
