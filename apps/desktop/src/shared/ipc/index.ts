/**
 * The UI's only gateway to the Rust core. Nothing outside `shared/ipc` may
 * import `@tauri-apps/api` (enforced by ESLint).
 *
 * Outside the Tauri webview (plain browser, Playwright) a mock backend is used
 * so the UI can be developed and tested without the native shell.
 */
import { isTauri } from '@tauri-apps/api/core';

import { commands, type AppError } from './bindings';
import { mockCommands } from './mockCommands';

export type { AppError, GitInstallationDto } from './bindings';

export type IpcCommands = typeof commands;

/** The shape every generated command resolves to. */
export type Result<T, E> = { status: 'ok'; data: T } | { status: 'error'; error: E };

export const ipc: IpcCommands = isTauri() ? commands : mockCommands;

/** Raised when a command returns an `AppError`; lets TanStack Query treat it as a failure. */
export class IpcError extends Error {
  readonly kind: AppError['kind'];

  constructor(error: AppError) {
    super(error.message);
    this.name = 'IpcError';
    this.kind = error.kind;
  }
}

export function unwrap<T>(result: Result<T, AppError>): T {
  if (result.status === 'error') {
    throw new IpcError(result.error);
  }
  return result.data;
}
