import type {
  AccountDto,
  AppError,
  BlameLineDto,
  BranchDto_Serialize,
  CloneProgressDto_Serialize,
  ChangedFileDto_Serialize,
  CommitDetailsDto,
  CommitSummaryDto,
  ConflictChunkDto_Serialize,
  ConflictSideDto,
  DiffLineDto_Serialize,
  DiffSideDto,
  FileDiffDto_Serialize,
  GitInstallationDto,
  GraphPageDto,
  HunkActionDto,
  HunkDto_Serialize,
  IdentityDto_Serialize,
  LfsStatusDto,
  OperationDto,
  PullStrategyDto,
  RebaseStepDto,
  RecentRepositoryDto,
  RemoteDto,
  RepositorySummaryDto,
  ResetModeDto,
  SettingsDto_Serialize,
  StashDto,
  SubmoduleDto,
  WorktreeDto_Serialize,
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
export type Stash = StashDto;
export type Operation = OperationDto;
export type ConflictSide = ConflictSideDto;
export type Settings = SettingsDto_Serialize;
export type Account = AccountDto;
export type ResetMode = ResetModeDto;
export type CommitSummary = CommitSummaryDto;
export type BlameLine = BlameLineDto;
export type RebaseStep = RebaseStepDto;
export type ConflictChunk = ConflictChunkDto_Serialize;
export type Submodule = SubmoduleDto;
export type Worktree = WorktreeDto_Serialize;
export type LfsStatus = LfsStatusDto;
export type Identity = IdentityDto_Serialize;

/** Where and how to push. */
export interface PushOptions {
  /** A remote other than the branch's upstream. */
  remote?: string;
  /** Overwrite the remote branch if it is still where it was last fetched. */
  forceWithLease?: boolean;
}

/** Receives progress of a long-running network job. */
export type OnProgress = (progress: CloneProgress) => void;

/** One hunk as the UI showed it; the backend refuses it if the file changed. */
export interface HunkTarget {
  file: string;
  index: number;
  header: string;
  /** Only these lines (indexes into the hunk's lines); the whole hunk when absent. */
  lines?: number[];
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
  /** Branches and tags named in `hidden` are left out of the graph. */
  loadGraphPage(
    path: string,
    offset: number,
    limit: number,
    hidden: string[],
  ): Promise<Result<GraphPageDto>>;
  /** Graph rows matching `query` (message, author or SHA prefix), top to bottom. */
  searchCommits(path: string, query: string, hidden: string[]): Promise<Result<number[]>>;
  /** Commits that changed `file`, newest first. */
  fileHistory(path: string, file: string): Promise<Result<CommitSummary[]>>;
  /** Who last changed each line of `file`. */
  blameFile(path: string, file: string): Promise<Result<BlameLine[]>>;
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
  pushBranch(
    path: string,
    options: PushOptions,
    jobId: string,
    onProgress: OnProgress,
  ): Promise<Result<null>>;
  addRemote(path: string, name: string, url: string): Promise<Result<null>>;
  setRemoteUrl(path: string, name: string, url: string): Promise<Result<null>>;
  removeRemote(path: string, name: string): Promise<Result<null>>;
  /** Deletes `remote/branch` on its remote. */
  deleteRemoteBranch(path: string, branch: string): Promise<Result<null>>;
  listSubmodules(path: string): Promise<Result<Submodule[]>>;
  updateSubmodules(path: string, jobId: string, onProgress: OnProgress): Promise<Result<null>>;
  /** The main working tree first. */
  listWorktrees(path: string): Promise<Result<Worktree[]>>;
  /** Checks `branch` out in a new worktree next to the repository; resolves to its path. */
  addWorktree(path: string, branch: string): Promise<Result<string>>;
  removeWorktree(path: string, worktree: string): Promise<Result<null>>;
  lfsStatus(path: string): Promise<Result<LfsStatus>>;
  /** Who commits in the repository, or `null` when git does not know yet. */
  getIdentity(path: string): Promise<Result<Identity | null>>;
  /** Writes who commits (and how commits are signed) into the repository's config. */
  setIdentity(path: string, identity: Identity): Promise<Result<null>>;
  /** Newest first. */
  listStashes(path: string): Promise<Result<Stash[]>>;
  saveStash(path: string, message: string | null, includeUntracked: boolean): Promise<Result<null>>;
  /** With `pop`, the entry is removed once it applied cleanly. */
  applyStash(path: string, index: number, pop: boolean): Promise<Result<null>>;
  dropStash(path: string, index: number): Promise<Result<null>>;
  /** The merge, rebase, cherry-pick or revert waiting on conflicts, if any. */
  repositoryOperation(path: string): Promise<Result<Operation | null>>;
  /** Resolves a conflicted file by keeping one side, and stages it. */
  resolveConflict(path: string, file: string, side: ConflictSide): Promise<Result<null>>;
  markResolved(path: string, files: string[]): Promise<Result<null>>;
  continueOperation(path: string): Promise<Result<null>>;
  abortOperation(path: string): Promise<Result<null>>;
  /** Whether `executable` (git from `PATH` when `null`) is a supported git. */
  checkGitExecutable(executable: string | null): Promise<Result<GitInstallationDto>>;
  getSettings(): Promise<Result<Settings>>;
  /** Used from the next start; refused if it is not a supported git. */
  setGitExecutable(executable: string | null): Promise<Result<Settings>>;
  restartApp(): Promise<void>;
  /** Scales the whole interface, like a browser zoom. */
  setZoom(scale: number): Promise<Result<null>>;
  /** Shows the native file picker for a program; resolves to `null` if the user cancels. */
  pickExecutable(title: string): Promise<string | null>;
  listAccounts(): Promise<Result<Account[]>>;
  /**
   * Hands the credentials to git's credential helper. With `repository`,
   * they are first tried against its remote on that server.
   */
  signIn(
    server: string,
    username: string,
    password: string,
    repository: string | null,
  ): Promise<Result<Account>>;
  signOut(server: string, username: string): Promise<Result<null>>;
  /** Merges `branch` into the current branch. */
  mergeBranch(path: string, branch: string): Promise<Result<null>>;
  /** Replays the current branch's own commits on top of `onto`. */
  rebaseOnto(path: string, onto: string): Promise<Result<null>>;
  cherryPick(path: string, commit: string): Promise<Result<null>>;
  revertCommit(path: string, commit: string): Promise<Result<null>>;
  resetToCommit(path: string, commit: string, mode: ResetMode): Promise<Result<null>>;
  /** Checks out a commit without a branch (detached HEAD). */
  checkoutCommit(path: string, commit: string): Promise<Result<null>>;
  /** Annotated when `message` is given. */
  createTag(
    path: string,
    name: string,
    target: string,
    message: string | null,
  ): Promise<Result<null>>;
  deleteTag(path: string, name: string): Promise<Result<null>>;
  pushTag(path: string, name: string): Promise<Result<null>>;
  /** The commits an interactive rebase onto `base` would rewrite, oldest first. */
  rebasePlan(path: string, base: string): Promise<Result<CommitSummary[]>>;
  /** Rewrites the commits after `base` as `steps` says, oldest first. */
  rebaseInteractive(path: string, base: string, steps: RebaseStep[]): Promise<Result<null>>;
  /** A conflicted file split into agreed text and conflicts. */
  conflictChunks(path: string, file: string): Promise<Result<ConflictChunk[]>>;
  /** Writes the user's resolution of a conflicted file and stages it. */
  resolveConflictWith(path: string, file: string, content: string): Promise<Result<null>>;
  /** What Undo would revert, e.g. "Merge topic". */
  pendingUndo(path: string): Promise<Result<string | null>>;
  /** Resolves to what was undone. */
  undo(path: string): Promise<Result<string>>;
  /** Shows the native folder picker; resolves to `null` if the user cancels. */
  pickFolder(title: string): Promise<string | null>;
}
