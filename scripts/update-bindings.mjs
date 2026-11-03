// Regenerates apps/desktop/src/shared/ipc/bindings.ts from the Rust IPC types.
import { spawnSync } from 'node:child_process';

const result = spawnSync('cargo', ['test', '-p', 'git-panther', '--test', 'bindings'], {
  stdio: 'inherit',
  env: { ...process.env, UPDATE_BINDINGS: '1' },
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
