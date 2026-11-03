//! IPC adapter: Tauri commands and the types they exchange with the UI.

mod commands;
mod dto;
mod error;

/// Builds the typed command and event registry shared by the runtime and
/// the TypeScript bindings generator.
pub fn ipc_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            commands::check_git_installation,
            commands::open_repository,
            commands::init_repository,
            commands::refresh_repository,
            commands::clone_repository,
            commands::cancel_job,
            commands::list_recent_repositories,
            commands::remove_recent_repository,
            commands::watch_repository,
            commands::unwatch_repository,
            commands::load_graph_page,
            commands::commit_details,
            commands::working_tree_status,
            commands::file_diff,
            commands::commit_file_diff,
            commands::stage_files,
            commands::unstage_files,
            commands::discard_files,
            commands::apply_hunk,
            commands::commit_changes,
            commands::head_message,
            commands::list_branches,
            commands::create_branch,
            commands::checkout_branch,
            commands::rename_branch,
            commands::delete_branch,
            commands::list_remotes,
            commands::fetch_remotes,
            commands::pull_branch,
            commands::push_branch,
        ])
        .events(tauri_specta::collect_events![dto::RepositoryChanged])
}
