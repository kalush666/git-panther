import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ipc, unwrap, type FlowKind } from '../../../shared/ipc';
import { InlinePrompt } from '../../../shared/ui/InlinePrompt/InlinePrompt';
import { repositoryQueryKey } from '../api/useRepository';
import type { Report } from './useBranchActions';

export const FLOW_KINDS: readonly FlowKind[] = ['feature', 'release', 'hotfix'];

/** What a flow kind starts from, and an example name. */
const FLOW: Record<FlowKind, { base: string; example: string }> = {
  feature: { base: 'develop', example: 'login-form' },
  release: { base: 'develop', example: '1.4.0' },
  hotfix: { base: 'main', example: '1.3.1' },
};

/** The flow kind of `branch`, e.g. `release` for `release/1.4.0`. */
export function flowKindOf(branch: string): FlowKind | null {
  const kind = FLOW_KINDS.find((candidate) => branch.startsWith(`${candidate}/`));
  return kind !== undefined && branch.length > kind.length + 1 ? kind : null;
}

/** What finishing `branch` will do, in a sentence. */
function finishPlan(branch: string, kind: FlowKind): string {
  const name = branch.slice(kind.length + 1);
  return kind === 'feature'
    ? `Finish ${branch}: merge it into develop, then delete it`
    : `Finish ${branch}: merge it into main (tagged ${name}) and develop, then delete it`;
}

type Prompt =
  { kind: 'start'; flow: FlowKind } | { kind: 'finish'; branch: string; flow: FlowKind };

export interface GitflowActions {
  openStart: (kind: FlowKind) => void;
  /** Asks to confirm in the bar, saying what will be merged and tagged. */
  openFinish: (branch: string) => void;
  prompt: ReactNode;
}

/** Git flow: start feature, release and hotfix branches, and finish them. */
export function useGitflowActions(path: string, report: Report): GitflowActions {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: repositoryQueryKey(path) });
  const start = useMutation({
    mutationFn: async ({ flow, name }: { flow: FlowKind; name: string }) =>
      unwrap(await ipc.gitflowStart(path, flow, name)),
    onSettled: refresh,
  });
  const finish = useMutation({
    mutationFn: async (branch: string) => unwrap(await ipc.gitflowFinish(path, branch)),
    onSettled: refresh,
  });
  const close = () => {
    setPrompt(null);
    start.reset();
    finish.reset();
  };

  const bar = (() => {
    switch (prompt?.kind) {
      case undefined:
        return null;
      case 'start':
        return (
          <InlinePrompt
            key={`start:${prompt.flow}`}
            title={`Start a ${prompt.flow} from ${FLOW[prompt.flow].base}`}
            fields={[{ label: 'Name', initial: '', placeholder: FLOW[prompt.flow].example }]}
            submitLabel={`Start ${prompt.flow}`}
            error={start.error?.message ?? null}
            isPending={start.isPending}
            onCancel={close}
            onSubmit={([name = '']) => {
              start.mutate(
                { flow: prompt.flow, name },
                {
                  onSuccess: (branch) => {
                    report('done', `Started ${branch} from ${FLOW[prompt.flow].base}`);
                    close();
                  },
                },
              );
            }}
          />
        );
      case 'finish':
        return (
          <InlinePrompt
            key={`finish:${prompt.branch}`}
            title={finishPlan(prompt.branch, prompt.flow)}
            submitLabel="Finish"
            error={finish.error?.message ?? null}
            isPending={finish.isPending}
            onCancel={close}
            onSubmit={() => {
              finish.mutate(prompt.branch, {
                onSuccess: (done) => {
                  const tag = done.tag ? `, tagged ${done.tag}` : '';
                  report(
                    'done',
                    `Finished ${prompt.branch}: merged into ${done.mergedInto.join(' and ')}${tag}`,
                  );
                  close();
                },
              });
            }}
          />
        );
    }
  })();

  return {
    openStart: (flow) => {
      start.reset();
      setPrompt({ kind: 'start', flow });
    },
    openFinish: (branch) => {
      const flow = flowKindOf(branch);
      if (!flow) return;
      finish.reset();
      setPrompt({ kind: 'finish', branch, flow });
    },
    prompt: bar,
  };
}
