//! Tauri commands. Each one only translates IPC input/output around a use case.

use tauri::State;

use super::dto::GitInstallationDto;
use super::error::AppError;
use crate::composition::AppServices;

/// Reports whether a supported system git is installed.
#[tauri::command]
#[specta::specta]
pub async fn check_git_installation(
    services: State<'_, AppServices>,
) -> Result<GitInstallationDto, AppError> {
    let use_case = services.check_git_installation.clone();
    let installation = tauri::async_runtime::spawn_blocking(move || use_case.execute())
        .await
        .map_err(AppError::background_task_failed)??;
    Ok(installation.into())
}
