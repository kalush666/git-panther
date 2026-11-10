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
  HostingAccessDto,
  HostingKindDto,
  HostingStatusDto,
  PullRequestReviewDto,
  ReviewCommentDto,
  ComparisonDto,
  ReflogEntryDto,
  FlowKindDto,
  OpenTargetDto,
  BisectStatusDto,
  GitActivityDto,
  BisectVerdictDto,
  FlowFinishedDto,
  PipelineDto,
  PipelineStateDto,
  HunkDto_Serialize,
  IdentityDto_Serialize,
  LfsStatusDto,
  IssueDto,
  OperationDto,
  PullRequestDto,
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
export type RebaseAction = RebaseStepDto['action'];
export type ConflictChunk = ConflictChunkDto_Serialize;
export type Submodule = SubmoduleDto;
export type Worktree = WorktreeDto_Serialize;
export type LfsStatus = LfsStatusDto;
export type Identity = IdentityDto_Serialize;
export type HostingKind = HostingKindDto;
export type HostingAccess = HostingAccessDto;
export type HostingStatus = HostingStatusDto;
export type PullRequestReview = PullRequestReviewDto;
export type ReviewComment = ReviewCommentDto;
export type Comparison = ComparisonDto;
export type ReflogEntry = ReflogEntryDto;
export type FlowKind = FlowKindDto;
export type OpenTarget = OpenTargetDto;
export type BisectStatus = BisectStatusDto;
export type GitActivity = GitActivityDto;
export type BisectVerdict = BisectVerdictDto;
export type FlowFinished = FlowFinishedDto;
export type Pipeline = PipelineDto;
export type PipelineState = PipelineStateDto;
export type PullRequest = PullRequestDto;
export type Issue = IssueDto;

