import { useQuery } from '@tanstack/react-query';
import { Check, SkipForward, X } from 'lucide-react';

import { ipc, unwrap, type BisectStatus } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import type { useBisect } from '../api/useBisect';
import { repositoryQueryKey } from '../api/useRepository';
import styles from './BisectBar.module.css';

/**
 * Shown while a bisect runs: the commit to test with Good / Bad / Skip, and
 * the answer once found.
 */
export function BisectBar({
  path,
  bisect,
}: {
  path: string;
  bisect: ReturnType<typeof useBisect>;
}) {
  const { status, step } = bisect;
  const shown = status?.firstBad ?? status?.testing ?? null;
  const summary = useCommitSummary(path, shown);
  if (!status?.active) return null;
  const error = step.error?.message ?? null;

  if (status.firstBad) {
    return (
      <div className={styles.bar} data-found role="status" aria-label="Bisect">
        <span className={styles.text}>
          First bad commit: <span className={styles.sha}>{status.firstBad.slice(0, 7)}</span>{' '}
          {summary}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(status.firstBad ?? '').catch(() => undefined);
          }}
        >
          Copy id
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={step.isPending}
          onClick={() => {
            step.mutate({ kind: 'reset' });
          }}
        >
          Done
        </Button>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.bar} role="group" aria-label="Bisect">
      <span className={styles.text}>
        Bisect: test <span className={styles.sha}>{status.testing?.slice(0, 7)}</span> {summary}{' '}
        <span className={styles.muted}>{stepsLeft(status)}</span>
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={step.isPending}
        onClick={() => {
          step.mutate({ kind: 'mark', verdict: 'good' });
        }}
      >
        <Check size={14} aria-hidden />
        Good
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled={step.isPending}
        onClick={() => {
          step.mutate({ kind: 'mark', verdict: 'bad' });
        }}
      >
        <X size={14} aria-hidden />
        Bad
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={step.isPending}
        title="This commit cannot be tested; try a neighbour"
        onClick={() => {
          step.mutate({ kind: 'mark', verdict: 'skip' });
        }}
      >
        <SkipForward size={14} aria-hidden />
        Skip
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={step.isPending}
        onClick={() => {
          step.mutate({ kind: 'reset' });
        }}
      >
        Stop
      </Button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

/** "about 3 steps left", from git's estimate. */
function stepsLeft(status: BisectStatus): string {
  if (status.stepsLeft == null) return '';
  return status.stepsLeft === 0
    ? '— last step'
    : `— about ${String(status.stepsLeft)} ${status.stepsLeft === 1 ? 'step' : 'steps'} left`;
}

function useCommitSummary(path: string, id: string | null): string {
  const details = useQuery({
    queryKey: [...repositoryQueryKey(path), 'commit', id],
    queryFn: async () => unwrap(await ipc.commitDetails(path, id ?? '')),
    enabled: id !== null,
  });
  return details.data?.message.split('\n')[0] ?? '';
}
