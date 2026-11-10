import * as ContextMenu from '@radix-ui/react-context-menu';

import type { PersonDto } from '../../../shared/ipc';
import { useCommitDetails } from '../api/useGraph';
import { formatCommitTimeLong } from '../model/formatTime';
import styles from './CommitDetailsPanel.module.css';
import { FileChangeList } from './FileChangeList';
import menu from './menu.module.css';

interface CommitDetailsPanelProps {
  path: string;
  commitId: string | null;
  /** Opens the diff of `file` in this commit. */
  onOpenFile: (file: string) => void;
  /** Brings back `file` as it was in this commit, staged. */
  onRestoreFile: (commitId: string, file: string) => void;
  onShowHistory: (file: string) => void;
}

export function CommitDetailsPanel({
  path,
  commitId,
  onOpenFile,
  onRestoreFile,
  onShowHistory,
}: CommitDetailsPanelProps) {
  const details = useCommitDetails(path, commitId);

  if (commitId === null) {
    return (
      <aside data-panel="details" className={styles.panel} aria-label="Commit details">
        <p className={styles.empty}>Select a commit to see its details.</p>
      </aside>
    );
  }
  if (details.isError) {
    return (
      <aside data-panel="details" className={styles.panel} aria-label="Commit details">
        <p className={styles.empty} role="alert">
          {details.error.message}
        </p>
      </aside>
    );
  }
  if (!details.data) {
    return (
      <aside data-panel="details" className={styles.panel} aria-label="Commit details" aria-busy />
    );
  }

  const { message, author, committer, parents, changes, id } = details.data;
  const [subject = '', ...body] = message.split('\n');
  return (
    <aside data-panel="details" className={styles.panel} aria-label="Commit details">
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
      <FileChangeList
        changes={changes}
        onOpenFile={onOpenFile}
        fileMenu={(change) => (
          <>
            {change.kind !== 'deleted' && (
              <ContextMenu.Item
                className={menu.item}
                onSelect={() => {
                  onRestoreFile(id, change.path);
                }}
              >
                Restore this version (staged)
              </ContextMenu.Item>
            )}
            <ContextMenu.Item
              className={menu.item}
              onSelect={() => {
                onShowHistory(change.path);
              }}
            >
              File history
            </ContextMenu.Item>
            <ContextMenu.Item
              className={menu.item}
              onSelect={() => {
                void navigator.clipboard.writeText(change.path);
              }}
            >
              Copy path
            </ContextMenu.Item>
          </>
        )}
      />
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