/** Where and how to push. */
export interface PushOptions {
  /** A remote other than the branch's upstream. */
  remote?: string;
  /** Overwrite the remote branch if it is still where it was last fetched. */
  forceWithLease?: boolean;
  /** The local branch to push; the checked-out one when left out. */
  source?: string;
  /** The branch name on the remote; the source's own name when left out. */
  target?: string;
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
  /** Rows by `author` (name or email) and/or `since` (Unix seconds), top to bottom. */
  filterCommits(
    path: string,
    author: string | null,
    since: number | null,
    hidden: string[],
  ): Promise<Result<number[]>>;
  /** Commits that changed `file`, newest first. */
  fileHistory(path: string, file: string): Promise<Result<CommitSummary[]>>;
  /** Who last changed each line of `file`. */
  blameFile(path: string, file: string): Promise<Result<BlameLine[]>>;
  commitDetails(path: string, id: string): Promise<Result<CommitDetailsDto>>;
  commitFileDiff(
    path: string,
    id: string,
    file: string,
    ignoreWhitespace?: boolean,
  ): Promise<Result<FileDiff>>;
  workingTreeStatus(path: string): Promise<Result<WorkingTreeStatus>>;
  /** With `ignoreWhitespace`, changes in spacing alone are left out. */
  fileDiff(
    path: string,
    file: string,
    side: DiffSide,
    ignoreWhitespace?: boolean,
  ): Promise<Result<FileDiff>>;
  stageFiles(path: string, files: string[]): Promise<Result<null>>;
  unstageFiles(path: string, files: string[]): Promise<Result<null>>;
  /** Throws away unstaged changes; untracked files are deleted. */
  discardFiles(path: string, files: string[]): Promise<Result<null>>;
  applyHunk(path: string, hunk: HunkTarget, action: HunkAction): Promise<Result<null>>;
  /** Resolves to the new commit id. */
  commitChanges(
    path: string,
    message: string,
    amend: boolean,
    skipHooks: boolean,
  ): Promise<Result<string>>;
  /** The repository's commit message template (`commit.template`), without `#` lines. */
  commitTemplate(path: string): Promise<Result<string | null>>;
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
  /** Connected code review servers. */
  listHosting(): Promise<Result<HostingAccess[]>>;
  /** Checks the token against the server, then keeps it in the credential helper. */
  connectHosting(server: string, kind: HostingKind, token: string): Promise<Result<HostingAccess>>;
  /** Connects a GitLab server with the git sign-in (personal number and password), no token. */
  connectHostingWithLogin(server: string): Promise<Result<HostingAccess>>;
  disconnectHosting(server: string): Promise<Result<null>>;
  /** The repository's project on a code review server, if a remote points to one. */
  hostingStatus(path: string): Promise<Result<HostingStatus | null>>;
  listPullRequests(path: string): Promise<Result<PullRequest[]>>;
  /** The newest CI pipeline of each recently built commit. */
  listPipelines(path: string): Promise<Result<Pipeline[]>>;
  /** Description, approvals and comments of request `number`. */
  pullRequestReview(path: string, number: number): Promise<Result<PullRequestReview>>;
  commentPullRequest(path: string, number: number, body: string): Promise<Result<null>>;
  approvePullRequest(path: string, number: number): Promise<Result<null>>;
  /** Merges the request on the server. */
  mergePullRequest(path: string, number: number): Promise<Result<null>>;
  /** Where HEAD pointed recently; commits no branch or tag contains are `lost`. */
  reflog(path: string): Promise<Result<ReflogEntry[]>>;
  /** What `head` changes since it forked from `base` (branches, tags or ids). */
  compareRefs(path: string, base: string, head: string): Promise<Result<Comparison>>;
  /** How `file` differs between commits `from` and `to`. */
  compareFileDiff(
    path: string,
    from: string,
    to: string,
    file: string,
    ignoreWhitespace?: boolean,
  ): Promise<Result<FileDiff>>;
  listIssues(path: string): Promise<Result<Issue[]>>;
  createPullRequest(
    path: string,
    source: string,
    target: string,
    title: string,
  ): Promise<Result<PullRequest>>;
  /** Who commits in the repository, or `null` when git does not know yet. */
  getIdentity(path: string): Promise<Result<Identity | null>>;
  /** Writes who commits (and how commits are signed) into the repository's config. */
  setIdentity(path: string, identity: Identity): Promise<Result<null>>;
  /** Newest first. */
  listStashes(path: string): Promise<Result<Stash[]>>;
  /** Stashes changes; only `files` when given. */
  saveStash(
    path: string,
    message: string | null,
    includeUntracked: boolean,
    files?: string[],
  ): Promise<Result<null>>;
  /** The files a stash entry changes. */
  stashFiles(path: string, index: number): Promise<Result<string[]>>;
  /** Puts one file's stashed version in the work tree; the stash stays. */
  applyStashFile(path: string, index: number, file: string): Promise<Result<null>>;
  renameStash(path: string, index: number, message: string): Promise<Result<null>>;
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
  /** Moves local branch `target` forward to `source` without a merge commit. */
  fastForwardBranch(path: string, target: string, source: string): Promise<Result<null>>;
  /** Makes `branch` track `upstream` (e.g. `origin/main`), or nothing when `null`. */
  setUpstream(path: string, branch: string, upstream: string | null): Promise<Result<null>>;
  /** Cherry-picks `commits` (oldest first) as one sequence. */
  cherryPickMany(path: string, commits: string[]): Promise<Result<null>>;
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
  /** What Redo would do again, e.g. "Merge topic". */
  pendingRedo(path: string): Promise<Result<string | null>>;
  /** Resolves to what was redone. */
  redo(path: string): Promise<Result<string>>;
  /** Shows the native folder picker; resolves to `null` if the user cancels. */
  pickFolder(title: string): Promise<string | null>;
  /** Starts `<kind>/<name>` from develop (or main for a hotfix) and checks it out. */
  gitflowStart(path: string, kind: FlowKind, name: string): Promise<Result<string>>;
  /** Merges a flow branch where git flow says, tags releases and hotfixes, deletes it. */
  gitflowFinish(path: string, branch: string): Promise<Result<FlowFinished>>;
  /** The git commands Git Panther ran, newest first; only in `path` when given. */
  activityLog(path: string | null): Promise<Result<GitActivity[]>>;
  /** Starts a bisect between a bad and a good revision; checks out the first to test. */
  bisectStart(path: string, bad: string, good: string): Promise<Result<BisectStatus>>;
  /** Records a verdict on the checked-out commit and checks out the next. */
  bisectMark(path: string, verdict: BisectVerdict): Promise<Result<BisectStatus>>;
  bisectStatus(path: string): Promise<Result<BisectStatus>>;
  /** Ends the bisect and returns to where it started. */
  bisectReset(path: string): Promise<Result<null>>;
  /** Ignores `file` and stops tracking it, keeping it on disk. */
  ignoreAndUntrack(path: string, file: string): Promise<Result<null>>;
  /** Brings back `file` as it was in commit `id`, staged. */
  restoreFileFrom(path: string, id: string, file: string): Promise<Result<null>>;
  /** Adds `pattern` as a line of the repository's `.gitignore`. */
  ignorePath(path: string, pattern: string): Promise<Result<null>>;
  /** Opens the repository in the file manager, a terminal or `editor` (e.g. `code`). */
  openIn(path: string, target: OpenTarget, editor: string): Promise<Result<null>>;
  /** Asks for a .patch or .diff file. */
  pickPatchFile(title: string): Promise<string | null>;
  /** Commit `id` as a mail-style patch, as `git format-patch` writes it. */
  commitPatch(path: string, id: string): Promise<Result<string>>;
  /** Applies a patch's text to the work tree and index (3-way where it is off). */
  applyPatch(path: string, contents: string): Promise<Result<null>>;
  applyPatchFile(path: string, file: string): Promise<Result<null>>;
}
