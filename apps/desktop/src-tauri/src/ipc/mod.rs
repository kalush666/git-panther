//! IPC adapter: Tauri commands and the types they exchange with the UI.

mod commands;
mod dto;
mod error;

/// Builds the typed command registry shared by the runtime and the
/// TypeScript bindings generator.
pub fn ipc_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        commands::check_git_installation
    ])
}
