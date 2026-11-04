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
  commitDetails: commands.commitDetails,
  commitFileDiff: commands.commitFileDiff,
  workingTreeStatus: commands.workingTreeStatus,
  fileDiff: commands.fileDiff,
  stageFiles: commands.stageFiles,
  unstageFiles: commands.unstageFiles,
  discardFiles: commands.discardFiles,
  applyHunk: (path, { file, index, header }, action) =>
    commands.applyHunk(path, file, index, header, action),
  commitChanges: commands.commitChanges,
  headMessage: commands.headMessage,
  listBranches: commands.listBranches,
  createBranch: commands.createBranch,
  checkoutBranch: commands.checkoutBranch,
  renameBranch: commands.renameBranch,
  deleteBranch: commands.deleteBranch,
  listRemotes: commands.listRemotes,
  listStashes: commands.listStashes,
  saveStash: commands.saveStash,
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
  pushBranch: (path, jobId, onProgress) =>
    commands.pushBranch(path, jobId, progressChannel(onProgress)),
  onRepositoryChanged: (listener) =>
    events.repositoryChanged.listen((event) => {
      listener(event.payload.path);
    }),
  pickFolder: async (title) => {
    const selection = await open({ directory: true, multiple: false, title });
    return typeof selection === 'string' ? selection : null;
  },
};
