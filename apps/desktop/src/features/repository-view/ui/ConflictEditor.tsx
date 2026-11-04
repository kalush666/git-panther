import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';

import { ipc, unwrap, type ConflictChunk } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { repositoryQueryKey } from '../api/useRepository';
import { useRepositoryMutation } from '../api/useRepositoryMutation';
import styles from './ConflictEditor.module.css';

/** How one conflict is resolved. */
type Choice = 'mine' | 'incoming' | 'mineThenIncoming' | 'incomingThenMine';

const CHOICES: ReadonlyArray<{ choice: Choice; label: string }> = [
  { choice: 'mine', label: 'Use mine' },
  { choice: 'incoming', label: 'Use incoming' },
  { choice: 'mineThenIncoming', label: 'Both, mine first' },
  { choice: 'incomingThenMine', label: 'Both, incoming first' },
];

type Conflict = Extract<ConflictChunk, { kind: 'conflict' }>;

function resolved(conflict: Conflict, choice: Choice | undefined): string {
  switch (choice) {
    case 'mine':
      return conflict.mine;
    case 'incoming':
      return conflict.incoming;
    case 'mineThenIncoming':
      return conflict.mine + conflict.incoming;
    case 'incomingThenMine':
      return conflict.incoming + conflict.mine;
    case undefined:
      // Undecided conflicts keep git's markers so nothing is lost silently.
      return `<<<<<<< mine\n${conflict.mine}=======\n${conflict.incoming}>>>>>>> incoming\n`;
  }
}

/** The file with each conflict resolved as chosen. */
function assemble(chunks: readonly ConflictChunk[], choices: Record<number, Choice>): string {
  return chunks
    .map((chunk, index) => (chunk.kind === 'common' ? chunk.text : resolved(chunk, choices[index])))
    .join('');
}

interface ConflictEditorProps {
  path: string;
  file: string;
  onClose: () => void;
}

/** Resolves a conflicted file conflict by conflict, with an editable result. */
export function ConflictEditor({ path, file, onClose }: ConflictEditorProps) {
  const chunks = useQuery({
    queryKey: [...repositoryQueryKey(path), 'conflictChunks', file],
    queryFn: async () => unwrap(await ipc.conflictChunks(path, file)),
    staleTime: Infinity,
  });
  const save = useRepositoryMutation(path, (content: string) =>
    ipc.resolveConflictWith(path, file, content),
  );
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  // Once the user types in the result it is theirs; choices stop overwriting it.
  const [handEdited, setHandEdited] = useState<string | null>(null);
  const all = chunks.data ?? [];
  const conflicts = all.filter((chunk) => chunk.kind === 'conflict').length;
  const decided = Object.keys(choices).length;
  const result = handEdited ?? assemble(all, choices);

  return (
    <section className={styles.editor} aria-label={`Resolve ${file}`}>
      <header className={styles.toolbar}>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <ArrowLeft size={14} aria-hidden />
          Back
        </Button>
        <span className={styles.file} title={file}>
          {file}
        </span>
        <span className={styles.progress} role="status">
          {decided} of {conflicts} conflicts decided
        </span>
        <Button
          size="sm"
          variant="primary"
          disabled={save.isPending || !chunks.data}
          onClick={() => {
            save.mutate(result, { onSuccess: onClose });
          }}
        >
          Save and mark resolved
        </Button>
      </header>
      <div className={styles.body}>
        {(chunks.error ?? save.error) && (
          <p className={styles.error} role="alert">
            {(chunks.error ?? save.error)?.message}
          </p>
        )}
        <div className={styles.chunks}>
          {all.map((chunk, index) =>
            chunk.kind === 'common' ? (
              <pre key={index} className={styles.common}>
                {chunk.text}
              </pre>
            ) : (
              <section
                key={index}
                className={styles.conflict}
                aria-label={`Conflict ${String(all.slice(0, index + 1).filter((c) => c.kind === 'conflict').length)}`}
              >
                <div className={styles.sides}>
                  <div className={styles.side} data-side="mine">
                    <span className={styles.sideLabel}>Mine</span>
                    <pre className={styles.code}>{chunk.mine}</pre>
                  </div>
                  <div className={styles.side} data-side="incoming">
                    <span className={styles.sideLabel}>Incoming</span>
                    <pre className={styles.code}>{chunk.incoming}</pre>
                  </div>
                </div>
                <div className={styles.choices} role="radiogroup" aria-label="Resolution">
                  {CHOICES.map(({ choice, label }) => (
                    <button
                      key={choice}
                      type="button"
                      role="radio"
                      aria-checked={choices[index] === choice}
                      className={styles.choice}
                      onClick={() => {
                        setHandEdited(null);
                        setChoices({ ...choices, [index]: choice });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            ),
          )}
        </div>
        <label className={styles.resultLabel} htmlFor="conflict-result">
          Result
        </label>
        <textarea
          id="conflict-result"
          className={styles.result}
          spellCheck={false}
          value={result}
          onChange={(event) => {
            setHandEdited(event.target.value);
          }}
        />
      </div>
    </section>
  );
}
