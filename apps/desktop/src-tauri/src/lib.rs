//! Git Panther desktop app.
//!
//! This crate is the composition root: it wires infrastructure adapters into
//! use cases and exposes them to the UI as typed Tauri commands.

mod composition;
mod ipc;

pub use ipc::ipc_builder;

/// Starts the desktop application.
///
/// # Panics
/// Panics if the Tauri runtime fails to start, which leaves nothing to recover.
pub fn run() {
    let ipc = ipc_builder();
    tauri::Builder::default()
        .manage(composition::AppServices::new())
        .invoke_handler(ipc.invoke_handler())
        .run(tauri::generate_context!())
        .expect("the Tauri runtime must start for the app to run");
}
