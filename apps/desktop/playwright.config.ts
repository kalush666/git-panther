import { defineConfig, devices } from '@playwright/test';

const PREVIEW_URL = 'http://localhost:1420';

// E2E tests run the UI in a browser against the mocked IPC backend
// (see src/shared/ipc/mockCommands.ts); the real Tauri shell is covered by
// the Rust integration tests and a later tauri-driver smoke test.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: PREVIEW_URL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm vite:dev',
    url: PREVIEW_URL,
    reuseExistingServer: !process.env.CI,
  },
});
