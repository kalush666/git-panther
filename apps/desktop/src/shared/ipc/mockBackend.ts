import type { Backend, CloneProgress, OnProgress, Result } from './backend';
import type { GitInstallationDto, RecentRepositoryDto, RepositorySummaryDto } from './bindings';
import { createMockBranches } from './mockBranches';
import { createMockStashes } from './mockStashes';
import { mockCommitDetails, mockGraphPage } from './mockGraph';
import { createMockWorkingTree } from './mockWorkingTree';

/** Folder the mock folder picker "selects". */
export const MOCK_PICKED_FOLDER = 'C:\\repos\\demo';
/** Program the mock file picker "selects". */
export const MOCK_PICKED_GIT = 'C:\\Program Files\\Git\\cmd\\git.exe';
/** A path the mock treats as an old, unsupported git. */
const OLD_GIT_MARKER = 'old-git';
const NOT_A_REPO_MARKER = 'not-a-repo';
const JOB_STEP_MS = 150;
const CLONE_STEPS: readonly CloneProgress[] = [
  { phase: 'Counting objects', percent: 100 },
  { phase: 'Receiving objects', percent: 40 },
  { phase: 'Receiving objects', percent: 100 },
  { phase: 'Resolving deltas', percent: 100 },
];
const SYNC_STEPS: readonly CloneProgress[] = [
  { phase: 'Receiving objects', percent: 50 },
  { phase: 'Receiving objects', percent: 100 },
];
const CANCELLED: Result<never> = {
  status: 'error',
  error: { kind: 'cancelled', message: 'The operation was cancelled.' },
};

function ok<T>(data: T): Result<T> {
  return { status: 'ok', data };
}

