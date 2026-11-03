/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const DEV_HOST = '127.0.0.1';
const DEV_PORT = 1420;

// Tauri expects a fixed dev address and must not have its own files watched.
// Binding to IPv4 explicitly: `localhost` may resolve to ::1 only, which
// browsers and tools reaching 127.0.0.1 cannot connect to.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: DEV_HOST,
    port: DEV_PORT,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'es2023',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
