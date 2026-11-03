import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { ipc, unwrap, type CloneProgress } from '../../../shared/ipc';
import { useOpenedHandler, type OnRepositoryOpened } from './useRepositoryActions';

interface CloneInput {
  url: string;
  destination: string;
}

/** Runs one clone at a time with live progress and cancellation. */
export function useClone(onCloned: OnRepositoryOpened) {
  const runningJob = useRef<string | null>(null);
  const [progress, setProgress] = useState<CloneProgress | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ url, destination }: CloneInput) => {
      const jobId = crypto.randomUUID();
      runningJob.current = jobId;
      setProgress(null);
      try {
        return unwrap(await ipc.cloneRepository({ url, destination, jobId }, setProgress));
      } finally {
        runningJob.current = null;
      }
    },
    onSuccess: useOpenedHandler(onCloned),
  });

  const cancel = () => {
    if (runningJob.current !== null) {
      void ipc.cancelJob(runningJob.current);
    }
  };

  return {
    start: mutation.mutate,
    cancel,
    reset: mutation.reset,
    progress,
    isCloning: mutation.isPending,
    error: mutation.error,
  };
}
