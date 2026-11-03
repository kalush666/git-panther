fn main() {
    embed_windows_test_manifest();
    tauri_build::build();
}

/// Tauri links Common-Controls v6 APIs. tauri-build embeds the required
/// manifest only into the app binary, so test binaries would fail to start on
/// Windows with `STATUS_ENTRYPOINT_NOT_FOUND` without this.
fn embed_windows_test_manifest() {
    const MANIFEST: &str = "windows-test-manifest.xml";
    let is_windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if !is_windows_msvc {
        return;
    }
    let manifest_dir =
        std::env::var("CARGO_MANIFEST_DIR").expect("cargo always sets CARGO_MANIFEST_DIR");
    let manifest = std::path::Path::new(&manifest_dir).join(MANIFEST);
    println!("cargo:rerun-if-changed={MANIFEST}");
    println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
    println!(
        "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}",
        manifest.display()
    );
}
