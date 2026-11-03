import type { Backend, CloneProgress, Result } from './backend';
import type { GitInstallationDto, RecentRepositoryDto, RepositorySummaryDto } from './bindings';
import { createMockBranches } from './mockBranches';
import { mockCommitDetails, mockGraphPage } from './mockGraph';
import { createMockWorkingTree } from './mockWorkingTree';

/** Folder the mock folder picker "selects". */
export const MOCK_PICKED_FOLDER = 'C:\\repos\\demo';
const NOT_A_REPO_MARKER = 'not-a-repo';
const CLONE_STEP_MS = 150;
const CLONE_STEPS: readonly CloneProgress[] = [
  { phase: 'Counting objects', percent: 100 },
  { phase: 'Receiving objects', percent: 40 },
  { phase: 'Receiving objects', percent: 100 },
  { phase: 'Resolving deltas', percent: 100 },
];

function ok<T>(data: T): Result<T> {
  return { status: 'ok', data };
}

function nameOf(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function summary(path: string): RepositorySummaryDto {
  return { path, name: nameOf(path), head: { kind: 'branch', name: 'main' } };
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
    refreshRepository: (path) => Promise.resolve(ok(repositories.get(path) ?? summary(path))),
    cloneRepository: async ({ destination, jobId }, onProgress) => {
      for (const step of CLONE_STEPS) {
        await delay(CLONE_STEP_MS);
        if (cancelledJobs.delete(jobId)) {
          return {
            status: 'error',
            error: { kind: 'cancelled', message: 'The operation was cancelled.' },
          };
        }
        onProgress(step);
      }
      return remember(summary(destination));
    },
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
    pickFolder: () => Promise.resolve(MOCK_PICKED_FOLDER),
  };
}

export const mockBackend = createMockBackend();
