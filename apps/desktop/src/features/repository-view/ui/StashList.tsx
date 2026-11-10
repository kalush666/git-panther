import * as ContextMenu from '@radix-ui/react-context-menu';
import { Archive, ChevronDown, ChevronRight, FileUp } from 'lucide-react';
import { useState } from 'react';

import type { Stash } from '../../../shared/ipc';
import {
  useApplyStash,
  useApplyStashFile,
  useDropStash,
  useRenameStash,
  useStashes,
  useStashFiles,
} from '../api/useStashes';
import styles from './BranchSidebar.module.css';
import menu from './menu.module.css';

/**
 * The sidebar's Stashes section: apply, pop, rename or drop entries from
 * their menu; open one to see its files and put a single file back.
 */
export function StashList({ path }: { path: string }) {
  const stashes = useStashes(path);
  const apply = useApplyStash(path);
  const drop = useDropStash(path);
  const rename = useRenameStash(path);
  const applyFile = useApplyStashFile(path);
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const entries = stashes.data ?? [];
  const error = stashes.error ?? apply.error ?? drop.error ?? rename.error ?? applyFile.error;

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        <Archive size={13} aria-hidden />
        <span className={styles.sectionTitle}>Stashes</span>
        <span className={styles.count}>{entries.length}</span>
      </button>
      {open && (
        <ul className={styles.tree} aria-label="Stashes">
          {entries.map((stash) => (
            <li key={stash.id}>
              {renaming === stash.id ? (
                <RenameField
                  stash={stash}
                  onDone={(message) => {
                    setRenaming(null);
                    if (message && message !== stash.message) {
                      rename.mutate({ index: stash.index, message });
                    }
                  }}
                />
              ) : (
                <ContextMenu.Root>
                  <ContextMenu.Trigger asChild>
                    <button
                      type="button"
                      className={styles.row}
                      aria-expanded={expanded === stash.id}
                      title={`${stash.message}\nClick for its files, double-click to apply`}
                      onClick={() => {
                        setExpanded(expanded === stash.id ? null : stash.id);
                      }}
                      onDoubleClick={() => {
                        apply.mutate({ index: stash.index, pop: false });
                      }}
                    >
                      <span className={styles.name}>{stash.message}</span>
                    </button>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content
                      className={menu.content}
                      // Actions may open an input; keep focus there, not on the row.
                      onCloseAutoFocus={(event) => {
                        event.preventDefault();
                      }}
                    >
                      <ContextMenu.Item
                        className={menu.item}
                        onSelect={() => {
                          apply.mutate({ index: stash.index, pop: false });
                        }}
                      >
                        Apply stash
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className={menu.item}
                        onSelect={() => {
                          apply.mutate({ index: stash.index, pop: true });
                        }}
                      >
                        Pop stash
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className={menu.item}
                        onSelect={() => {
                          setRenaming(stash.id);
                        }}
                      >
                        Rename…
                      </ContextMenu.Item>
                      <ContextMenu.Separator className={menu.separator} />
                      <ContextMenu.Item
                        className={`${menu.item} ${menu.danger}`}
                        onSelect={() => {
                          drop.mutate(stash.index);
                        }}
                      >
                        Drop stash
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              )}
              {expanded === stash.id && (
                <StashFiles
                  path={path}
                  stash={stash}
                  onApplyFile={(file) => {
                    applyFile.mutate({ index: stash.index, file });
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )}
    </section>
  );
}

function RenameField({
  stash,
  onDone,
}: {
  stash: Stash;
  onDone: (message: string | null) => void;
}) {
  const [value, setValue] = useState(stash.message.replace(/^On [^:]+: /, ''));
  return (
    <input
      className={styles.renameInput}
      aria-label="Stash name"
      value={value}
      autoFocus
      onFocus={(event) => {
        event.target.select();
      }}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onBlur={() => {
        onDone(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onDone(value.trim() || null);
        else if (event.key === 'Escape') onDone(null);
      }}
    />
  );
}

/** A stash's files, each of which can be put back on its own. */
function StashFiles({
  path,
  stash,
  onApplyFile,
}: {
  path: string;
  stash: Stash;
  onApplyFile: (file: string) => void;
}) {
  const files = useStashFiles(path, stash.index);
  return (
    <ul className={styles.stashFiles} aria-label={`Files in ${stash.message}`}>
      {files.data?.map((file) => (
        <li key={file} className={styles.stashFile}>
          <span className={styles.name} title={file}>
            {file}
          </span>
          <button
            type="button"
            className={styles.sectionAction}
            aria-label={`Restore ${file} from this stash`}
            title="Put this file's stashed version back; the stash stays"
            onClick={() => {
              onApplyFile(file);
            }}
          >
            <FileUp size={13} aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
