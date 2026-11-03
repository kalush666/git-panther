import { Channel } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import type { Backend } from './backend';
import { commands, events, type CloneProgressDto_Deserialize } from './bindings';

export const tauriBackend: Backend = {
  checkGitInstallation: commands.checkGitInstallation,
  openRepository: commands.openRepository,
  initRepository: commands.initRepository,
  refreshRepository: commands.refreshRepository,
  cloneRepository: ({ url, destination, jobId }, onProgress) => {
    const channel = new Channel<CloneProgressDto_Deserialize>();
    channel.onmessage = ({ phase, percent }) => {
      onProgress({ phase, percent: percent ?? null });
    };
    return commands.cloneRepository(url, destination, jobId, channel);
  },
  cancelJob: commands.cancelJob,
  listRecentRepositories: commands.listRecentRepositories,
  removeRecentRepository: commands.removeRecentRepository,
  watchRepository: commands.watchRepository,
  unwatchRepository: commands.unwatchRepository,
  loadGraphPage: commands.loadGraphPage,
  commitDetails: commands.commitDetails,
  onRepositoryChanged: (listener) =>
    events.repositoryChanged.listen((event) => {
      listener(event.payload.path);
    }),
  pickFolder: async (title) => {
    const selection = await open({ directory: true, multiple: false, title });
    return typeof selection === 'string' ? selection : null;
  },
};
