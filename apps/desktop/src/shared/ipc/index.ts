/**
 * The UI's only gateway to the Rust core. Nothing outside `shared/ipc` may
 * import `@tauri-apps/*` (enforced by ESLint).
 *
 * Outside the Tauri webview (plain browser, Playwright) an in-memory mock is
 * used so the UI can be developed and tested without the native shell.
 */
import { isTauri } from '@tauri-apps/api/core';

import type { Backend, Result } from './backend';
import type { AppError } from './bindings';
import { mockBackend } from './mockBackend';
import { tauriBackend } from './tauriBackend';

export type {
  Account,
  Backend,
  BlameLine,
  Branch,
  ChangedFile,
  CloneOptions,
  CloneProgress,
  CommitSummary,
  ConflictChunk,
  ConflictSide,
  DiffHunk,
  DiffLine,
  DiffSide,
  FileDiff,
  HunkAction,
  FlowKind,
  OpenTarget,
  Pipeline,
  RebaseAction,
  ReflogEntry,
  PipelineState,
  HostingAccess,
  HostingKind,
  HostingStatus,
  HunkTarget,
  Identity,
  Issue,
  LfsStatus,
  OnProgress,
  ResetMode,
  Operation,
  PullRequest,
  PullStrategy,
  PushOptions,
  RebaseStep,
  Remote,
  Result,
  Settings,
  Stash,
  Submodule,
  WorkingTreeStatus,
  Worktree,
} from './backend';
export type {
  AppError,
  AppErrorKind,
  CommitDetailsDto,
  FileChangeDto,
  GitInstallationDto,
  GraphEntryDto,
  GraphPageDto,
  GraphRowDto,
  HeadDto,
  PersonDto,
  RefLabelDto,
  RecentRepositoryDto,
  RepositorySummaryDto,
} from './bindings';

export const ipc: Backend = isTauri() ? tauriBackend : mockBackend;

/** Raised when a command returns an `AppError`; lets TanStack Query treat it as a failure. */
export class IpcError extends Error {
  readonly kind: AppError['kind'];

  constructor(error: AppError) {
    super(error.message);
    this.name = 'IpcError';
    this.kind = error.kind;
  }
}

export function unwrap<T>(result: Result<T>): T {
  if (result.status === 'error') {
    throw new IpcError(result.error);
  }
  return result.data;
}

export function isIpcError(error: unknown, kind?: AppError['kind']): error is IpcError {
  return error instanceof IpcError && (kind === undefined || error.kind === kind);
}
