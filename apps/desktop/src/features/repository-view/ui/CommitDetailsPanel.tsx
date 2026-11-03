import type { FileChangeDto, PersonDto } from '../../../shared/ipc';
import { useCommitDetails } from '../api/useGraph';
import { formatCommitTimeLong } from '../model/formatTime';
import styles from './CommitDetailsPanel.module.css';

interface CommitDetailsPanelProps {
  path: string;
  commitId: string | null;
  /** Opens the diff of `file` in this commit. */
  onOpenFile: (file: string) => void;
}

const CHANGE_LABELS: Record<FileChangeDto['kind'], { letter: string; label: string }> = {
  added: { letter: 'A', label: 'Added' },
  modified: { letter: 'M', label: 'Modified' },
  deleted: { letter: 'D', label: 'Deleted' },
  renamed: { letter: 'R', label: 'Renamed' },
  typeChanged: { letter: 'T', label: 'Type changed' },
};

export function CommitDetailsPanel({ path, commitId, onOpenFile }: CommitDetailsPanelProps) {
  const details = useCommitDetails(path, commitId);

  if (commitId === null) {
    return (
      <aside className={styles.panel} aria-label="Commit details">
        <p className={styles.empty}>Select a commit to see its details.</p>
      </aside>
    );
  }
  if (details.isError) {
    return (
      <aside className={styles.panel} aria-label="Commit details">
        <p className={styles.empty} role="alert">
          {details.error.message}
        </p>
      </aside>
    );
  }
  if (!details.data) {
    return <aside className={styles.panel} aria-label="Commit details" aria-busy />;
  }

  const { message, author, committer, parents, changes, id } = details.data;
  const [subject = '', ...body] = message.split('\n');
  return (
    <aside className={styles.panel} aria-label="Commit details">
      <h2 className={styles.subject}>{subject}</h2>
      {body.join('\n').trim() && <p className={styles.body}>{body.join('\n').trim()}</p>}
      <dl className={styles.facts}>
        <Fact label="Commit" value={id} mono />
        <PersonFact label="Author" person={author} />
        {(committer.name !== author.name || committer.time !== author.time) && (
          <PersonFact label="Committer" person={committer} />
        )}
        <Fact
          label={parents.length > 1 ? 'Parents' : 'Parent'}
          value={parents.map((parent) => parent.slice(0, 7)).join(', ') || 'None (root commit)'}
          mono
        />
      </dl>
      <h3 className={styles.sectionTitle}>
        {changes.length} changed {changes.length === 1 ? 'file' : 'files'}
      </h3>
      <ul className={styles.changes}>
        {changes.map((change) => {
          const { letter, label } = CHANGE_LABELS[change.kind];
          return (
            <li key={`${change.kind}:${change.path}`}>
              <button
                type="button"
                className={styles.change}
                onClick={() => {
                  onOpenFile(change.path);
                }}
              >
                <span className={styles.changeKind} data-kind={change.kind} title={label}>
                  {letter}
                </span>
                <span className={styles.changePath}>
                  {change.kind === 'renamed' ? `${change.from} → ${change.path}` : change.path}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={mono ? styles.factMono : styles.factValue}>{value}</dd>
    </>
  );
}

function PersonFact({ label, person }: { label: string; person: PersonDto }) {
  return (
    <>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>
        {person.name} <span className={styles.email}>&lt;{person.email}&gt;</span>
        <br />
        <span className={styles.email}>{formatCommitTimeLong(person.time)}</span>
      </dd>
    </>
  );
}
