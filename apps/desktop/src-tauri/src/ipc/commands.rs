//! Tauri commands. Each one only translates IPC input/output around a use case.

use std::path::PathBuf;

use panther_domain::commit::CommitId;
use panther_domain::repository::{
    CancellationToken, CloneProgress, CloneRequest, RemoteUrl, RepositoryError,
};
use panther_domain::settings::DEFAULT_GIT_EXECUTABLE;
use panther_domain::working_tree::HunkRef;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use super::dto::{
    AccountDto, BlameLineDto, BranchDto, CloneProgressDto, CommitDetailsDto, CommitSummaryDto,
    ConflictChunkDto, ConflictSideDto, DiffSideDto, FileDiffDto, GitInstallationDto, GraphPageDto,
    HunkActionDto, LfsStatusDto, OperationDto, PullStrategyDto, RebaseStepDto, RecentRepositoryDto,
    RemoteDto, RepositoryChanged, RepositorySummaryDto, ResetModeDto, SettingsDto, StashDto,
    SubmoduleDto, WorkingTreeStatusDto, WorktreeDto,
};
use super::dto::{
    HostingAccessDto, HostingKindDto, HostingStatusDto, IdentityDto, IssueDto, PullRequestDto,
};
use super::error::{AppError, AppErrorKind};
use crate::composition::AppServices;
use crate::infra::jobs::JobRegistry;
use crate::infra::watcher::RepositoryWatcher;
use panther_application::accounts::SignIn;
use panther_domain::hosting::NewPullRequest;

use super::dto::{ComparisonDto, PipelineDto, PullRequestReviewDto};
use panther_domain::remote::{PushOptions, RemoteName};

/// Runs blocking work (git, disk) off the async runtime's worker threads.
async fn run_blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(AppError::background_task_failed)?
}

