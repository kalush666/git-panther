import {
  CircleCheck,
  CircleMinus,
  CircleSlash,
  CircleX,
  Clock,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';

import type { Pipeline, PipelineState } from '../../../shared/ipc';
import styles from './PipelineBadge.module.css';

const LOOK: Record<PipelineState, { icon: LucideIcon; label: string }> = {
  pending: { icon: Clock, label: 'pending' },
  running: { icon: LoaderCircle, label: 'running' },
  passed: { icon: CircleCheck, label: 'passed' },
  failed: { icon: CircleX, label: 'failed' },
  canceled: { icon: CircleSlash, label: 'canceled' },
  skipped: { icon: CircleMinus, label: 'skipped' },
};

/** The CI result of a commit, as a coloured icon. */
export function PipelineBadge({ pipeline }: { pipeline: Pipeline }) {
  const { icon: Icon, label } = LOOK[pipeline.state];
  return (
    <span
      className={styles.badge}
      data-state={pipeline.state}
      role="img"
      aria-label={`Pipeline ${label}`}
      title={`Pipeline ${label}`}
    >
      <Icon size={13} aria-hidden />
    </span>
  );
}
