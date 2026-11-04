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
    HunkActionDto, OperationDto, PullStrategyDto, RebaseStepDto, RecentRepositoryDto, RemoteDto,
    RepositoryChanged, RepositorySummaryDto, ResetModeDto, SettingsDto, StashDto,
    WorkingTreeStatusDto,
};
use super::error::{AppError, AppErrorKind};
use crate::composition::AppServices;
use crate::infra::jobs::JobRegistry;
use crate::infra::watcher::RepositoryWatcher;
use panther_application::accounts::SignIn;

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
pub async fn push_branch(
    services: State<'_, AppServices>,
    jobs: State<'_, JobRegistry>,
    path: String,
    job_id: String,
    on_progress: Channel<CloneProgressDto>,
) -> Result<(), AppError> {
    let sync = services.sync.clone();
    run_job(&jobs, &job_id, on_progress, move |report, cancel| {
        Ok(sync.push(&PathBuf::from(path), report, cancel)?)
    })
    .await
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
