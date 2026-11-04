import { Minus, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { ChangedFile, DiffSide } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { ConfirmButton } from '../../../shared/ui/ConfirmButton/ConfirmButton';
import {
  loadHeadMessage,
  useCommitChanges,
  useDiscardFiles,
  useStageFiles,
  useUnstageFiles,
  useWorkingTreeStatus,
} from '../api/useWorkingTree';
import { CHANGE_LETTERS } from '../model/changeLetters';
import { ConflictSection } from './ConflictSection';
import { IdentityControl } from './IdentityControl';
import styles from './StagingPanel.module.css';

/** Git's convention for a readable one-line summary. */
const SUMMARY_SOFT_LIMIT = 72;

interface StagingPanelProps {
  path: string;
  openFile: { file: string; side: DiffSide } | null;
  onOpenFile: (file: string, side: DiffSide) => void;
  /** Opens the conflict editor for a conflicted file. */
  onResolveFile: (file: string) => void;
}

export function StagingPanel({ path, openFile, onOpenFile, onResolveFile }: StagingPanelProps) {
  const status = useWorkingTreeStatus(path);
  const stage = useStageFiles(path);
  const unstage = useUnstageFiles(path);
  const discard = useDiscardFiles(path);
  const actionError = stage.error ?? unstage.error ?? discard.error;

  if (status.isError) {
    return (
      <aside className={styles.panel} aria-label="Working copy">
        <p className={styles.error} role="alert">
          {status.error.message}
        </p>
      </aside>
    );
  }
  const { staged = [], unstaged = [], conflicted = [] } = status.data ?? {};
  const paths = (files: ChangedFile[]) => files.map((file) => file.path);

  return (
    <aside className={styles.panel} aria-label="Working copy">
      <div className={styles.lists}>
        <ConflictSection path={path} conflicted={conflicted} onOpenFile={onResolveFile} />
        <FileSection
          title="Unstaged files"
          files={unstaged}
          side="unstaged"
          openFile={openFile}
          onOpenFile={onOpenFile}
          bulkAction={
            <Button
              size="sm"
              variant="secondary"
              disabled={unstaged.length === 0 || stage.isPending}
              onClick={() => {
                stage.mutate(paths(unstaged));
              }}
            >
              Stage all
            </Button>
          }
          rowActions={(file) => (
            <>
              <ConfirmButton
                bare
                label={`Discard changes to ${file.path}`}
                confirmLabel="Discard?"
                onConfirm={() => {
                  discard.mutate([file.path]);
                }}
              >
                <Trash2 size={13} />
              </ConfirmButton>
              <RowButton
                label={`Stage ${file.path}`}
                onClick={() => {
                  stage.mutate([file.path]);
                }}
              >
                <Plus size={14} />
              </RowButton>
            </>
          )}
        />
        <FileSection
          title="Staged files"
          files={staged}
          side="staged"
          openFile={openFile}
          onOpenFile={onOpenFile}
          bulkAction={
            <Button
              size="sm"
              variant="secondary"
              disabled={staged.length === 0 || unstage.isPending}
              onClick={() => {
                unstage.mutate(paths(staged));
              }}
            >
              Unstage all
            </Button>
          }
          rowActions={(file) => (
            <RowButton
              label={`Unstage ${file.path}`}
              onClick={() => {
                unstage.mutate([file.path]);
              }}
            >
              <Minus size={14} />
            </RowButton>
          )}
        />
        {actionError && (
          <p className={styles.error} role="alert">
            {actionError.message}
          </p>
        )}
      </div>
      <div className={styles.identity}>
        <IdentityControl path={path} />
      </div>
      <CommitBox path={path} stagedCount={staged.length} unstaged={paths(unstaged)} />
    </aside>
  );
}

interface FileSectionProps {
  title: string;
  files: ChangedFile[];
  side: DiffSide;
  openFile: { file: string; side: DiffSide } | null;
  onOpenFile: (file: string, side: DiffSide) => void;
  bulkAction: ReactNode;
  rowActions: (file: ChangedFile) => ReactNode;
}

function FileSection({
  title,
  files,
  side,
  openFile,
  onOpenFile,
  bulkAction,
  rowActions,
}: FileSectionProps) {
  const headingId = `${side}-files-title`;
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <header className={styles.sectionHeader}>
        <h2 id={headingId} className={styles.sectionTitle}>
          {title} ({files.length})
        </h2>
        {bulkAction}
      </header>
      {files.length === 0 ? (
        <p className={styles.empty}>{side === 'staged' ? 'Nothing staged yet.' : 'No changes.'}</p>
      ) : (
        <ul className={styles.files}>
          {files.map((file) => {
            const { letter, label } = CHANGE_LETTERS[file.kind];
            const isOpen = openFile?.file === file.path && openFile.side === side;
            return (
              <li key={file.path} className={styles.file} data-open={isOpen}>
                <button
                  type="button"
                  className={styles.fileButton}
                  title={file.from ? `${file.from} → ${file.path}` : file.path}
                  onClick={() => {
                    onOpenFile(file.path, side);
                  }}
                >
                  <span className={styles.kind} data-kind={file.kind} title={label}>
                    {letter}
                  </span>
                  <span className={styles.path}>{file.path}</span>
                </button>
                <span className={styles.rowActions}>{rowActions(file)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={styles.rowButton}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface CommitBoxProps {
  path: string;
  stagedCount: number;
  /** Committed all at once when nothing is staged. */
  unstaged: string[];
}

function CommitBox({ path, stagedCount, unstaged }: CommitBoxProps) {
  const commit = useCommitChanges(path);
  const stageAll = useStageFiles(path);
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [amend, setAmend] = useState(false);
  // With nothing staged, one click stages everything and commits it.
  const commitsAll = stagedCount === 0 && !amend && unstaged.length > 0;
  const busy = commit.isPending || stageAll.isPending;
  const canCommit = summary.trim() !== '' && (stagedCount > 0 || amend || commitsAll) && !busy;

  const toggleAmend = async (next: boolean) => {
    setAmend(next);
    if (next && summary.trim() === '' && description.trim() === '') {
      const [previousSummary = '', ...body] = (await loadHeadMessage(path)).split('\n');
      setSummary(previousSummary);
      setDescription(body.join('\n').trim());
    }
  };

  const submit = async () => {
    const message = description.trim() ? `${summary.trim()}\n\n${description.trim()}` : summary;
    if (commitsAll) await stageAll.mutateAsync(unstaged);
    commit.mutate(
      { message, amend },
      {
        onSuccess: () => {
          setSummary('');
          setDescription('');
          setAmend(false);
        },
      },
    );
  };

  return (
    <form
      className={styles.commit}
      aria-label="Commit"
      onSubmit={(event) => {
        event.preventDefault();
        if (canCommit) {
          void submit();
        }
      }}
      onKeyDown={(event) => {
        // Ctrl+Enter commits from the summary or the description.
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          if (canCommit) void submit();
        }
      }}
    >
      <label className={styles.amend}>
        <input
          type="checkbox"
          checked={amend}
          onChange={(event) => {
            void toggleAmend(event.target.checked);
          }}
        />
        Amend previous commit
      </label>
      <div className={styles.summaryRow}>
        <input
          id="commit-summary"
          className={styles.summary}
          aria-label="Commit summary"
          placeholder="Commit summary"
          value={summary}
          onChange={(event) => {
            setSummary(event.target.value);
          }}
        />
        <span
          className={styles.counter}
          data-over={summary.length > SUMMARY_SOFT_LIMIT}
          title="Keep summaries under 72 characters"
        >
          {SUMMARY_SOFT_LIMIT - summary.length}
        </span>
      </div>
      <textarea
        className={styles.description}
        aria-label="Commit description"
        placeholder="Description"
        rows={4}
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
        }}
      />
      {commit.error && (
        <p className={styles.error} role="alert">
          {commit.error.message}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={!canCommit}>
        {amend
          ? 'Amend commit'
          : stagedCount > 0
            ? `Commit ${stagedCount} ${stagedCount === 1 ? 'file' : 'files'}`
            : commitsAll
              ? `Stage all and commit ${unstaged.length} ${unstaged.length === 1 ? 'file' : 'files'}`
              : 'Nothing to commit'}
      </Button>
    </form>
  );
}
