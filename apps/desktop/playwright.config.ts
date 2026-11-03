import { defineConfig, devices } from '@playwright/test';

const PREVIEW_HOST = '127.0.0.1';
const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://${PREVIEW_HOST}:${PREVIEW_PORT}`;

// E2E tests run the production UI build in a browser against the mocked
// backend (src/shared/ipc/mockBackend.ts); the real Tauri shell is covered by
// the Rust integration tests and a later tauri-driver smoke test.
//
// A static preview build is used instead of the dev server: it matches what
// ships, and the dev server's on-demand module transforms stall when several
// fresh browser contexts load it in parallel.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Locally, more workers overload the static server on slower machines.
  workers: process.env.CI ? undefined : 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: PREVIEW_URL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm vite:build && pnpm exec vite preview --host ${PREVIEW_HOST} --port ${PREVIEW_PORT} --strictPort`,
    url: PREVIEW_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
