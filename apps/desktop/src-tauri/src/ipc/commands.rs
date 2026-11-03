//! Tauri commands. Each one only translates IPC input/output around a use case.

use std::path::PathBuf;

use panther_domain::repository::{CloneRequest, RemoteUrl};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use super::dto::{
    CloneProgressDto, GitInstallationDto, RecentRepositoryDto, RepositoryChanged,
    RepositorySummaryDto,
};
use super::error::{AppError, AppErrorKind};
use crate::composition::AppServices;
use crate::infra::jobs::JobRegistry;
use crate::infra::watcher::RepositoryWatcher;

/// Runs blocking work (git, disk) off the async runtime's worker threads.
async fn run_blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(AppError::background_task_failed)?
}

/// Reports whether a supported system git is installed.
#[tauri::command]
#[specta::specta]
pub async fn check_git_installation(
    services: State<'_, AppServices>,
) -> Result<GitInstallationDto, AppError> {
    let use_case = services.check_git_installation.clone();
    run_blocking(move || Ok(use_case.execute()?.into())).await
}

/// Opens the repository containing `path` and adds it to the recent list.
#[tauri::command]
#[specta::specta]
pub async fn open_repository(
    services: State<'_, AppServices>,
    path: String,
) -> Result<RepositorySummaryDto, AppError> {
    let use_case = services.open_repository.clone();
    run_blocking(move || Ok(use_case.open(&PathBuf::from(path))?.into())).await
}

/// Creates a new repository in `path`.
#[tauri::command]
#[specta::specta]
pub async fn init_repository(
    services: State<'_, AppServices>,
    path: String,
) -> Result<RepositorySummaryDto, AppError> {
    let use_case = services.open_repository.clone();
    run_blocking(move || Ok(use_case.init(&PathBuf::from(path))?.into())).await
}

/// Re-reads an open repository, e.g. after a `repositoryChanged` event.
#[tauri::command]
#[specta::specta]
pub async fn refresh_repository(
    services: State<'_, AppServices>,
    path: String,
) -> Result<RepositorySummaryDto, AppError> {
    let use_case = services.open_repository.clone();
    run_blocking(move || Ok(use_case.refresh(&PathBuf::from(path))?.into())).await
}

/// Clones `url` into `destination`, streaming progress to `on_progress`.
/// The UI picks `job_id` so it can cancel with [`cancel_job`].
#[tauri::command]
#[specta::specta]
pub async fn clone_repository(
    services: State<'_, AppServices>,
    jobs: State<'_, JobRegistry>,
    url: String,
    destination: String,
    job_id: String,
    on_progress: Channel<CloneProgressDto>,
) -> Result<RepositorySummaryDto, AppError> {
    let request = CloneRequest {
        url: RemoteUrl::parse(&url)?,
        destination: PathBuf::from(destination),
    };
    let cancel = jobs.start(&job_id);
    let use_case = services.clone_repository.clone();
    let result = run_blocking(move || {
        let mut report = |progress| {
            // A closed channel means the window went away; the clone itself
            // should still finish cleanly.
            let _ = on_progress.send(CloneProgressDto::from(progress));
        };
        Ok(use_case.execute(&request, &mut report, &cancel)?.into())
    })
    .await;
    jobs.finish(&job_id);
    result
}

/// Asks a running job to stop. Unknown or finished jobs are ignored.
#[tauri::command]
#[specta::specta]
pub async fn cancel_job(jobs: State<'_, JobRegistry>, job_id: String) -> Result<(), AppError> {
    jobs.cancel(&job_id);
    Ok(())
}

/// Recently opened repositories, most recent first.
#[tauri::command]
#[specta::specta]
pub async fn list_recent_repositories(
    services: State<'_, AppServices>,
) -> Result<Vec<RecentRepositoryDto>, AppError> {
    let recent = services.recent_repositories.clone();
    run_blocking(move || {
        Ok(recent
            .list()?
            .iter()
            .map(|path| RecentRepositoryDto::from(path.as_path()))
            .collect())
    })
    .await
}

/// Removes `path` from the recent list.
#[tauri::command]
#[specta::specta]
pub async fn remove_recent_repository(
    services: State<'_, AppServices>,
    path: String,
) -> Result<(), AppError> {
    let recent = services.recent_repositories.clone();
    run_blocking(move || Ok(recent.remove(&PathBuf::from(path))?)).await
}

/// Emits `repositoryChanged` whenever files in `path` change.
#[tauri::command]
#[specta::specta]
pub async fn watch_repository(
    app: AppHandle,
    watcher: State<'_, RepositoryWatcher>,
    path: String,
) -> Result<(), AppError> {
    let event = RepositoryChanged { path: path.clone() };
    watcher
        .watch(&PathBuf::from(&path), move || {
            // Emitting only fails while the app is shutting down.
            let _ = event.clone().emit(&app);
        })
        .map_err(|details| {
            AppError::new(
                AppErrorKind::WatchFailed,
                format!("Cannot watch {path} for changes: {details}"),
            )
        })
}

/// Stops watching `path`.
#[tauri::command]
#[specta::specta]
pub async fn unwatch_repository(
    watcher: State<'_, RepositoryWatcher>,
    path: String,
) -> Result<(), AppError> {
    watcher.unwatch(&PathBuf::from(path));
    Ok(())
}
