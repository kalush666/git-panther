import type {
  AppError,
  BranchDto_Serialize,
  CloneProgressDto_Serialize,
  ChangedFileDto_Serialize,
  CommitDetailsDto,
  DiffLineDto_Serialize,
  DiffSideDto,
  FileDiffDto_Serialize,
  GitInstallationDto,
  GraphPageDto,
  HunkActionDto,
  HunkDto_Serialize,
  PullStrategyDto,
  RecentRepositoryDto,
  RemoteDto,
  RepositorySummaryDto,
  WorkingTreeStatusDto_Serialize,
} from './bindings';

/** The shape every backend call resolves to. */
export type Result<T> = { status: 'ok'; data: T } | { status: 'error'; error: AppError };

export type CloneProgress = CloneProgressDto_Serialize;
export type WorkingTreeStatus = WorkingTreeStatusDto_Serialize;
export type ChangedFile = ChangedFileDto_Serialize;
export type FileDiff = FileDiffDto_Serialize;
export type DiffHunk = HunkDto_Serialize;
export type DiffLine = DiffLineDto_Serialize;
export type DiffSide = DiffSideDto;
export type HunkAction = HunkActionDto;
export type Branch = BranchDto_Serialize;
export type Remote = RemoteDto;
export type PullStrategy = PullStrategyDto;

/** Receives progress of a long-running network job. */
export type OnProgress = (progress: CloneProgress) => void;

/** One hunk as the UI showed it; the backend refuses it if the file changed. */
export interface HunkTarget {
  file: string;
  index: number;
  header: string;
}

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
    onProgress: OnProgress,
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
  commitFileDiff(path: string, id: string, file: string): Promise<Result<FileDiff>>;
  workingTreeStatus(path: string): Promise<Result<WorkingTreeStatus>>;
  fileDiff(path: string, file: string, side: DiffSide): Promise<Result<FileDiff>>;
  stageFiles(path: string, files: string[]): Promise<Result<null>>;
  unstageFiles(path: string, files: string[]): Promise<Result<null>>;
  /** Throws away unstaged changes; untracked files are deleted. */
  discardFiles(path: string, files: string[]): Promise<Result<null>>;
  applyHunk(path: string, hunk: HunkTarget, action: HunkAction): Promise<Result<null>>;
  /** Resolves to the new commit id. */
  commitChanges(path: string, message: string, amend: boolean): Promise<Result<string>>;
  headMessage(path: string): Promise<Result<string | null>>;
  listBranches(path: string): Promise<Result<Branch[]>>;
  createBranch(path: string, name: string, start: string, checkout: boolean): Promise<Result<null>>;
  /** For a remote branch, switches to a local branch tracking it. */
  checkoutBranch(path: string, name: string): Promise<Result<null>>;
  renameBranch(path: string, from: string, to: string): Promise<Result<null>>;
  deleteBranch(path: string, name: string, force: boolean): Promise<Result<null>>;
  listRemotes(path: string): Promise<Result<Remote[]>>;
  /** Fetches every remote. `jobId` lets the caller cancel with `cancelJob`. */
  fetchRemotes(path: string, jobId: string, onProgress: OnProgress): Promise<Result<null>>;
  pullBranch(
    path: string,
    strategy: PullStrategy,
    jobId: string,
    onProgress: OnProgress,
  ): Promise<Result<null>>;
  /** Pushes the current branch, setting its upstream on the first push. */
  pushBranch(path: string, jobId: string, onProgress: OnProgress): Promise<Result<null>>;
  /** Shows the native folder picker; resolves to `null` if the user cancels. */
  pickFolder(title: string): Promise<string | null>;
}
