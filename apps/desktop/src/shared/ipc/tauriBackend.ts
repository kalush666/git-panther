import { Channel } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import type { Backend, OnProgress } from './backend';
import { commands, events, type CloneProgressDto_Deserialize } from './bindings';

function progressChannel(onProgress: OnProgress) {
  const channel = new Channel<CloneProgressDto_Deserialize>();
  channel.onmessage = ({ phase, percent }) => {
    onProgress({ phase, percent: percent ?? null });
  };
  return channel;
}

export const tauriBackend: Backend = {
  checkGitInstallation: commands.checkGitInstallation,
  openRepository: commands.openRepository,
  initRepository: commands.initRepository,
  refreshRepository: commands.refreshRepository,
  cloneRepository: ({ url, destination, jobId }, onProgress) =>
    commands.cloneRepository(url, destination, jobId, progressChannel(onProgress)),
  cancelJob: commands.cancelJob,
  listRecentRepositories: commands.listRecentRepositories,
  removeRecentRepository: commands.removeRecentRepository,
  watchRepository: commands.watchRepository,
  unwatchRepository: commands.unwatchRepository,
  loadGraphPage: commands.loadGraphPage,
  searchCommits: commands.searchCommits,
  fileHistory: commands.fileHistory,
  blameFile: commands.blameFile,
  commitDetails: commands.commitDetails,
  commitFileDiff: (path, id, file, ignoreWhitespace) =>
    commands.commitFileDiff(path, id, file, ignoreWhitespace ?? false),
  workingTreeStatus: commands.workingTreeStatus,
  fileDiff: (path, file, side, ignoreWhitespace) =>
    commands.fileDiff(path, file, side, ignoreWhitespace ?? false),
  stageFiles: commands.stageFiles,
  unstageFiles: commands.unstageFiles,
  discardFiles: commands.discardFiles,
  applyHunk: (path, { file, index, header, lines }, action) =>
    commands.applyHunk(path, file, index, header, lines ?? null, action),
  commitChanges: commands.commitChanges,
  commitTemplate: commands.commitTemplate,
  headMessage: commands.headMessage,
  listBranches: commands.listBranches,
  createBranch: commands.createBranch,
  checkoutBranch: commands.checkoutBranch,
  renameBranch: commands.renameBranch,
  deleteBranch: commands.deleteBranch,
  listRemotes: commands.listRemotes,
  listStashes: commands.listStashes,
  saveStash: (path, message, includeUntracked, files) =>
    commands.saveStash(path, message, includeUntracked, files ?? []),
  stashFiles: commands.stashFiles,
  applyStashFile: commands.applyStashFile,
  renameStash: commands.renameStash,
  applyStash: commands.applyStash,
  dropStash: commands.dropStash,
  repositoryOperation: commands.repositoryOperation,
  resolveConflict: commands.resolveConflict,
  markResolved: commands.markResolved,
  continueOperation: commands.continueOperation,
  abortOperation: commands.abortOperation,
  checkGitExecutable: commands.checkGitExecutable,
  getSettings: commands.getSettings,
  setGitExecutable: commands.setGitExecutable,
  restartApp: commands.restartApp,
  setZoom: commands.setZoom,
  listAccounts: commands.listAccounts,
  signIn: commands.signIn,
  signOut: commands.signOut,
  mergeBranch: commands.mergeBranch,
  rebaseOnto: commands.rebaseOnto,
  cherryPick: commands.cherryPick,
  revertCommit: commands.revertCommit,
  resetToCommit: commands.resetToCommit,
  checkoutCommit: commands.checkoutCommit,
  createTag: commands.createTag,
  deleteTag: commands.deleteTag,
  pushTag: commands.pushTag,
  rebasePlan: commands.rebasePlan,
  cherryPickMany: commands.cherryPickMany,
  rebaseInteractive: commands.rebaseInteractive,
  conflictChunks: commands.conflictChunks,
  resolveConflictWith: commands.resolveConflictWith,
  pendingUndo: commands.pendingUndo,
  undo: commands.undo,
  pendingRedo: commands.pendingRedo,
  redo: commands.redo,
  pickPatchFile: async (title) => {
    const selection = await open({
      directory: false,
      multiple: false,
      title,
      filters: [{ name: 'Patches', extensions: ['patch', 'diff'] }],
    });
    return typeof selection === 'string' ? selection : null;
  },
  commitPatch: commands.commitPatch,
  ignorePath: commands.ignorePath,
  ignoreAndUntrack: commands.ignoreAndUntrack,
  restoreFileFrom: commands.restoreFileFrom,
  activityLog: async (path) => ({ status: 'ok', data: await commands.activityLog(path) }),
  bisectStart: commands.bisectStart,
  bisectMark: commands.bisectMark,
  bisectStatus: commands.bisectStatus,
  bisectReset: commands.bisectReset,
  openIn: commands.openIn,
  gitflowStart: commands.gitflowStart,
  gitflowFinish: commands.gitflowFinish,
  applyPatch: commands.applyPatch,
  applyPatchFile: commands.applyPatchFile,
  pickExecutable: async (title) => {
    const windows = navigator.userAgent.includes('Windows');
    const selection = await open({
      directory: false,
      multiple: false,
      title,
      filters: windows ? [{ name: 'Programs', extensions: ['exe'] }] : [],
    });
    return typeof selection === 'string' ? selection : null;
  },
  fetchRemotes: (path, jobId, onProgress) =>
    commands.fetchRemotes(path, jobId, progressChannel(onProgress)),
  pullBranch: (path, strategy, jobId, onProgress) =>
    commands.pullBranch(path, strategy, jobId, progressChannel(onProgress)),
  pushBranch: (path, { remote, forceWithLease, source, target }, jobId, onProgress) =>
    commands.pushBranch(
      path,
      remote ?? null,
      forceWithLease ?? false,
      source ?? null,
      target ?? null,
      jobId,
      progressChannel(onProgress),
    ),
  fastForwardBranch: commands.fastForwardBranch,
  setUpstream: commands.setUpstream,
  addRemote: commands.addRemote,
  setRemoteUrl: commands.setRemoteUrl,
  removeRemote: commands.removeRemote,
  deleteRemoteBranch: commands.deleteRemoteBranch,
  listSubmodules: commands.listSubmodules,
  updateSubmodules: (path, jobId, onProgress) =>
    commands.updateSubmodules(path, jobId, progressChannel(onProgress)),
  listWorktrees: commands.listWorktrees,
  addWorktree: commands.addWorktree,
  removeWorktree: commands.removeWorktree,
  lfsStatus: commands.lfsStatus,
  listHosting: commands.listHosting,
  connectHosting: commands.connectHosting,
  connectHostingWithLogin: commands.connectHostingWithLogin,
  disconnectHosting: commands.disconnectHosting,
  hostingStatus: commands.hostingStatus,
  listPipelines: commands.listPipelines,
  pullRequestReview: commands.pullRequestReview,
  commentPullRequest: commands.commentPullRequest,
  approvePullRequest: commands.approvePullRequest,
  mergePullRequest: commands.mergePullRequest,
  compareRefs: commands.compareRefs,
  reflog: commands.reflog,
  mergeConflicts: commands.mergeConflicts,
  filterCommits: commands.filterCommits,
  compareFileDiff: (path, from, to, file, ignoreWhitespace) =>
    commands.compareFileDiff(path, from, to, file, ignoreWhitespace ?? false),
  listPullRequests: commands.listPullRequests,
  listIssues: commands.listIssues,
  createPullRequest: commands.createPullRequest,
  getIdentity: commands.getIdentity,
  setIdentity: commands.setIdentity,
  onRepositoryChanged: (listener) =>
    events.repositoryChanged.listen((event) => {
      listener(event.payload.path);
    }),
  pickFolder: async (title) => {
    const selection = await open({ directory: true, multiple: false, title });
    return typeof selection === 'string' ? selection : null;
  },
};
