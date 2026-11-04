import { useRef, useState } from 'react';

import { ipc, type CloneProgress, type PullStrategy, type PushOptions } from '../../../shared/ipc';
import { useRepositoryMutation } from './useRepositoryMutation';

export type SyncRequest =
  | { action: 'fetch' }
  | { action: 'pull'; strategy: PullStrategy }
  | { action: 'push'; options?: PushOptions };

export type SyncAction = SyncRequest['action'];

/** Runs one fetch, pull or push at a time with live progress and cancellation. */
export function useSync(path: string) {
  const runningJob = useRef<string | null>(null);
  const [progress, setProgress] = useState<CloneProgress | null>(null);

  const mutation = useRepositoryMutation(path, async (request: SyncRequest) => {
    const jobId = crypto.randomUUID();
    runningJob.current = jobId;
    setProgress(null);
    try {
      switch (request.action) {
        case 'fetch':
          return await ipc.fetchRemotes(path, jobId, setProgress);
        case 'pull':
          return await ipc.pullBranch(path, request.strategy, jobId, setProgress);
        case 'push':
          return await ipc.pushBranch(path, request.options ?? {}, jobId, setProgress);
      }
    } finally {
      runningJob.current = null;
    }
  });

  const cancel = () => {
    if (runningJob.current !== null) {
      void ipc.cancelJob(runningJob.current);
    }
  };

  return {
    run: mutation.mutate,
    /** Runs the last fetch, pull or push again, e.g. after signing in. */
    retry: () => {
      if (mutation.variables) mutation.mutate(mutation.variables);
    },
    cancel,
    dismiss: mutation.reset,
    progress,
    running: mutation.isPending ? mutation.variables.action : null,
    error: mutation.error,
    succeeded: mutation.isSuccess ? mutation.variables.action : null,
  };
}