/// Runs a cancellable, progress-reporting job (clone, fetch, pull, push) on
/// the blocking pool. The UI picks `job_id` so it can cancel with
/// [`cancel_job`].
async fn run_job<T: Send + 'static>(
    jobs: &JobRegistry,
    job_id: &str,
    on_progress: Channel<CloneProgressDto>,
    work: impl FnOnce(&mut dyn FnMut(CloneProgress), &CancellationToken) -> Result<T, AppError>
    + Send
    + 'static,
) -> Result<T, AppError> {
    let cancel = jobs.start(job_id);
    let result = run_blocking(move || {
        let mut report = |progress| {
            // A closed channel means the window went away; the job itself
            // should still finish cleanly.
            let _ = on_progress.send(CloneProgressDto::from(progress));
        };
        work(&mut report, &cancel)
    })
    .await;
    jobs.finish(job_id);
    result
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

/// Reports whether `executable` (or git from `PATH` when `None`) is a
/// supported git, without switching to it.
#[tauri::command]
#[specta::specta]
pub async fn check_git_executable(
    services: State<'_, AppServices>,
    executable: Option<String>,
) -> Result<GitInstallationDto, AppError> {
    let use_case = services.check_git_installation.clone();
    let executable =
        executable.map_or_else(|| PathBuf::from(DEFAULT_GIT_EXECUTABLE), PathBuf::from);
    run_blocking(move || Ok(use_case.check(&executable)?.into())).await
}

/// The saved settings and the git this run uses.
#[tauri::command]
#[specta::specta]
pub async fn get_settings(services: State<'_, AppServices>) -> Result<SettingsDto, AppError> {
    let settings = services.settings.clone();
    let check = services.check_git_installation.clone();
    run_blocking(move || Ok(SettingsDto::new(&settings.load()?, check.executable()))).await
}

/// Saves the git to use from the next start; `None` means git from `PATH`.
#[tauri::command]
#[specta::specta]
pub async fn set_git_executable(
    services: State<'_, AppServices>,
    executable: Option<String>,
) -> Result<SettingsDto, AppError> {
    let settings = services.settings.clone();
    let check = services.check_git_installation.clone();
    let executable = executable
        .map(|path| path.trim().to_owned())
        .filter(|path| !path.is_empty())
        .map(PathBuf::from);
    run_blocking(move || {
        let saved = settings.set_git_executable(executable)?;
        Ok(SettingsDto::new(&saved, check.executable()))
    })
    .await
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
    let use_case = services.clone_repository.clone();
    run_job(&jobs, &job_id, on_progress, move |report, cancel| {
        Ok(use_case.execute(&request, report, cancel)?.into())
    })
    .await
}

/// Asks a running job to stop. Unknown or finished jobs are ignored.
#[tauri::command]
#[specta::specta]
pub async fn cancel_job(jobs: State<'_, JobRegistry>, job_id: String) -> Result<(), AppError> {
    jobs.cancel(&job_id);
    Ok(())
}

/// Restarts the app, e.g. to use a newly configured git.
#[tauri::command]
#[specta::specta]
#[allow(
    clippy::needless_pass_by_value,
    reason = "Tauri injects command arguments by value"
)]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// Scales the whole interface, like a browser zoom.
#[tauri::command]
#[specta::specta]
#[allow(
    clippy::needless_pass_by_value,
    reason = "Tauri injects command arguments by value"
)]
pub fn set_zoom(webview: tauri::Webview, scale: f64) -> Result<(), AppError> {
    webview.set_zoom(scale).map_err(|error| {
        AppError::new(
            AppErrorKind::Internal,
            format!("The interface size could not be changed: {error}"),
        )
    })
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

/// Stops watching `path` and releases its cached history.
#[tauri::command]
#[specta::specta]
pub async fn unwatch_repository(
    services: State<'_, AppServices>,
    watcher: State<'_, RepositoryWatcher>,
    path: String,
) -> Result<(), AppError> {
    let path = PathBuf::from(path);
    watcher.unwatch(&path);
    services.commit_graph.forget(&path);
    Ok(())
}

/// Up to `limit` rows of the commit graph starting at row `offset`.
#[tauri::command]
#[specta::specta]
pub async fn load_graph_page(
    services: State<'_, AppServices>,
    path: String,
    offset: u32,
    limit: u32,
    hidden: Vec<String>,
) -> Result<GraphPageDto, AppError> {
    let graph = services.commit_graph.clone();
    run_blocking(move || {
        let page = graph.page(&PathBuf::from(path), widen(offset), widen(limit), &hidden)?;
        Ok(page.into())
    })
    .await
}

/// Graph rows whose commit matches `query` (message, author or id prefix).
#[tauri::command]
#[specta::specta]
pub async fn search_commits(
    services: State<'_, AppServices>,
    path: String,
    query: String,
    hidden: Vec<String>,
) -> Result<Vec<u32>, AppError> {
    let graph = services.commit_graph.clone();
    run_blocking(move || {
        Ok(graph
            .search(&PathBuf::from(path), &query, &hidden)?
            .into_iter()
            .map(|row| u32::try_from(row).unwrap_or(u32::MAX))
            .collect())
    })
    .await
}

/// Commits that changed `file`, newest first.
#[tauri::command]
#[specta::specta]
pub async fn file_history(
    services: State<'_, AppServices>,
    path: String,
    file: String,
) -> Result<Vec<CommitSummaryDto>, AppError> {
    let graph = services.commit_graph.clone();
    run_blocking(move || {
        Ok(graph
            .file_history(&PathBuf::from(path), &file)?
            .into_iter()
            .map(CommitSummaryDto::from)
            .collect())
    })
    .await
}

/// Who last changed each line of `file`.
#[tauri::command]
#[specta::specta]
pub async fn blame_file(
    services: State<'_, AppServices>,
    path: String,
    file: String,
) -> Result<Vec<BlameLineDto>, AppError> {
    let graph = services.commit_graph.clone();
    run_blocking(move || {
        Ok(graph
            .blame(&PathBuf::from(path), &file)?
            .into_iter()
            .map(BlameLineDto::from)
            .collect())
    })
    .await
}

/// Full message, people and changed files of commit `id`.
#[tauri::command]
#[specta::specta]
pub async fn commit_details(
    services: State<'_, AppServices>,
    path: String,
    id: String,
) -> Result<CommitDetailsDto, AppError> {
    let graph = services.commit_graph.clone();
    run_blocking(move || {
        let id = commit_id(&id)?;
        Ok(graph.details(&PathBuf::from(path), &id)?.into())
    })
    .await
}

/// Parses a commit id received over IPC.
fn commit_id(id: &str) -> Result<CommitId, RepositoryError> {
    CommitId::parse(id).map_err(|error| RepositoryError::CommitNotFound { id: error.input })
}

/// Staged, unstaged and conflicted files.
#[tauri::command]
#[specta::specta]
pub async fn working_tree_status(
    services: State<'_, AppServices>,
    path: String,
) -> Result<WorkingTreeStatusDto, AppError> {
    let copy = services.working_copy.clone();
    run_blocking(move || Ok(copy.status(&PathBuf::from(path))?.into())).await
}

/// The staged or unstaged diff of `file`.
#[tauri::command]
#[specta::specta]
pub async fn file_diff(
    services: State<'_, AppServices>,
    path: String,
    file: String,
    side: DiffSideDto,
) -> Result<FileDiffDto, AppError> {
    let copy = services.working_copy.clone();
    run_blocking(move || Ok(copy.diff(&PathBuf::from(path), &file, side.into())?.into())).await
}

/// How `file` changed in commit `id`.
#[tauri::command]
#[specta::specta]
pub async fn commit_file_diff(
    services: State<'_, AppServices>,
    path: String,
    id: String,
    file: String,
) -> Result<FileDiffDto, AppError> {
    let graph = services.commit_graph.clone();
    run_blocking(move || {
        let id = commit_id(&id)?;
        Ok(graph
            .commit_file_diff(&PathBuf::from(path), &id, &file)?
            .into())
    })
    .await
}

/// Stages whole files.
#[tauri::command]
#[specta::specta]
pub async fn stage_files(
    services: State<'_, AppServices>,
    path: String,
    files: Vec<String>,
) -> Result<(), AppError> {
    let copy = services.working_copy.clone();
    run_blocking(move || Ok(copy.stage(&PathBuf::from(path), &files)?)).await
}

/// Unstages whole files.
#[tauri::command]
#[specta::specta]
pub async fn unstage_files(
    services: State<'_, AppServices>,
    path: String,
    files: Vec<String>,
) -> Result<(), AppError> {
    let copy = services.working_copy.clone();
    run_blocking(move || Ok(copy.unstage(&PathBuf::from(path), &files)?)).await
}

/// Throws away unstaged changes of `files`; untracked files are deleted.
#[tauri::command]
#[specta::specta]
pub async fn discard_files(
    services: State<'_, AppServices>,
    path: String,
    files: Vec<String>,
) -> Result<(), AppError> {
    let copy = services.working_copy.clone();
    run_blocking(move || Ok(copy.discard(&PathBuf::from(path), &files)?)).await
}

/// Stages, unstages or discards hunk `index` of `file`, as long as its
/// header still matches what the UI showed.
#[tauri::command]
#[specta::specta]
pub async fn apply_hunk(
    services: State<'_, AppServices>,
    path: String,
    file: String,
    index: u32,
    header: String,
    lines: Option<Vec<u32>>,
    action: HunkActionDto,
) -> Result<(), AppError> {
    let copy = services.working_copy.clone();
    run_blocking(move || {
        let hunk = HunkRef {
            path: file,
            index: widen(index),
            header,
            lines: lines.map(|lines| lines.into_iter().map(widen).collect()),
        };
        Ok(copy.apply_hunk(&PathBuf::from(path), &hunk, action.into())?)
    })
    .await
}

/// Commits staged changes (or amends HEAD) and returns the new commit id.
#[tauri::command]
#[specta::specta]
pub async fn commit_changes(
    services: State<'_, AppServices>,
    path: String,
    message: String,
    amend: bool,
) -> Result<String, AppError> {
    let copy = services.working_copy.clone();
    run_blocking(move || {
        Ok(copy
            .commit(&PathBuf::from(path), &message, amend)?
            .to_string())
    })
    .await
}

/// The message of the HEAD commit, to prefill an amend.
#[tauri::command]
#[specta::specta]
pub async fn head_message(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Option<String>, AppError> {
    let copy = services.working_copy.clone();
    run_blocking(move || Ok(copy.head_message(&PathBuf::from(path))?)).await
}

/// Local and remote branches.
#[tauri::command]
#[specta::specta]
pub async fn list_branches(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Vec<BranchDto>, AppError> {
    let branches = services.branches.clone();
    run_blocking(move || {
        Ok(branches
            .list(&PathBuf::from(path))?
            .into_iter()
            .map(BranchDto::from)
            .collect())
    })
    .await
}

/// Creates branch `name` at commit `start`, optionally switching to it.
#[tauri::command]
#[specta::specta]
pub async fn create_branch(
    services: State<'_, AppServices>,
    path: String,
    name: String,
    start: String,
    checkout: bool,
) -> Result<(), AppError> {
    let branches = services.branches.clone();
    run_blocking(move || Ok(branches.create(&PathBuf::from(path), &name, &start, checkout)?)).await
}

/// Switches to a local branch, or to a tracking branch for a remote one.
#[tauri::command]
#[specta::specta]
pub async fn checkout_branch(
    services: State<'_, AppServices>,
    path: String,
    name: String,
) -> Result<(), AppError> {
    let branches = services.branches.clone();
    run_blocking(move || Ok(branches.checkout(&PathBuf::from(path), &name)?)).await
}

#[tauri::command]
#[specta::specta]
pub async fn rename_branch(
    services: State<'_, AppServices>,
    path: String,
    from: String,
    to: String,
) -> Result<(), AppError> {
    let branches = services.branches.clone();
    run_blocking(move || Ok(branches.rename(&PathBuf::from(path), &from, &to)?)).await
}

/// Deletes a local branch; `force` deletes it even if unmerged.
#[tauri::command]
#[specta::specta]
pub async fn delete_branch(
    services: State<'_, AppServices>,
    path: String,
    name: String,
    force: bool,
) -> Result<(), AppError> {
    let branches = services.branches.clone();
    run_blocking(move || Ok(branches.delete(&PathBuf::from(path), &name, force)?)).await
}

/// Configured remotes.
#[tauri::command]
#[specta::specta]
pub async fn list_remotes(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Vec<RemoteDto>, AppError> {
    let sync = services.sync.clone();
    run_blocking(move || {
        Ok(sync
            .remotes(&PathBuf::from(path))?
            .into_iter()
            .map(RemoteDto::from)
            .collect())
    })
    .await
}

/// Fetches every remote.
#[tauri::command]
#[specta::specta]
pub async fn fetch_remotes(
    services: State<'_, AppServices>,
    jobs: State<'_, JobRegistry>,
    path: String,
    job_id: String,
    on_progress: Channel<CloneProgressDto>,
) -> Result<(), AppError> {
    let sync = services.sync.clone();
    run_job(&jobs, &job_id, on_progress, move |report, cancel| {
        Ok(sync.fetch(&PathBuf::from(path), report, cancel)?)
    })
    .await
}

/// Pulls the current branch's upstream with `strategy`.
#[tauri::command]
#[specta::specta]
pub async fn pull_branch(
    services: State<'_, AppServices>,
    jobs: State<'_, JobRegistry>,
    path: String,
    strategy: PullStrategyDto,
    job_id: String,
    on_progress: Channel<CloneProgressDto>,
) -> Result<(), AppError> {
    let sync = services.sync.clone();
    run_job(&jobs, &job_id, on_progress, move |report, cancel| {
        Ok(sync.pull(&PathBuf::from(path), strategy.into(), report, cancel)?)
    })
    .await
}

/// Pushes the current branch, setting its upstream on the first push.
#[tauri::command]
#[specta::specta]
#[allow(
    clippy::too_many_arguments,
    reason = "Tauri passes every command argument separately"
)]
pub async fn push_branch(
    services: State<'_, AppServices>,
    jobs: State<'_, JobRegistry>,
    path: String,
    remote: Option<String>,
    force_with_lease: bool,
    job_id: String,
    on_progress: Channel<CloneProgressDto>,
) -> Result<(), AppError> {
    let sync = services.sync.clone();
    let options = PushOptions {
        remote: remote
            .as_deref()
            .map(RemoteName::parse)
            .transpose()
            .map_err(RepositoryError::from)?,
        force_with_lease,
    };
    run_job(&jobs, &job_id, on_progress, move |report, cancel| {
        Ok(sync.push(&PathBuf::from(path), &options, report, cancel)?)
    })
    .await
}

/// Adds a remote.
#[tauri::command]
#[specta::specta]
pub async fn add_remote(
    services: State<'_, AppServices>,
    path: String,
    name: String,
    url: String,
) -> Result<(), AppError> {
    let remotes = services.remotes.clone();
    run_blocking(move || Ok(remotes.add(&PathBuf::from(path), &name, &url)?)).await
}

/// Changes where a remote points.
#[tauri::command]
#[specta::specta]
pub async fn set_remote_url(
    services: State<'_, AppServices>,
    path: String,
    name: String,
    url: String,
) -> Result<(), AppError> {
    let remotes = services.remotes.clone();
    run_blocking(move || Ok(remotes.set_url(&PathBuf::from(path), &name, &url)?)).await
}

/// Removes a remote and its remote-tracking branches.
#[tauri::command]
#[specta::specta]
pub async fn remove_remote(
    services: State<'_, AppServices>,
    path: String,
    name: String,
) -> Result<(), AppError> {
    let remotes = services.remotes.clone();
    run_blocking(move || Ok(remotes.remove(&PathBuf::from(path), &name)?)).await
}

/// Deletes a branch on its remote, given as `remote/branch`.
#[tauri::command]
#[specta::specta]
pub async fn delete_remote_branch(
    services: State<'_, AppServices>,
    path: String,
    branch: String,
) -> Result<(), AppError> {
    let remotes = services.remotes.clone();
    run_blocking(move || Ok(remotes.delete_branch(&PathBuf::from(path), &branch)?)).await
}

/// Registered submodules and their state.
#[tauri::command]
#[specta::specta]
pub async fn list_submodules(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Vec<SubmoduleDto>, AppError> {
    let layout = services.layout.clone();
    run_blocking(move || {
        Ok(layout
            .submodules(&PathBuf::from(path))?
            .into_iter()
            .map(SubmoduleDto::from)
            .collect())
    })
    .await
}

/// Clones missing submodules and checks all out at their recorded commits.
#[tauri::command]
#[specta::specta]
pub async fn update_submodules(
    services: State<'_, AppServices>,
    jobs: State<'_, JobRegistry>,
    path: String,
    job_id: String,
    on_progress: Channel<CloneProgressDto>,
) -> Result<(), AppError> {
    let layout = services.layout.clone();
    run_job(&jobs, &job_id, on_progress, move |report, cancel| {
        Ok(layout.update_submodules(&PathBuf::from(path), report, cancel)?)
    })
    .await
}

/// Working trees of the repository, the main one first.
#[tauri::command]
#[specta::specta]
pub async fn list_worktrees(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Vec<WorktreeDto>, AppError> {
    let layout = services.layout.clone();
    run_blocking(move || {
        Ok(layout
            .worktrees(&PathBuf::from(path))?
            .into_iter()
            .map(WorktreeDto::from)
            .collect())
    })
    .await
}

/// Checks `branch` out in a new worktree next to the repository; returns its path.
#[tauri::command]
#[specta::specta]
pub async fn add_worktree(
    services: State<'_, AppServices>,
    path: String,
    branch: String,
) -> Result<String, AppError> {
    let layout = services.layout.clone();
    run_blocking(move || {
        Ok(layout
            .add_worktree(&PathBuf::from(path), &branch)?
            .display()
            .to_string())
    })
    .await
}

/// Removes a linked worktree that has no uncommitted changes.
#[tauri::command]
#[specta::specta]
pub async fn remove_worktree(
    services: State<'_, AppServices>,
    path: String,
    worktree: String,
) -> Result<(), AppError> {
    let layout = services.layout.clone();
    run_blocking(
        move || Ok(layout.remove_worktree(&PathBuf::from(path), &PathBuf::from(worktree))?),
    )
    .await
}

/// Who commits in the repository, or `None` when git does not know yet.
#[tauri::command]
#[specta::specta]
pub async fn get_identity(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Option<IdentityDto>, AppError> {
    let identities = services.identities.clone();
    run_blocking(move || {
        Ok(identities
            .current(&PathBuf::from(path))?
            .map(IdentityDto::from))
    })
    .await
}

/// Writes who commits (and how commits are signed) into the repository's config.
#[tauri::command]
#[specta::specta]
pub async fn set_identity(
    services: State<'_, AppServices>,
    path: String,
    identity: IdentityDto,
) -> Result<(), AppError> {
    let identities = services.identities.clone();
    run_blocking(move || Ok(identities.apply(&PathBuf::from(path), &identity.into())?)).await
}

/// The code review servers connected with an access token.
#[tauri::command]
#[specta::specta]
pub async fn list_hosting(
    services: State<'_, AppServices>,
) -> Result<Vec<HostingAccessDto>, AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || {
        Ok(hosting
            .connections()?
            .into_iter()
            .map(HostingAccessDto::from)
            .collect())
    })
    .await
}

/// Checks and keeps an access token for a code review server.
#[tauri::command]
#[specta::specta]
pub async fn connect_hosting(
    services: State<'_, AppServices>,
    server: String,
    kind: HostingKindDto,
    token: String,
) -> Result<HostingAccessDto, AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || Ok(hosting.connect(&server, kind.into(), token)?.into())).await
}

/// Connects a GitLab server with the user's git sign-in instead of a token.
#[tauri::command]
#[specta::specta]
pub async fn connect_hosting_with_login(
    services: State<'_, AppServices>,
    server: String,
) -> Result<HostingAccessDto, AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || Ok(hosting.connect_with_login(&server)?.into())).await
}

