import type {
  Account,
  Backend,
  CloneProgress,
  HostingAccess,
  PullRequestReview,
  Identity,
  Issue,
  OnProgress,
  PullRequest,
  Remote,
  Result,
  Submodule,
  Worktree,
} from './backend';
import type {
  AppErrorKind,
  GitInstallationDto,
  RecentRepositoryDto,
  RepositorySummaryDto,
} from './bindings';
import { createMockBisect } from './mockBisect';
import { createMockBranches } from './mockBranches';
import { createMockHistory } from './mockHistory';
import { createMockStashes } from './mockStashes';
import {
  mockBlame,
  mockCommitDetails,
  mockFileHistory,
  mockGraphPage,
  mockFilter,
  mockSearch,
} from './mockGraph';
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

function failure(kind: AppErrorKind, message: string): Result<never> {
  return { status: 'error', error: { kind, message } };
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

/** The password the mock rejects, to show what a failed sign-in looks like. */
const WRONG_PASSWORD = 'wrong';

/** `?mockSync=auth` makes network operations need a sign-in first. */
/** Built at runtime so the bundle holds no literal external URL (closed-network check). */
const MOCK_GIT_HOST = ['git', 'example', 'internal'].join('.');
/** The file the mock's patch picker always picks. */
const MOCK_PICKED_PATCH = 'C:\\patches\\fix-login.patch';
/** A commit only the reflog still knows, after a hard reset. */
const MOCK_LOST_COMMIT = 'dead0beef'.padEnd(40, '0');

const needsSignIn = () => new URLSearchParams(window.location.search).get('mockSync') === 'auth';

const AUTHENTICATION_FAILED: Result<never> = {
  status: 'error',
  error: {
    kind: 'authenticationFailed',
    message:
      'Authentication failed. Git Panther uses your git credentials. (fatal: Authentication failed for git.example.internal)',
  },
};

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
  const history = createMockHistory(branchStore, workingTree);
  const bisect = createMockBisect();
  let gitExecutable: string | null = null;
  let accounts: Account[] = [];
  let hosting: HostingAccess[] = [];
  let pullRequests: PullRequest[] = [
    {
      number: 7,
      title: 'Add the login form',
      author: 'Ada Byron',
      sourceBranch: 'develop',
      targetBranch: 'main',
      url: `https://${MOCK_GIT_HOST}/team/demo/-/merge_requests/7`,
      draft: false,
    },
  ];
  const issues: Issue[] = [
    {
      number: 3,
      title: 'Graph flickers when scrolling fast',
      author: 'Grace Hopper',
      url: `https://${MOCK_GIT_HOST}/team/demo/-/issues/3`,
      labels: ['bug'],
    },
  ];
  const reviews = new Map<number, PullRequestReview>([
    [
      7,
      {
        description: 'Adds the login form with personal number and password.',
        approvedBy: [],
        comments: [
          {
            author: 'Grace Hopper',
            body: 'Please keep the password out of the logs.',
            createdAt: '2026-10-01T09:30:00Z',
            file: 'src/login.ts',
            line: 12,
          },
        ],
        mergeable: true,
      },
    ],
  ]);
  const reviewOf = (number: number): PullRequestReview =>
    reviews.get(number) ?? { description: '', approvedBy: [], comments: [], mergeable: true };
  const mockServer = `https://${MOCK_GIT_HOST}`;
  const connected = () => hosting.some((access) => access.server === mockServer);
  const notConnected = () =>
    failure('hostingNotConnected', `Connect ${mockServer} to see its merge requests and issues.`);
  let identity: Identity | null = {
    name: 'Git Panther Demo',
    email: 'demo@example.internal',
    signing: null,
  };
  let remotes: Remote[] = [
    {
      name: 'origin',
      url: needsSignIn()
        ? `https://${MOCK_GIT_HOST}/team/demo.git`
        : 'git@git.example.internal:team/demo.git',
    },
  ];
  let submodules: Submodule[] = [
    { path: 'libs/design-tokens', commit: 'd'.repeat(40), state: 'current' },
    { path: 'vendor/zlib', commit: 'e'.repeat(40), state: 'notInitialized' },
  ];
  let worktrees: Worktree[] = [{ path: MOCK_PICKED_FOLDER, branch: 'main', isMain: true }];
  const signedIn = () => !needsSignIn() || accounts.length > 0;

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
      signedIn()
        ? runJob(jobId, CLONE_STEPS, onProgress, () => remember(summary(destination)))
        : Promise.resolve(AUTHENTICATION_FAILED),
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
    searchCommits: (_path, query) => Promise.resolve(ok(mockSearch(query))),
    filterCommits: (_path, author, since) => Promise.resolve(ok(mockFilter(author, since))),
    fileHistory: () => Promise.resolve(ok(mockFileHistory())),
    blameFile: (_path, file) => Promise.resolve(ok(mockBlame(file))),
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
    // `?mockTemplate=1`: the repository has a commit template.
    commitTemplate: () =>
      Promise.resolve(
        ok(
          new URLSearchParams(window.location.search).get('mockTemplate')
            ? '[TICKET-] \n\nWhy:'
            : null,
        ),
      ),
    headMessage: () => Promise.resolve(workingTree.headMessage()),
    listBranches: () => Promise.resolve(branchStore.list()),
    createBranch: (_path, name, start, checkout) =>
      Promise.resolve(branchStore.create(name, start, checkout)),
    checkoutBranch: (_path, name) => {
      // `?mockCheckout=conflict`: uncommitted changes block switching until stashed.
      const status = workingTree.status();
      const blocked =
        new URLSearchParams(window.location.search).get('mockCheckout') === 'conflict' &&
        status.status === 'ok' &&
        status.data.unstaged.length > 0;
      if (blocked) {
        return Promise.resolve(
          failure(
            'checkoutConflict',
            'Your uncommitted changes would be overwritten. Commit or stash them first.\nerror: Your local changes to the following files would be overwritten by checkout:\n\tsrc/app.ts',
          ),
        );
      }
      return Promise.resolve(history.trackCheckout(() => branchStore.checkout(name), name));
    },
    renameBranch: (_path, from, to) => Promise.resolve(branchStore.rename(from, to)),
    deleteBranch: (_path, name, force) =>
      Promise.resolve(history.trackDelete(() => branchStore.delete(name, force), name)),
    listRemotes: () => Promise.resolve(ok(remotes)),
    addRemote: (_path, name, url) => {
      if (remotes.some((remote) => remote.name === name)) {
        return Promise.resolve(failure('remoteExists', `A remote named "${name}" already exists.`));
      }
      remotes = [...remotes, { name, url }];
      return Promise.resolve(ok(null));
    },
    setRemoteUrl: (_path, name, url) => {
      remotes = remotes.map((remote) => (remote.name === name ? { name, url } : remote));
      return Promise.resolve(ok(null));
    },
    removeRemote: (_path, name) => {
      remotes = remotes.filter((remote) => remote.name !== name);
      return Promise.resolve(ok(null));
    },
    deleteRemoteBranch: (_path, branch) => Promise.resolve(branchStore.deleteRemote(branch)),
    listSubmodules: () => Promise.resolve(ok(submodules)),
    updateSubmodules: (_path, jobId, onProgress) =>
      runJob(jobId, SYNC_STEPS, onProgress, () => {
        submodules = submodules.map((submodule) => ({ ...submodule, state: 'current' }));
        return ok(null);
      }),
    listWorktrees: () => Promise.resolve(ok(worktrees)),
    addWorktree: (path, branch) => {
      const worktree = `${path}-${branch.replace(/[^\w.]/g, '-')}`;
      worktrees = [...worktrees, { path: worktree, branch, isMain: false }];
      return Promise.resolve(ok(worktree));
    },
    removeWorktree: (_path, worktree) => {
      worktrees = worktrees.filter((candidate) => candidate.path !== worktree);
      return Promise.resolve(ok(null));
    },
    lfsStatus: () =>
      Promise.resolve(
        ok({
          used: new URLSearchParams(window.location.search).get('mockLfs') === 'missing',
          installed: false,
        }),
      ),
    fetchRemotes: (_path, jobId, onProgress) =>
      runJob(jobId, SYNC_STEPS, onProgress, () =>
        signedIn() ? branchStore.fetch() : AUTHENTICATION_FAILED,
      ),
    pullBranch: (_path, strategy, jobId, onProgress) =>
      runJob(jobId, SYNC_STEPS, onProgress, () =>
        signedIn() ? branchStore.pull(strategy) : AUTHENTICATION_FAILED,
      ),
    pushBranch: (_path, options, jobId, onProgress) =>
      runJob(jobId, SYNC_STEPS, onProgress, () =>
        signedIn() ? branchStore.push(options.forceWithLease ?? false) : AUTHENTICATION_FAILED,
      ),
    listStashes: () => Promise.resolve(stashes.list()),
    saveStash: (_path, message, includeUntracked) =>
      Promise.resolve(stashes.save(message, includeUntracked, branchStore.headName())),
    applyStash: (_path, index, pop) => Promise.resolve(stashes.apply(index, pop)),
    dropStash: (_path, index) =>
      Promise.resolve(
        stashes.drop(index, (message, restore) =>
          history.remember(`Drop stash "${message}"`, restore),
        ),
      ),
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
    listHosting: () => Promise.resolve(ok(hosting)),
    connectHosting: (server, kind, token) => {
      if (token === WRONG_PASSWORD) {
        return Promise.resolve(
          failure(
            'hostingUnauthorized',
            `${server} refused the access token. Create a new one with API access and connect again.`,
          ),
        );
      }
      const access = { server: server.replace(/\/+$/, ''), kind };
      hosting = [...hosting.filter((existing) => existing.server !== access.server), access];
      return Promise.resolve(ok(access));
    },
    connectHostingWithLogin: (server) => {
      // `?mockHosting=token`: a server that only takes access tokens.
      if (new URLSearchParams(window.location.search).get('mockHosting') === 'token') {
        return Promise.resolve(
          failure(
            'hostingLoginUnsupported',
            `${server} does not let Git Panther use your sign-in for merge requests. Connect it with an access token instead.`,
          ),
        );
      }
      if (!accounts.some((account) => account.server === server)) {
        return Promise.resolve(failure('authenticationFailed', `Sign in to ${server} first.`));
      }
      const access = { server, kind: 'gitLab' as const };
      hosting = [...hosting.filter((existing) => existing.server !== server), access];
      return Promise.resolve(ok(access));
    },
    disconnectHosting: (server) => {
      hosting = hosting.filter((access) => access.server !== server);
      return Promise.resolve(ok(null));
    },
    hostingStatus: () =>
      Promise.resolve(
        ok({
          server: mockServer,
          project: 'team/demo',
          kind: hosting.find((access) => access.server === mockServer)?.kind ?? null,
        }),
      ),
    listPullRequests: () => Promise.resolve(connected() ? ok(pullRequests) : notConnected()),
    listIssues: () => Promise.resolve(connected() ? ok(issues) : notConnected()),
    listPipelines: () => {
      // The newest commits: one running, one passed, one failed.
      const states = ['running', 'passed', 'failed'] as const;
      const pipelines = mockGraphPage(0, states.length).entries.map((entry, index) => ({
        commit: entry.id,
        state: states[index] ?? 'passed',
        url: `https://${MOCK_GIT_HOST}/team/demo/-/pipelines/${String(100 - index)}`,
      }));
      return Promise.resolve(connected() ? ok(pipelines) : notConnected());
    },
    pullRequestReview: (_path, number) =>
      Promise.resolve(connected() ? ok(reviewOf(number)) : notConnected()),
    commentPullRequest: (_path, number, body) => {
      const review = reviewOf(number);
      reviews.set(number, {
        ...review,
        comments: [
          ...review.comments,
          {
            author: 'Git Panther Demo',
            body,
            createdAt: new Date().toISOString(),
            file: null,
            line: null,
          },
        ],
      });
      return Promise.resolve(ok(null));
    },
    approvePullRequest: (_path, number) => {
      const review = reviewOf(number);
      reviews.set(number, { ...review, approvedBy: [...review.approvedBy, 'Git Panther Demo'] });
      return Promise.resolve(ok(null));
    },
    mergePullRequest: (_path, number) => {
      pullRequests = pullRequests.filter((request) => request.number !== number);
      return Promise.resolve(ok(null));
    },
    reflog: () => {
      const [newest, previous] = mockGraphPage(0, 2).entries;
      const now = Math.floor(Date.now() / 1000);
      return Promise.resolve(
        ok([
          {
            id: newest?.id ?? '',
            shortId: newest?.shortId ?? '',
            summary: newest?.summary ?? '',
            action: 'reset: moving to HEAD~1',
            time: now - 60,
            lost: false,
          },
          {
            id: MOCK_LOST_COMMIT,
            shortId: MOCK_LOST_COMMIT.slice(0, 7),
            summary: 'Work in progress on the login form',
            action: 'commit: Work in progress on the login form',
            time: now - 120,
            lost: true,
          },
          {
            id: previous?.id ?? '',
            shortId: previous?.shortId ?? '',
            summary: previous?.summary ?? '',
            action: 'checkout: moving from develop to main',
            time: now - 3600,
            lost: false,
          },
        ]),
      );
    },
    compareRefs: (_path, base, head) => {
      const known = (name: string) =>
        /^[0-9a-f]{40}$/.test(name) ||
        ['main', 'develop', 'origin/main', 'origin/develop', 'HEAD'].includes(name);
      const missing = [base, head].find((name) => !known(name));
      if (missing !== undefined) {
        return Promise.resolve(failure('commitNotFound', `Commit ${missing} does not exist.`));
      }
      const commits = mockFileHistory().slice(0, 3);
      return Promise.resolve(
        ok({
          fork: mockFileHistory()[4]?.id ?? '',
          head: commits[0]?.id ?? '',
          commits,
          changes: [
            { kind: 'modified', path: 'src/app.ts' },
            { kind: 'added', path: 'src/login.ts' },
          ],
        }),
      );
    },
    compareFileDiff: (_path, _from, _to, file) =>
      Promise.resolve(workingTree.diff(file, 'unstaged')),
    createPullRequest: (_path, source, target, title) => {
      if (!connected()) return Promise.resolve(notConnected());
      const created = {
        number: 8 + pullRequests.length,
        title,
        author: 'Git Panther Demo',
        sourceBranch: source,
        targetBranch: target,
        url: `${mockServer}/team/demo/-/merge_requests/${String(8 + pullRequests.length)}`,
        draft: false,
      };
      pullRequests = [...pullRequests, created];
      return Promise.resolve(ok(created));
    },
    getIdentity: () => Promise.resolve(ok(identity)),
    setIdentity: (_path, next) => {
      if (!next.email.includes('@')) {
        return Promise.resolve(
          failure('invalidIdentity', `"${next.email}" is not an email address.`),
        );
      }
      identity = next;
      return Promise.resolve(ok(null));
    },
    listAccounts: () => Promise.resolve(ok(accounts)),
    signIn: (server, username, password) => {
      if (password === WRONG_PASSWORD) return Promise.resolve(AUTHENTICATION_FAILED);
      const host = server.replace(/^\w+:\/\//, '').split('/')[0] ?? server;
      const account = { server: `https://${host}`, username: username.trim() };
      accounts = [
        ...accounts.filter(
          (existing) =>
            existing.server !== account.server || existing.username !== account.username,
        ),
        account,
      ];
      return Promise.resolve(ok(account));
    },
    signOut: (server, username) => {
      accounts = accounts.filter(
        (existing) => existing.server !== server || existing.username !== username,
      );
      return Promise.resolve(ok(null));
    },
    mergeBranch: (_path, branch) => Promise.resolve(history.merge(branch)),
    rebaseOnto: (_path, onto) => Promise.resolve(history.rebase(onto)),
    cherryPick: (_path, commit) => Promise.resolve(history.cherryPick(commit)),
    cherryPickMany: (_path, commits) => Promise.resolve(history.cherryPickMany(commits)),
    revertCommit: (_path, commit) => Promise.resolve(history.revert(commit)),
    resetToCommit: (_path, commit) => Promise.resolve(history.reset(commit)),
    checkoutCommit: (_path, commit) => Promise.resolve(history.checkoutCommit(commit)),
    createTag: (_path, name) => Promise.resolve(history.createTag(name.trim())),
    deleteTag: (_path, name) => Promise.resolve(history.deleteTag(name)),
    pushTag: () => Promise.resolve(history.pushTag()),
    rebasePlan: () => Promise.resolve(ok(mockFileHistory().reverse())),
    rebaseInteractive: (_path, base, steps) =>
      Promise.resolve(history.rebaseInteractive(base, steps.length)),
    conflictChunks: (_path, file) =>
      Promise.resolve(
        ok([
          { kind: 'common', text: `// ${file}\nexport const speed = 1;\n` },
          {
            kind: 'conflict',
            mine: 'const name = "Panther";\n',
            base: 'const name = "Cat";\n',
            incoming: 'const name = "Git Panther";\nconst version = 2;\n',
          },
          { kind: 'common', text: 'export default name;\n' },
        ]),
      ),
    resolveConflictWith: (_path, file) => Promise.resolve(workingTree.resolve([file])),
    pendingUndo: () => Promise.resolve(history.pendingUndo()),
    undo: () => Promise.resolve(history.undo()),
    pendingRedo: () => Promise.resolve(history.pendingRedo()),
    redo: () => Promise.resolve(history.redo()),
    pickFolder: () => Promise.resolve(MOCK_PICKED_FOLDER),
    pickPatchFile: () => Promise.resolve(MOCK_PICKED_PATCH),
    ignorePath: (_path, pattern) => Promise.resolve(workingTree.ignore(pattern)),
    bisectStart: (_path, bad, good) => {
      const started = bisect.start(bad, good);
      return Promise.resolve(
        started
          ? ok(started)
          : failure('gitFailed', `${good} is not an ancestor of ${bad}, so bisect cannot start.`),
      );
    },
    bisectMark: (_path, verdict) => {
      const marked = bisect.mark(verdict);
      return Promise.resolve(
        marked ? ok(marked) : failure('gitFailed', 'You need to start by "git bisect start".'),
      );
    },
    bisectStatus: () => Promise.resolve(ok(bisect.status())),
    bisectReset: () => {
      bisect.reset();
      return Promise.resolve(ok(null));
    },
    openIn: (_path, target, editor) =>
      Promise.resolve(
        target === 'editor' && editor.trim() === 'missing-editor'
          ? failure('notFound', 'Could not start "missing-editor" (set your editor in Settings)')
          : ok(null),
      ),
    gitflowStart: (_path, kind, name) => {
      const branch = `${kind}/${name.trim()}`;
      const base = kind === 'hotfix' ? 'main' : 'develop';
      const created = branchStore.create(branch, branchStore.targetOf(base) ?? '', true);
      return Promise.resolve(created.status === 'ok' ? ok(branch) : created);
    },
    gitflowFinish: (_path, branch) => {
      const kind = branch.split('/')[0];
      if (!['feature', 'release', 'hotfix'].includes(kind ?? '')) {
        return Promise.resolve(
          failure('gitFailed', `${branch} is not a feature, release or hotfix branch.`),
        );
      }
      const tagged = kind !== 'feature';
      branchStore.checkout('develop');
      branchStore.delete(branch, true);
      return Promise.resolve(
        ok({
          mergedInto: tagged ? ['main', 'develop'] : ['develop'],
          tag: tagged ? branch.slice(branch.indexOf('/') + 1) : null,
        }),
      );
    },
    commitPatch: (_path, id) =>
      Promise.resolve(
        ok(
          `From ${id} Mon Sep 17 00:00:00 2001\nSubject: [PATCH] A mock change\n\n---\ndiff --git a/src/app.ts b/src/app.ts\n`,
        ),
      ),
    applyPatch: (_path, contents) =>
      Promise.resolve(
        contents.includes('diff --git')
          ? ok(null)
          : failure('gitFailed', 'error: No valid patches in input (allow with "--allow-empty")'),
      ),
    applyPatchFile: () => Promise.resolve(ok(null)),
  };
}

export const mockBackend = createMockBackend();
