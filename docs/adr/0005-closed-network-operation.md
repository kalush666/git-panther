# 5. Closed-network operation

Date: 2026-11-03 · Status: Accepted

## Context

Git Panther must be fully usable on closed (air-gapped or internet-restricted) networks. Development and CI happen on an internet-connected machine; installers are carried into the closed network.

## Decision

- **No internet at runtime.** The app only talks to the git remotes the user configures and, later, to self-hosted servers the user configures. No CDNs, web fonts, telemetry, crash reporting, avatar services (e.g. Gravatar) or update checks against public services.
- **Everything is bundled.** Fonts, icons and all UI assets ship inside the app. The CSP allows only the app's own origin (`default-src 'self'`, `object-src 'none'`).
- **Installer is self-contained.** The Windows installer embeds the WebView2 offline installer (`webviewInstallMode: offlineInstaller`) and installs it only when missing.
- **System git stays a requirement.** On managed networks IT provisions git; messages point to the organization's software catalog as well as git-scm.com.
- **Future network features are self-hosted only.** Hosting integrations target GitHub Enterprise Server, GitLab self-managed, Azure DevOps Server and Bitbucket Data Center with configurable base URLs and custom CA certificates. Updates come from an internal update server or are installed manually.
- **Enforced automatically.** Every E2E test fails if the UI requests any non-local URL (`e2e/fixtures.ts`), and `pnpm check:offline` fails if the production bundle references an external origin.

## Consequences

- The Windows installer grows by roughly 130 MB.
- Cloud-only conveniences (public avatars, cloud OAuth apps, public auto-update) are out of scope.
- New dependencies must not fetch remote resources at runtime; the guards catch violations in CI.
- Releases are checked as described in [Offline verification](../OFFLINE-VERIFICATION.md).
