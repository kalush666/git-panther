//! Git Panther desktop app.
//!
//! This crate is the composition root: it wires infrastructure adapters into
//! use cases and exposes them to the UI as typed Tauri commands.

mod composition;
mod infra;
mod ipc;

use tauri::Manager;

pub use ipc::ipc_builder;

/// Starts the desktop application.
///
/// # Panics
/// Panics if the Tauri runtime fails to start, which leaves nothing to recover.
pub fn run() {
    let ipc = ipc_builder();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(infra::jobs::JobRegistry::default())
        .manage(infra::watcher::RepositoryWatcher::default())
        .invoke_handler(ipc.invoke_handler())
        .setup(move |app| {
            ipc.mount_events(app);
            let config_dir = app.path().app_config_dir()?;
            app.manage(composition::AppServices::new(&config_dir));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the Tauri runtime must start for the app to run");
}
