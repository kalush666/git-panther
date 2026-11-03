//! Keeps the generated TypeScript IPC bindings in sync with the Rust types.
//!
//! Regenerate with `pnpm bindings` (sets `UPDATE_BINDINGS=1`).

use std::path::PathBuf;

const BINDINGS_PATH: &str = "../src/shared/ipc/bindings.ts";

fn exporter() -> specta_typescript::Typescript {
    specta_typescript::Typescript::default().header("// @ts-nocheck\n/* eslint-disable */")
}

#[test]
fn typescript_bindings_are_up_to_date() {
    let committed_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(BINDINGS_PATH);

    if std::env::var_os("UPDATE_BINDINGS").is_some() {
        git_panther_lib::ipc_builder()
            .export(exporter(), &committed_path)
            .expect("bindings should export");
        return;
    }

    let fresh_path = std::env::temp_dir().join("git-panther-bindings.ts");
    git_panther_lib::ipc_builder()
        .export(exporter(), &fresh_path)
        .expect("bindings should export");
    let fresh = std::fs::read_to_string(&fresh_path).expect("fresh bindings readable");
    let committed = std::fs::read_to_string(&committed_path).unwrap_or_default();
    assert_eq!(
        normalize(&committed),
        normalize(&fresh),
        "IPC bindings are stale — run `pnpm bindings` and commit the result"
    );
}

fn normalize(text: &str) -> String {
    text.replace("\r\n", "\n")
}