/// Forgets a code review server and its token.
#[tauri::command]
#[specta::specta]
pub async fn disconnect_hosting(
    services: State<'_, AppServices>,
    server: String,
) -> Result<(), AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || Ok(hosting.disconnect(&server)?)).await
}

/// The repository's project on a code review server, if a remote points to one.
#[tauri::command]
#[specta::specta]
pub async fn hosting_status(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Option<HostingStatusDto>, AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || {
        Ok(hosting
            .status(&PathBuf::from(path))?
            .map(HostingStatusDto::from))
    })
    .await
}

/// Open merge / pull requests of the repository's project.
#[tauri::command]
#[specta::specta]
pub async fn list_pull_requests(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Vec<PullRequestDto>, AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || {
        Ok(hosting
            .pull_requests(&PathBuf::from(path))?
            .into_iter()
            .map(PullRequestDto::from)
            .collect())
    })
    .await
}

/// Open issues of the repository's project.
#[tauri::command]
#[specta::specta]
pub async fn list_issues(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Vec<IssueDto>, AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || {
        Ok(hosting
            .issues(&PathBuf::from(path))?
            .into_iter()
            .map(IssueDto::from)
            .collect())
    })
    .await
}

/// Opens a merge / pull request from `source` into `target`.
#[tauri::command]
#[specta::specta]
pub async fn create_pull_request(
    services: State<'_, AppServices>,
    path: String,
    source: String,
    target: String,
    title: String,
) -> Result<PullRequestDto, AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || {
        let request = NewPullRequest {
            source_branch: source,
            target_branch: target,
            title,
            description: String::new(),
        };
        Ok(hosting
            .create_pull_request(&PathBuf::from(path), &request)?
            .into())
    })
    .await
}

