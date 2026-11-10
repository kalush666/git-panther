import { CircleCheck, LoaderCircle, TriangleAlert, Undo2, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../../shared/ui/Button/Button';
import styles from './OutcomeBanner.module.css';

/** A button offered with a result, e.g. "Stash changes and switch". */
export interface OutcomeAction {
  label: string;
  run: () => void;
}

export interface Outcome {
  tone: 'done' | 'error';
  message: string;
  action?: OutcomeAction;
}

interface OutcomeBannerProps {
  /** What is running now, e.g. "Rebasing onto develop…". */
  running: string | null;
  outcome: Outcome | null;
  undoLabel: string | null;
  onUndo: () => void;
  onDismiss: () => void;
}

/**
 * The strip under the header that says what Git Panther is doing and how it
 * went: a spinner while it works, a tick and Undo when done, and for an error
 * a plain-language line, git's own words under "Details", and the next step.
 */
export function OutcomeBanner({
  running,
  outcome,
  undoLabel,
  onUndo,
  onDismiss,
}: OutcomeBannerProps) {
  if (running) {
    return (
      <div className={styles.banner} data-tone="running" role="status">
        <LoaderCircle size={16} className={styles.spin} aria-hidden />
        <span className={styles.title}>{running}</span>
      </div>
    );
  }
  if (!outcome) return null;
  return (
    <Result
      key={outcome.message}
      outcome={outcome}
      undoLabel={undoLabel}
      onUndo={onUndo}
      onDismiss={onDismiss}
    />
  );
}

function Result({
  outcome,
  undoLabel,
  onUndo,
  onDismiss,
}: {
  outcome: Outcome;
  undoLabel: string | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const { title, details } = splitMessage(outcome.message);
  const isError = outcome.tone === 'error';
  const Icon = isError ? TriangleAlert : CircleCheck;
  return (
    <div className={styles.banner} data-tone={outcome.tone} role={isError ? 'alert' : 'status'}>
      <Icon size={16} className={styles.icon} aria-hidden />
      <div className={styles.text}>
        <span className={styles.title}>{title}</span>
        {details && showDetails && <pre className={styles.details}>{details}</pre>}
      </div>
      {details && (
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={showDetails}
          onClick={() => {
            setShowDetails(!showDetails);
          }}
        >
          {showDetails ? 'Hide details' : 'Details'}
        </Button>
      )}
      {outcome.action && (
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            outcome.action?.run();
          }}
        >
          {outcome.action.label}
        </Button>
      )}
      {!isError && undoLabel && (
        <Button size="sm" variant="ghost" onClick={onUndo}>
          <Undo2 size={14} aria-hidden />
          Undo
        </Button>
      )}
      <button type="button" className={styles.dismiss} aria-label="Dismiss" onClick={onDismiss}>
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

/** Git's own output starts with words like these; it goes under Details. */
const GIT_OUTPUT = /\n|\b(?:error|fatal|hint|warning|CONFLICT|Auto-merging):/;

/**
 * The plain-language part of a message, and git's raw output after it:
 * "Your changes would be overwritten.\nerror: …" → title and details.
 */
export function splitMessage(message: string): { title: string; details: string | null } {
  const match = GIT_OUTPUT.exec(message);
  if (!match || match.index === 0) {
    const [first = message, ...rest] = message.split('\n');
    const details = rest.join('\n').trim();
    return { title: first.trim(), details: details || null };
  }
  const details = message.slice(match.index).trim();
  return { title: message.slice(0, match.index).trim(), details: details || null };
}
