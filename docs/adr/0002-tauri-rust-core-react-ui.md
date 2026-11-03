# 2. Tauri 2 with a Rust core and a React UI

Date: 2026-11-03 · Status: Accepted

## Context
We need a cross-platform desktop Git client that stays fast on 100k+ commit repositories. Candidates: Tauri 2 (Rust + system webview) and Electron (Node + bundled Chromium).

## Decision
Use **Tauri 2**. The Rust core owns the domain, application and infrastructure layers; React + TypeScript + Vite is presentation only. IPC types are generated from Rust with `specta`.

## Consequences
- Installers around 5–15 MB and low memory use; heavy work runs on native threads.
- The team needs Rust; build requires the MSVC toolchain on Windows.
- System webviews differ slightly per OS (WebView2, WKWebView, WebKitGTK) — CI builds on all three and UI tests avoid engine-specific behaviour.
- A single source of truth for types removes TS/Rust drift.