/// The newest CI pipeline of each recently built commit.
#[tauri::command]
#[specta::specta]
pub async fn list_pipelines(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Vec<PipelineDto>, AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || {
        Ok(hosting
            .pipelines(&PathBuf::from(path))?
            .into_iter()
            .map(PipelineDto::from)
            .collect())
    })
    .await
}

/// Description, approvals and comments of request `number`.
#[tauri::command]
#[specta::specta]
pub async fn pull_request_review(
    services: State<'_, AppServices>,
    path: String,
    number: u32,
) -> Result<PullRequestReviewDto, AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || {
        Ok(hosting
            .review(&PathBuf::from(path), u64::from(number))?
            .into())
    })
    .await
}

/// Comments on request `number`.
#[tauri::command]
#[specta::specta]
pub async fn comment_pull_request(
    services: State<'_, AppServices>,
    path: String,
    number: u32,
    body: String,
) -> Result<(), AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || Ok(hosting.comment(&PathBuf::from(path), u64::from(number), &body)?)).await
}

/// Approves request `number`.
#[tauri::command]
#[specta::specta]
pub async fn approve_pull_request(
    services: State<'_, AppServices>,
    path: String,
    number: u32,
) -> Result<(), AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || Ok(hosting.approve(&PathBuf::from(path), u64::from(number))?)).await
}

