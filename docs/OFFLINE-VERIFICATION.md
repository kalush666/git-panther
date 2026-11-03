# Offline verification

How Git Panther is checked to work on a closed network ([ADR 5](adr/0005-closed-network-operation.md)).

## Automated, on every change

| Guard                                              | What it proves                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/fixtures.ts`                                  | Every E2E test fails if the UI requests a non-local URL.                                                                        |
| `pnpm check:offline`                               | The production UI bundle references no external origin.                                                                         |
| Tauri CSP `default-src 'self'`                     | The webview cannot load or fetch anything outside the app, even if a dependency tried to.                                       |
| `scripts/verify-installers.mjs` (Release workflow) | The NSIS and MSI installers are large enough to contain the WebView2 offline installer, so installing never downloads WebView2. |

## Manual, before each release

Use a Windows machine (or VM) **without network access** and without WebView2 if possible (a fresh Windows 10 VM, or Windows Server Core with Desktop Experience).

1. Copy `Git Panther_<version>_x64-setup.exe` (or the `.msi`) and the Git for Windows installer onto the machine.
2. Disconnect the network: disable the adapter, or for a VM remove its virtual NIC.
3. Install Git for Windows, then Git Panther. The installer must finish without asking for a download. WebView2 is installed silently when missing.
4. Start Git Panther. Expected:
   - the welcome screen shows the git version in the status bar;
   - fonts and icons render (nothing falls back to system fonts or empty boxes).
5. Create a repository with **New repository**, add a file, then stage, commit, branch, stash and pop it. All of it must work offline.
6. Clone from a local path or a file share (for example `\\server\repos\demo.git`), then fetch, pull and push against it.
7. Add a remote with an unreachable URL and **Fetch**: the app explains that the remote cannot be reached and stays responsive.
8. Open **Settings**, change the theme, interface size and code font, then restart. The choices must persist.

Record the Windows version, the Git Panther version and the result in the release notes.
