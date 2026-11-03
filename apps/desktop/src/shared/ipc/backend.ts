import type {
  AppError,
  CloneProgressDto_Serialize,
  CommitDetailsDto,
  GitInstallationDto,
  GraphPageDto,
  RecentRepositoryDto,
  RepositorySummaryDto,
} from './bindings';

/** The shape every backend call resolves to. */
export type Result<T> = { status: 'ok'; data: T } | { status: 'error'; error: AppError };

export type CloneProgress = CloneProgressDto_Serialize;

export interface CloneOptions {
  url: string;
  destination: string;
  /** Chosen by the caller so it can cancel the clone with `cancelJob`. */
  jobId: string;
}

/**
 * Everything the UI can ask of the Rust core. Features depend on this
 * interface, never on Tauri directly, so a mock can stand in outside the
 * desktop shell.
 */
export interface Backend {
  checkGitInstallation(): Promise<Result<GitInstallationDto>>;
  openRepository(path: string): Promise<Result<RepositorySummaryDto>>;
  initRepository(path: string): Promise<Result<RepositorySummaryDto>>;
  refreshRepository(path: string): Promise<Result<RepositorySummaryDto>>;
  cloneRepository(
    options: CloneOptions,
    onProgress: (progress: CloneProgress) => void,
  ): Promise<Result<RepositorySummaryDto>>;
  cancelJob(jobId: string): Promise<Result<null>>;
  listRecentRepositories(): Promise<Result<RecentRepositoryDto[]>>;
  removeRecentRepository(path: string): Promise<Result<null>>;
  watchRepository(path: string): Promise<Result<null>>;
  unwatchRepository(path: string): Promise<Result<null>>;
  /** Calls `listener` with the repository path on every change; returns an unsubscribe function. */
  onRepositoryChanged(listener: (path: string) => void): Promise<() => void>;
  /** Up to `limit` rows of the commit graph starting at row `offset`. */
  loadGraphPage(path: string, offset: number, limit: number): Promise<Result<GraphPageDto>>;
  commitDetails(path: string, id: string): Promise<Result<CommitDetailsDto>>;
  /** Shows the native folder picker; resolves to `null` if the user cancels. */
  pickFolder(title: string): Promise<string | null>;
}