/// Merges request `number` on the server.
#[tauri::command]
#[specta::specta]
pub async fn merge_pull_request(
    services: State<'_, AppServices>,
    path: String,
    number: u32,
) -> Result<(), AppError> {
    let hosting = services.hosting.clone();
    run_blocking(move || Ok(hosting.merge(&PathBuf::from(path), u64::from(number))?)).await
}

/// What `head` changes since it forked from `base` (branches, tags or ids).
#[tauri::command]
#[specta::specta]
pub async fn compare_refs(
    services: State<'_, AppServices>,
    path: String,
    base: String,
    head: String,
) -> Result<ComparisonDto, AppError> {
    let graph = services.commit_graph.clone();
    run_blocking(move || Ok(graph.compare(&PathBuf::from(path), &base, &head)?.into())).await
}

/// How `file` differs between commits `from` and `to`.
#[tauri::command]
#[specta::specta]
pub async fn compare_file_diff(
    services: State<'_, AppServices>,
    path: String,
    from: String,
    to: String,
    file: String,
) -> Result<FileDiffDto, AppError> {
    let graph = services.commit_graph.clone();
    run_blocking(move || {
        let (from, to) = (commit_id(&from)?, commit_id(&to)?);
        Ok(graph
            .compare_file_diff(&PathBuf::from(path), &from, &to, &file)?
            .into())
    })
    .await
}