function nameOf(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function summary(path: string): RepositorySummaryDto {
  return { path, name: nameOf(path), head: { kind: 'branch', name: 'main' } };
}

function installationAt(executable: string): GitInstallationDto {
  if (executable.includes(OLD_GIT_MARKER)) {
    return { status: 'unsupported', found: '2.30.1', minimum: '2.40.0' };
  }
  return executable.toLowerCase().includes('git')
    ? { status: 'supported', version: '2.52.0' }
    : { status: 'missing', minimum: '2.40.0' };
}

function mockGitInstallation(): GitInstallationDto {
  switch (new URLSearchParams(window.location.search).get('mockGit')) {
    case 'missing':
      return { status: 'missing', minimum: '2.40.0' };
    case 'unsupported':
      return { status: 'unsupported', found: '2.30.1', minimum: '2.40.0' };
    default:
      return { status: 'supported', version: '2.52.0' };
  }
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Browser-only stand-in for the Rust core, used for UI development and E2E
 * tests. State lives in memory for the lifetime of the page.
 */
function createMockBackend(): Backend {
  let recent: RecentRepositoryDto[] = [];
  const repositories = new Map<string, RepositorySummaryDto>();
  const cancelledJobs = new Set<string>();
  const changeListeners = new Set<(path: string) => void>();
  const workingTree = createMockWorkingTree();
  const branchStore = createMockBranches();
  const stashes = createMockStashes(workingTree);
  let gitExecutable: string | null = null;

  /** Plays `steps` as progress, then runs `finish` unless the job was cancelled. */
  const runJob = async <T>(
    jobId: string,
    steps: readonly CloneProgress[],
    onProgress: OnProgress,
    finish: () => Result<T>,
  ): Promise<Result<T>> => {
    for (const step of steps) {
      await delay(JOB_STEP_MS);
      if (cancelledJobs.delete(jobId)) return CANCELLED;
      onProgress(step);
    }
    return finish();
  };

  const remember = (repository: RepositorySummaryDto) => {
    repositories.set(repository.path, repository);
    recent = [
      { path: repository.path, name: repository.name },
      ...recent.filter((entry) => entry.path !== repository.path),
    ];
    return ok(repository);
  };

  return {
    checkGitInstallation: () => Promise.resolve(ok(mockGitInstallation())),
    openRepository: (path) =>
      Promise.resolve(
        path.includes(NOT_A_REPO_MARKER)
          ? {
              status: 'error',
              error: { kind: 'notARepository', message: `${path} is not a git repository.` },
            }
          : remember(summary(path)),
      ),
    initRepository: (path) =>
      Promise.resolve(remember({ ...summary(path), head: { kind: 'unborn', name: 'main' } })),
    refreshRepository: (path) => {
      const repository = repositories.get(path) ?? summary(path);
      // Follow checkouts made through the mock branch store.
      return Promise.resolve(
        ok(
          repository.head.kind === 'branch'
            ? { ...repository, head: { kind: 'branch', name: branchStore.headName() } }
            : repository,
        ),
      );
    },
    cloneRepository: ({ destination, jobId }, onProgress) =>
      runJob(jobId, CLONE_STEPS, onProgress, () => remember(summary(destination))),
    cancelJob: (jobId) => {
      cancelledJobs.add(jobId);
      return Promise.resolve(ok(null));
    },
    listRecentRepositories: () => Promise.resolve(ok(recent)),
    removeRecentRepository: (path) => {
      recent = recent.filter((entry) => entry.path !== path);
      return Promise.resolve(ok(null));
    },
    watchRepository: () => Promise.resolve(ok(null)),
    unwatchRepository: () => Promise.resolve(ok(null)),
    onRepositoryChanged: (listener) => {
      changeListeners.add(listener);
      return Promise.resolve(() => {
        changeListeners.delete(listener);
      });
    },
    loadGraphPage: (_path, offset, limit) => Promise.resolve(ok(mockGraphPage(offset, limit))),
    commitDetails: (_path, id) => {
      const details = mockCommitDetails(id);
      return Promise.resolve(
        details
          ? ok(details)
          : {
              status: 'error',
              error: { kind: 'commitNotFound', message: `Commit ${id} does not exist.` },
            },
      );
    },
    commitFileDiff: (_path, _id, file) => Promise.resolve(workingTree.diff(file, 'unstaged')),
    workingTreeStatus: () => Promise.resolve(workingTree.status()),
    fileDiff: (_path, file, side) => Promise.resolve(workingTree.diff(file, side)),
    stageFiles: (_path, files) => Promise.resolve(workingTree.stage(files)),
    unstageFiles: (_path, files) => Promise.resolve(workingTree.unstage(files)),
    discardFiles: (_path, files) => Promise.resolve(workingTree.discard(files)),
    applyHunk: (_path, hunk, action) => Promise.resolve(workingTree.applyHunk(hunk, action)),
    commitChanges: (_path, message, amend) => Promise.resolve(workingTree.commit(message, amend)),
    headMessage: () => Promise.resolve(workingTree.headMessage()),
    listBranches: () => Promise.resolve(branchStore.list()),
    createBranch: (_path, name, start, checkout) =>
      Promise.resolve(branchStore.create(name, start, checkout)),
    checkoutBranch: (_path, name) => Promise.resolve(branchStore.checkout(name)),
    renameBranch: (_path, from, to) => Promise.resolve(branchStore.rename(from, to)),
    deleteBranch: (_path, name, force) => Promise.resolve(branchStore.delete(name, force)),
    listRemotes: () =>
      Promise.resolve(ok([{ name: 'origin', url: 'git@git.example.internal:team/demo.git' }])),
    fetchRemotes: (_path, jobId, onProgress) =>
      runJob(jobId, SYNC_STEPS, onProgress, () => branchStore.fetch()),
    pullBranch: (_path, strategy, jobId, onProgress) =>
      runJob(jobId, SYNC_STEPS, onProgress, () => branchStore.pull(strategy)),
    pushBranch: (_path, jobId, onProgress) =>
      runJob(jobId, SYNC_STEPS, onProgress, () => branchStore.push()),
    listStashes: () => Promise.resolve(stashes.list()),
    saveStash: (_path, message, includeUntracked) =>
      Promise.resolve(stashes.save(message, includeUntracked, branchStore.headName())),
    applyStash: (_path, index, pop) => Promise.resolve(stashes.apply(index, pop)),
    dropStash: (_path, index) => Promise.resolve(stashes.drop(index)),
    repositoryOperation: () => Promise.resolve(workingTree.operation()),
    resolveConflict: (_path, file) => Promise.resolve(workingTree.resolve([file])),
    markResolved: (_path, files) => Promise.resolve(workingTree.resolve(files)),
    continueOperation: () => Promise.resolve(workingTree.continueOperation()),
    abortOperation: () => Promise.resolve(workingTree.abortOperation()),
    checkGitExecutable: (executable) => Promise.resolve(ok(installationAt(executable ?? 'git'))),
    getSettings: () => Promise.resolve(ok({ gitExecutable, activeGitExecutable: 'git' })),
    setGitExecutable: (executable) => {
      const candidate = executable?.trim() ? executable.trim() : null;
      if (installationAt(candidate ?? 'git').status !== 'supported') {
        return Promise.resolve({
          status: 'error',
          error: {
            kind: 'invalidGitExecutable',
            message: `${candidate ?? 'git'} cannot be used as git: it is missing or older than 2.40.0.`,
          },
        });
      }
      gitExecutable = candidate;
      return Promise.resolve(ok({ gitExecutable, activeGitExecutable: 'git' }));
    },
    restartApp: () => {
      window.location.reload();
      return Promise.resolve();
    },
    setZoom: (scale) => {
      document.documentElement.style.setProperty('zoom', String(scale));
      return Promise.resolve(ok(null));
    },
    pickExecutable: () => Promise.resolve(MOCK_PICKED_GIT),
    pickFolder: () => Promise.resolve(MOCK_PICKED_FOLDER),
  };
}

export const mockBackend = createMockBackend();