/// Whether the repository uses Git LFS and whether `git lfs` is installed.
#[tauri::command]
#[specta::specta]
pub async fn lfs_status(
    services: State<'_, AppServices>,
    path: String,
) -> Result<LfsStatusDto, AppError> {
    let layout = services.layout.clone();
    run_blocking(move || Ok(layout.lfs(&PathBuf::from(path))?.into())).await
}

/// Stash entries, newest first.
#[tauri::command]
#[specta::specta]
pub async fn list_stashes(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Vec<StashDto>, AppError> {
    let stashes = services.stashes.clone();
    run_blocking(move || {
        Ok(stashes
            .list(&PathBuf::from(path))?
            .into_iter()
            .map(StashDto::from)
            .collect())
    })
    .await
}

/// Stashes uncommitted changes, and untracked files if asked.
#[tauri::command]
#[specta::specta]
pub async fn save_stash(
    services: State<'_, AppServices>,
    path: String,
    message: Option<String>,
    include_untracked: bool,
) -> Result<(), AppError> {
    let stashes = services.stashes.clone();
    run_blocking(move || {
        Ok(stashes.save(&PathBuf::from(path), message.as_deref(), include_untracked)?)
    })
    .await
}

/// Applies a stash entry; with `pop`, removes it once it applied cleanly.
#[tauri::command]
#[specta::specta]
pub async fn apply_stash(
    services: State<'_, AppServices>,
    path: String,
    index: u32,
    pop: bool,
) -> Result<(), AppError> {
    let stashes = services.stashes.clone();
    run_blocking(move || {
        let path = PathBuf::from(path);
        let index = widen(index);
        Ok(if pop {
            stashes.pop(&path, index)
        } else {
            stashes.apply(&path, index)
        }?)
    })
    .await
}

/// Deletes a stash entry.
#[tauri::command]
#[specta::specta]
pub async fn drop_stash(
    services: State<'_, AppServices>,
    path: String,
    index: u32,
) -> Result<(), AppError> {
    let stashes = services.stashes.clone();
    run_blocking(move || Ok(stashes.remove(&PathBuf::from(path), widen(index))?)).await
}

/// The merge, rebase, cherry-pick or revert waiting for the user, if any.
#[tauri::command]
#[specta::specta]
pub async fn repository_operation(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Option<OperationDto>, AppError> {
    let conflicts = services.conflicts.clone();
    run_blocking(move || {
        Ok(conflicts
            .operation(&PathBuf::from(path))?
            .map(OperationDto::from))
    })
    .await
}

/// Resolves a conflicted file by keeping one side.
#[tauri::command]
#[specta::specta]
pub async fn resolve_conflict(
    services: State<'_, AppServices>,
    path: String,
    file: String,
    side: ConflictSideDto,
) -> Result<(), AppError> {
    let conflicts = services.conflicts.clone();
    run_blocking(move || Ok(conflicts.take(&PathBuf::from(path), &file, side.into())?)).await
}

/// Stages conflicted files the user resolved by hand.
#[tauri::command]
#[specta::specta]
pub async fn mark_resolved(
    services: State<'_, AppServices>,
    path: String,
    files: Vec<String>,
) -> Result<(), AppError> {
    let conflicts = services.conflicts.clone();
    run_blocking(move || Ok(conflicts.mark_resolved(&PathBuf::from(path), &files)?)).await
}

/// Concludes the interrupted operation.
#[tauri::command]
#[specta::specta]
pub async fn continue_operation(
    services: State<'_, AppServices>,
    path: String,
) -> Result<(), AppError> {
    let conflicts = services.conflicts.clone();
    run_blocking(move || Ok(conflicts.continue_operation(&PathBuf::from(path))?)).await
}

/// Abandons the interrupted operation.
#[tauri::command]
#[specta::specta]
pub async fn abort_operation(
    services: State<'_, AppServices>,
    path: String,
) -> Result<(), AppError> {
    let conflicts = services.conflicts.clone();
    run_blocking(move || Ok(conflicts.abort(&PathBuf::from(path))?)).await
}

/// HTTPS git servers the user signed in to.
#[tauri::command]
#[specta::specta]
pub async fn list_accounts(services: State<'_, AppServices>) -> Result<Vec<AccountDto>, AppError> {
    let accounts = services.accounts.clone();
    run_blocking(move || Ok(accounts.list()?.into_iter().map(AccountDto::from).collect())).await
}

/// Hands the credentials to git's credential helper. With `repository`, they
/// are first tried against its remote on that server.
#[tauri::command]
#[specta::specta]
pub async fn sign_in(
    services: State<'_, AppServices>,
    server: String,
    username: String,
    password: String,
    repository: Option<String>,
) -> Result<AccountDto, AppError> {
    let accounts = services.accounts.clone();
    run_blocking(move || {
        let repository = repository.map(PathBuf::from);
        Ok(accounts
            .sign_in(SignIn {
                server: &server,
                username: &username,
                password,
                repository: repository.as_deref(),
            })?
            .into())
    })
    .await
}

/// Forgets an account and its stored password.
#[tauri::command]
#[specta::specta]
pub async fn sign_out(
    services: State<'_, AppServices>,
    server: String,
    username: String,
) -> Result<(), AppError> {
    let accounts = services.accounts.clone();
    run_blocking(move || Ok(accounts.sign_out(&server, &username)?)).await
}

/// Merges `branch` into the current branch.
#[tauri::command]
#[specta::specta]
pub async fn merge_branch(
    services: State<'_, AppServices>,
    path: String,
    branch: String,
) -> Result<(), AppError> {
    let history = services.history.clone();
    run_blocking(move || Ok(history.merge(&PathBuf::from(path), &branch)?)).await
}

/// Replays the current branch's own commits on top of `onto`.
#[tauri::command]
#[specta::specta]
pub async fn rebase_onto(
    services: State<'_, AppServices>,
    path: String,
    onto: String,
) -> Result<(), AppError> {
    let history = services.history.clone();
    run_blocking(move || Ok(history.rebase(&PathBuf::from(path), &onto)?)).await
}

/// Applies the changes of `commit` on the current branch.
#[tauri::command]
#[specta::specta]
pub async fn cherry_pick(
    services: State<'_, AppServices>,
    path: String,
    commit: String,
) -> Result<(), AppError> {
    let history = services.history.clone();
    run_blocking(move || Ok(history.cherry_pick(&PathBuf::from(path), &commit)?)).await
}

/// Adds a commit undoing `commit`.
#[tauri::command]
#[specta::specta]
pub async fn revert_commit(
    services: State<'_, AppServices>,
    path: String,
    commit: String,
) -> Result<(), AppError> {
    let history = services.history.clone();
    run_blocking(move || Ok(history.revert(&PathBuf::from(path), &commit)?)).await
}

/// Moves the current branch to `commit`.
#[tauri::command]
#[specta::specta]
pub async fn reset_to_commit(
    services: State<'_, AppServices>,
    path: String,
    commit: String,
    mode: ResetModeDto,
) -> Result<(), AppError> {
    let history = services.history.clone();
    run_blocking(move || Ok(history.reset(&PathBuf::from(path), &commit, mode.into())?)).await
}

/// Checks out `commit` without a branch.
#[tauri::command]
#[specta::specta]
pub async fn checkout_commit(
    services: State<'_, AppServices>,
    path: String,
    commit: String,
) -> Result<(), AppError> {
    let history = services.history.clone();
    run_blocking(move || Ok(history.checkout_commit(&PathBuf::from(path), &commit)?)).await
}

/// Tags `target`; annotated when `message` is given.
#[tauri::command]
#[specta::specta]
pub async fn create_tag(
    services: State<'_, AppServices>,
    path: String,
    name: String,
    target: String,
    message: Option<String>,
) -> Result<(), AppError> {
    let history = services.history.clone();
    run_blocking(move || {
        Ok(history.create_tag(&PathBuf::from(path), &name, &target, message.as_deref())?)
    })
    .await
}

/// Deletes a local tag.
#[tauri::command]
#[specta::specta]
pub async fn delete_tag(
    services: State<'_, AppServices>,
    path: String,
    name: String,
) -> Result<(), AppError> {
    let history = services.history.clone();
    run_blocking(move || Ok(history.delete_tag(&PathBuf::from(path), &name)?)).await
}

/// Pushes a tag to the default remote.
#[tauri::command]
#[specta::specta]
pub async fn push_tag(
    services: State<'_, AppServices>,
    path: String,
    name: String,
) -> Result<(), AppError> {
    let history = services.history.clone();
    run_blocking(move || Ok(history.push_tag(&PathBuf::from(path), &name)?)).await
}

/// The commits an interactive rebase onto `base` would rewrite, oldest first.
#[tauri::command]
#[specta::specta]
pub async fn rebase_plan(
    services: State<'_, AppServices>,
    path: String,
    base: String,
) -> Result<Vec<CommitSummaryDto>, AppError> {
    let history = services.history.clone();
    run_blocking(move || {
        Ok(history
            .rebase_plan(&PathBuf::from(path), &base)?
            .into_iter()
            .map(CommitSummaryDto::from)
            .collect())
    })
    .await
}

/// Rewrites the commits after `base` as `steps` says.
#[tauri::command]
#[specta::specta]
pub async fn rebase_interactive(
    services: State<'_, AppServices>,
    path: String,
    base: String,
    steps: Vec<RebaseStepDto>,
) -> Result<(), AppError> {
    let history = services.history.clone();
    run_blocking(move || {
        let steps = steps
            .into_iter()
            .map(RebaseStepDto::into_step)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(history.rebase_interactive(&PathBuf::from(path), &base, &steps)?)
    })
    .await
}

/// A conflicted file split into agreed text and conflicts.
#[tauri::command]
#[specta::specta]
pub async fn conflict_chunks(
    services: State<'_, AppServices>,
    path: String,
    file: String,
) -> Result<Vec<ConflictChunkDto>, AppError> {
    let conflicts = services.conflicts.clone();
    run_blocking(move || {
        Ok(conflicts
            .chunks(&PathBuf::from(path), &file)?
            .into_iter()
            .map(ConflictChunkDto::from)
            .collect())
    })
    .await
}

/// Writes the user's resolution of a conflicted file and stages it.
#[tauri::command]
#[specta::specta]
pub async fn resolve_conflict_with(
    services: State<'_, AppServices>,
    path: String,
    file: String,
    content: String,
) -> Result<(), AppError> {
    let conflicts = services.conflicts.clone();
    run_blocking(move || Ok(conflicts.resolve_with(&PathBuf::from(path), &file, &content)?)).await
}

/// What Undo would revert, e.g. "Merge topic".
#[tauri::command]
#[specta::specta]
pub async fn pending_undo(
    services: State<'_, AppServices>,
    path: String,
) -> Result<Option<String>, AppError> {
    let history = services.history.clone();
    run_blocking(move || Ok(history.pending_undo(&PathBuf::from(path)))).await
}

/// Reverts the last undoable action and returns what it was.
#[tauri::command]
#[specta::specta]
pub async fn undo(services: State<'_, AppServices>, path: String) -> Result<String, AppError> {
    let history = services.history.clone();
    run_blocking(move || Ok(history.undo(&PathBuf::from(path))?)).await
}

fn widen(value: u32) -> usize {
    usize::try_from(value).expect("usize is at least 32 bits on supported platforms")
}
